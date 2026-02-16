import { NextResponse } from 'next/server'
import { serverSupabase } from '@/lib/serverSupabase'
import { getAndRefreshSchwabToken, schwabGet } from '@/lib/schwabServer'
import { buildLedger } from '@/lib/ledger'
import type { Execution } from '@/lib/types'

type Fill = {
  broker_exec_id: string | null
  broker_order_id: string | null
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  executed_at: string // ISO
}

function toIsoZ(d: Date) {
  // Schwab APIs generally accept ISO 8601 with Z
  return d.toISOString()
}

function parseTradeFillsFromTransactions(transactions: any[]): Fill[] {
  const out: Fill[] = []
  for (const t of transactions ?? []) {
    // We only want trade executions.
    const type = (t?.type ?? t?.transactionType ?? '').toString().toUpperCase()
    if (type && type !== 'TRADE') continue

    const when = t?.tradeDate ?? t?.transactionDate ?? t?.time ?? t?.settlementDate
    const executed_at = when ? new Date(when).toISOString() : new Date().toISOString()

    // Schwab seems to return legs/items for each transaction. We try multiple shapes.
    const items = t?.transferItems ?? t?.transactionItem ? [t.transactionItem] : null
    const legs = Array.isArray(items) ? items : Array.isArray(t?.items) ? t.items : Array.isArray(t?.orderLegCollection) ? t.orderLegCollection : []

    if (!legs.length) {
      // Fallback: attempt to infer symbol & amount from top-level fields.
      const sym = (t?.symbol ?? t?.instrument?.symbol ?? '').toString().toUpperCase()
      if (!sym) continue
      const qty = Number(t?.amount ?? t?.quantity ?? 0)
      const price = Number(t?.price ?? (qty ? (Number(t?.netAmount ?? t?.amount ?? 0) / qty) : 0))
      if (!qty || !price) continue
      const side: 'BUY' | 'SELL' = qty > 0 ? 'BUY' : 'SELL'
      out.push({
        broker_exec_id: t?.transactionId?.toString?.() ?? t?.id?.toString?.() ?? null,
        broker_order_id: t?.orderId?.toString?.() ?? null,
        symbol: sym,
        side,
        quantity: Math.abs(qty),
        price: Math.abs(price),
        executed_at
      })
      continue
    }

    for (const it of legs) {
      const sym = (it?.instrument?.symbol ?? it?.instrument?.underlyingSymbol ?? it?.symbol ?? t?.symbol ?? '').toString().toUpperCase()
      if (!sym) continue
      const qtyRaw = Number(it?.amount ?? it?.quantity ?? it?.qty ?? 0)
      const qty = Math.abs(qtyRaw)
      if (!qty) continue
      const px = Number(it?.price ?? t?.price ?? 0)
      const price = px ? Math.abs(px) : Math.abs(Number(t?.netAmount ?? 0) / qty)
      if (!price) continue

      // Direction inference:
      // - Some shapes have instruction (BUY/SELL)
      // - Otherwise amount sign: positive = BUY, negative = SELL
      const instr = (it?.instruction ?? it?.action ?? '').toString().toUpperCase()
      let side: 'BUY' | 'SELL' | null = null
      if (instr.includes('BUY')) side = 'BUY'
      if (instr.includes('SELL')) side = 'SELL'
      if (!side) side = qtyRaw >= 0 ? 'BUY' : 'SELL'

      out.push({
        broker_exec_id: (t?.transactionId ?? t?.id ?? null)?.toString?.() ?? null,
        broker_order_id: (t?.orderId ?? null)?.toString?.() ?? null,
        symbol: sym,
        side,
        quantity: qty,
        price,
        executed_at
      })
    }
  }
  // sort old -> new
  out.sort((a, b) => a.executed_at.localeCompare(b.executed_at))
  return out
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing supabase auth' }, { status: 401 })
  }
  const token = auth.replace('Bearer ', '').trim()

  const sb = serverSupabase()
  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 401 })
  }
  const user = userData.user

  const body = await req.json().catch(() => ({}))
  const accountId = body.account_id as string | undefined
  const mode = (body.mode as string | undefined) ?? 'recent' // 'recent' | 'all'
  if (!accountId) {
    return NextResponse.json({ error: 'Missing account_id' }, { status: 400 })
  }

  const tok = await getAndRefreshSchwabToken(user.id, accountId)
  let accountHash = tok.raw?.account_hash as string | null
  if (!accountHash) {
    const nums = await schwabGet<any[]>(tok.access_token, '/trader/v1/accounts/accountNumbers')
    const first = Array.isArray(nums) && nums.length ? nums[0] : null
    accountHash = first?.hashValue ?? first?.encryptedAccountId ?? null
    await sb.from('broker_tokens').update({ raw: { ...(tok.raw ?? {}), account_hash: accountHash, account_number: first?.accountNumber ?? null } })
      .eq('user_id', user.id).eq('account_id', accountId).eq('broker', 'SCHWAB')
  }
  if (!accountHash) {
    return NextResponse.json({ error: 'Unable to resolve Schwab account hash. Try reconnecting.' }, { status: 400 })
  }

  // Determine time windows (Schwab transactions appear to allow up to 1 year range per request).
  const now = new Date()
  const windows: { start: Date; end: Date }[] = []

  if (mode === 'all') {
    // Step backwards in 1-year chunks. Stop after 10 years to avoid runaway API calls.
    let end = now
    for (let i = 0; i < 10; i++) {
      const start = new Date(end.getTime())
      start.setUTCFullYear(start.getUTCFullYear() - 1)
      windows.push({ start, end })
      end = start
    }
  } else {
    const start = new Date(now.getTime())
    start.setUTCDate(start.getUTCDate() - 180)
    windows.push({ start, end: now })
  }

  // Pull transactions and parse fills
  const allFills: Fill[] = []
  for (const w of windows) {
    const tx = await schwabGet<any[]>(tok.access_token, `/trader/v1/accounts/${accountHash}/transactions`, {
      startDateTime: toIsoZ(w.start),
      endDateTime: toIsoZ(w.end),
      types: 'TRADE'
    })
    const fills = parseTradeFillsFromTransactions(tx)
    allFills.push(...fills)
  }

  // De-dup by broker_exec_id + executed_at + symbol + qty + price (since broker_exec_id may be coarse)
  const seen = new Set<string>()
  const fills = allFills.filter(f => {
    const k = `${f.broker_exec_id ?? 'na'}|${f.executed_at}|${f.symbol}|${f.side}|${f.quantity}|${f.price}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  // Load any OPEN trades so we can continue appending fills into them.
  const { data: openTrades } = await sb.from('trades')
    .select('id,symbol,account_id,trade_no')
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .eq('status', 'OPEN')

  const openBySymbol = new Map<string, { trade_id: string; trade_no: number }>()
  for (const t of (openTrades ?? []) as any[]) {
    openBySymbol.set((t.symbol ?? '').toUpperCase(), { trade_id: t.id, trade_no: t.trade_no })
  }

  // For each open trade, compute current position by reading its executions.
  const positionBySymbol = new Map<string, number>()
  const execCacheByTrade = new Map<string, Execution[]>()

  for (const [sym, info] of openBySymbol.entries()) {
    const { data: exRows } = await sb.from('executions').select('*').eq('trade_id', info.trade_id).order('executed_at', { ascending: true })
    const exs = (exRows ?? []) as any as Execution[]
    execCacheByTrade.set(info.trade_id, exs)
    const led = buildLedger(exs)
    const last = led.length ? led[led.length - 1] : null
    positionBySymbol.set(sym, last?.position ?? 0)
  }

  // Determine next trade number
  const { data: maxRow } = await sb.from('trades').select('trade_no').eq('user_id', user.id).order('trade_no', { ascending: false }).limit(1)
  let nextTradeNo = (maxRow && maxRow.length ? Number((maxRow as any)[0].trade_no) : 0) + 1

  let insertedExecs = 0
  let createdTrades = 0
  let closedTrades = 0
  const touchedTrades = new Set<string>()

  for (const f of fills) {
    const sym = f.symbol.toUpperCase()

    // Skip if this exact exec already exists (uses partial unique index if you applied it; also works via select).
    if (f.broker_exec_id) {
      const { data: existing } = await sb
        .from('executions')
        .select('id')
        .eq('account_id', accountId)
        .eq('broker_exec_id', f.broker_exec_id)
        .limit(1)
      if (existing && existing.length) continue
    }

    let tradeInfo = openBySymbol.get(sym)
    if (!tradeInfo) {
      // create trade
      const openedAt = f.executed_at.slice(0, 10)
      const { data: t, error: e1 } = await sb.from('trades').insert({
        user_id: user.id,
        account_id: accountId,
        trade_no: nextTradeNo++,
        symbol: sym,
        instrument: 'Stock',
        side: 'Long',
        status: 'OPEN',
        opened_at: openedAt
      }).select('id,trade_no,symbol').single()
      if (e1 || !t) throw new Error(e1?.message ?? 'Failed to create trade')
      tradeInfo = { trade_id: (t as any).id, trade_no: (t as any).trade_no }
      openBySymbol.set(sym, tradeInfo)
      positionBySymbol.set(sym, 0)
      execCacheByTrade.set(tradeInfo.trade_id, [])
      createdTrades++
    }

    const currentPos = positionBySymbol.get(sym) ?? 0
    const nextPos = f.side === 'BUY' ? currentPos + f.quantity : currentPos - f.quantity
    const action = f.side === 'BUY'
      ? (currentPos === 0 ? 'Entry' : 'Add')
      : (nextPos === 0 ? 'Final Exit' : 'Partial Exit')

    const { data: ins, error: e2 } = await sb.from('executions').insert({
      trade_id: tradeInfo.trade_id,
      account_id: accountId,
      symbol: sym,
      side: f.side,
      quantity: f.quantity,
      price: f.price,
      executed_at: f.executed_at,
      broker_exec_id: f.broker_exec_id,
      broker_order_id: f.broker_order_id,
      action
    }).select('*').single()
    if (e2) {
      // If a unique index is present, duplicates may hit here.
      continue
    }
    insertedExecs++
    touchedTrades.add(tradeInfo.trade_id)
    positionBySymbol.set(sym, nextPos)

    // update cache + close trade if flat
    const cached = execCacheByTrade.get(tradeInfo.trade_id) ?? []
    cached.push(ins as any)
    cached.sort((a, b) => (a.executed_at as any).localeCompare(b.executed_at))
    execCacheByTrade.set(tradeInfo.trade_id, cached)

    if (nextPos === 0) {
      const led = buildLedger(cached)
      const last = led[led.length - 1]
      await sb.from('trades').update({
        status: 'CLOSED',
        closed_at: f.executed_at.slice(0, 10),
        pnl: last?.realizedPnl ?? null
      }).eq('id', tradeInfo.trade_id)
      closedTrades++
      // clear open state so next buy becomes a new trade (your re-entry rule)
      openBySymbol.delete(sym)
      positionBySymbol.set(sym, 0)
    }
  }

  return NextResponse.json({
    ok: true,
    windows: windows.length,
    fills_seen: fills.length,
    trades_created: createdTrades,
    executions_inserted: insertedExecs,
    trades_closed: closedTrades,
    touched_trades: Array.from(touchedTrades).length
  })
}
