'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { buildLedger } from '@/lib/ledger'
import { ensureDefaultAccount } from '@/lib/ensureAccount'
import { recomputeExecutionActions } from '@/lib/recomputeActions'
import type { Execution, Trade } from '@/lib/types'

const moneyUSD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function fmtMoney(x: any): string {
  if (x == null || x === '') return ''
  const n = Number(x)
  if (!Number.isFinite(n)) return ''
  return moneyUSD.format(n)
}

function fmt2(x: any): string {
  if (x == null || x === '') return ''
  const n = Number(x)
  if (!Number.isFinite(n)) return ''
  return n.toFixed(2)
}

function fmtDateTimeLocal(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  // Example: 2026-01-30 15:01
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TradeDetail({ params }: { params: { id: string } }) {
  const [trade, setTrade] = useState<Trade | null>(null)
  const [execs, setExecs] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: t, error: te } = await supabase
      .from('trades')
      .select('*')
      .eq('id', params.id)
      .single()
    if (te) console.error(te)
    setTrade((t as any) ?? null)

    const { data: e, error: ee } = await supabase
      .from('executions')
      .select('*')
      .eq('trade_id', params.id)
      .order('executed_at', { ascending: true })
    if (ee) console.error(ee)
    setExecs((e as any) ?? [])

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const ledger = useMemo(() => buildLedger(execs), [execs])
  const lastLedger = ledger.length ? ledger[ledger.length - 1] : null

  // What to show in the top “Realized P/L” box:
  // 1) If trade.pnl exists, show that (it's your Excel truth for the trade)
  // 2) Otherwise fall back to computed ledger realized
  const realizedTop = trade?.pnl != null ? fmtMoney(trade.pnl) : (lastLedger?.realizedPnl != null ? fmtMoney(lastLedger.realizedPnl) : '')

  async function addExecution(side: 'BUY' | 'SELL', quantity: number, price: number, executedAtISO: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const acct = await ensureDefaultAccount(user.id)

    const { error } = await supabase.from('executions').insert({
      trade_id: params.id,
      account_id: acct.id,
      symbol: trade?.symbol ?? '',
      side,
      quantity,
      price,
      executed_at: executedAtISO,
      action: 'Entry'
    })
    if (error) {
      console.error(error)
      return
    }
    await recomputeExecutionActions(params.id)
    await load()
  }

  async function deleteExecution(exId: string) {
    await supabase.from('executions').delete().eq('id', exId)
    await recomputeExecutionActions(params.id)
    await load()
  }

  if (loading) return <div className="container"><p className="small">Loading…</p></div>
  if (!trade) return <div className="container"><p className="small">Trade not found.</p></div>

  return (
    <div className="container">
      <div className="nav">
        <Link href="/trades">Back to trades</Link>
        <Link href="/import">Import Excel</Link>
        <Link href="/broker">Broker Sync</Link>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Trade #{trade.trade_no} — {trade.symbol}</h2>
          <div className="small">Status: {trade.status}</div>
        </div>

        <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="small">Opened</div>
            <input value={trade.opened_at?.slice(0, 10) ?? ''} readOnly />
          </div>
          <div>
            <div className="small">Closed</div>
            <input value={trade.closed_at?.slice(0, 10) ?? ''} readOnly />
          </div>
          <div>
            <div className="small">Stop Loss</div>
            <input value={trade.stop_loss ?? ''} readOnly />
          </div>
          <div>
            <div className="small">Risk ($)</div>
            <input value={trade.risk ?? ''} readOnly />
          </div>
          <div>
            <div className="small">Realized P/L</div>
            <input value={realizedTop} readOnly />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Executions ledger (rows like your Excel)</h3>
        <AddExecutionForm onAdd={addExecution} />

        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Action</th>
              <th>Time</th>
              <th>Side</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Avg Price</th>
              <th>Position</th>
              <th>Position Size</th>
              <th>Realized P/L</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((r, idx) => {
              const prevPos = idx === 0 ? 0 : ledger[idx - 1].position
              const exSide = r.ex.side
              let displayAction = r.ex.action ?? ''

              // Override/normalize action based on the running position (fixes “Partial Exit” showing twice)
              if (exSide === 'BUY') {
                displayAction = prevPos === 0 ? 'Entry' : 'Add'
              } else {
                // SELL
                displayAction = r.position === 0 ? 'Final Exit' : 'Partial Exit'
              }

              return (
                <tr key={r.ex.id}>
                  <td>{displayAction}</td>
                  <td>{fmtDateTimeLocal(r.ex.executed_at)}</td>
                  <td>{exSide}</td>
                  <td>{Number.isFinite(Number(r.ex.quantity)) ? Number(r.ex.quantity) : ''}</td>
                  <td>{fmt2(r.ex.price)}</td>
                  <td>{r.avgPrice != null ? fmt2(r.avgPrice) : ''}</td>
                  <td>{r.position}</td>
                  <td>{r.positionSize != null ? fmtMoney(r.positionSize) : ''}</td>
                  <td>{r.realizedPnl != null ? fmtMoney(r.realizedPnl) : ''}</td>
                  <td>
                    <button className="danger" onClick={() => deleteExecution(r.ex.id)}>Delete</button>
                  </td>
                </tr>
              )
            })}
            {ledger.length === 0 && (
              <tr><td colSpan={10} className="small">No executions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Journal fields (manual)</h3>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="small">Setup</div>
            <input value={trade.setup ?? ''} readOnly />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="small">Entry Method</div>
            <input value={trade.entry_method ?? ''} readOnly />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="small">Exit Method</div>
            <input value={trade.exit_method ?? ''} readOnly />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small">News</div>
          <input value={trade.news ?? ''} readOnly />
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small">Notes</div>
          <textarea value={trade.notes ?? ''} readOnly style={{ width: '100%', height: 120 }} />
        </div>
      </div>
    </div>
  )
}

function AddExecutionForm({ onAdd }: { onAdd: (side: 'BUY' | 'SELL', quantity: number, price: number, executedAtISO: string) => void }) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [ts, setTs] = useState(() => {
    const d = new Date()
    // keep local datetime for the <input type="datetime-local">
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  return (
    <div className="row" style={{ gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
      <div>
        <div className="small">Side</div>
        <select value={side} onChange={e => setSide(e.target.value as any)}>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
      </div>
      <div>
        <div className="small">Qty</div>
        <input value={qty} onChange={e => setQty(e.target.value)} />
      </div>
      <div>
        <div className="small">Price</div>
        <input value={price} onChange={e => setPrice(e.target.value)} />
      </div>
      <div>
        <div className="small">Executed at</div>
        <input type="datetime-local" value={ts} onChange={e => setTs(e.target.value)} />
      </div>
      <button className="primary" onClick={() => {
        if (!qty || !price) return
        // Convert local datetime-local string to ISO
        const iso = new Date(ts).toISOString()
        onAdd(side, Number(qty), Number(price), iso)
        setQty('')
        setPrice('')
      }}>Add</button>
    </div>
  )
}
