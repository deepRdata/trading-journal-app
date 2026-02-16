'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import { ensureDefaultAccount } from '@/lib/ensureAccount'
import { recomputeExecutionActions } from '@/lib/recomputeActions'

type Row = Record<string, any>

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheet, setSheet] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const summary = useMemo(() => {
    if (!rows.length) return null
    const trades = new Set(rows.map(r => String(r['Trade ID']).trim()).filter(Boolean))
    return {
      rowCount: rows.length,
      tradeCount: trades.size
    }
  }, [rows])

  async function loadFile(f: File) {
    const data = await f.arrayBuffer()
    const wb = XLSX.read(data)
    setWorkbook(wb)
    setSheetNames(wb.SheetNames)
    const defaultSheet =
      wb.SheetNames.find(s => /JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC/i.test(s)) ??
      wb.SheetNames[0]
    setSheet(defaultSheet)
    loadSheet(wb, defaultSheet)
  }

  function loadSheet(wb: XLSX.WorkBook, name: string) {
    const ws = wb.Sheets[name]

    // Find the actual header row (the one that contains "Trade ID" and "Symbol")
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][]
    const headerRowIdx = findHeaderRowIndex(matrix)

    const json = XLSX.utils.sheet_to_json(ws, {
      defval: null,
      range: headerRowIdx >= 0 ? headerRowIdx : 0
    }) as Row[]

    // Only keep rows that have Trade ID and Symbol
    const clean = json
      .map(normalizeKeys)
      .filter(r => r['Trade ID'] != null && r['Symbol'] != null)

    setRows(clean)
    if (!clean.length) {
      setMsg(
        'No trade rows found on this sheet. Make sure you selected a month tab (e.g., JAN26) and that the header row includes "Trade ID" and "Symbol".'
      )
    } else {
      setMsg('')
    }
  }

  async function importIntoSupabase() {
    if (!rows.length) return
    setBusy(true)
    setMsg('')
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const acct = await ensureDefaultAccount(user.id)

      // Group by Trade ID (your sequential counter)
      const byTrade: Map<number, Row[]> = new Map()
      for (const r of rows) {
        const n = Number(r['Trade ID'])
        if (!Number.isFinite(n)) continue
        if (!byTrade.has(n)) byTrade.set(n, [])
        byTrade.get(n)!.push(r)
      }

      // Create trades
      const createdTradeIds: { trade_no: number; id: string }[] = []
      for (const [trade_no, rs] of byTrade.entries()) {
        rs.sort((a, b) =>
          String(a['EntryDateTime'] ?? a['Date']).localeCompare(String(b['EntryDateTime'] ?? b['Date']))
        )

        const symbol = String(rs[0]['Symbol']).toUpperCase()
        const instrument = String(rs[0]['Instrument'] ?? 'Stock')
        const opened_at = toISODate(rs[0]['EntryDateTime'] ?? rs[0]['Date'])

        // last row holds journal fields
        const last = rs[rs.length - 1]
        const lastAction = String(last['Action'] ?? '').toLowerCase()
        const status = lastAction.includes('sell') || lastAction.includes('final') ? 'CLOSED' : 'OPEN'

        const { data, error } = await supabase
          .from('trades')
          .insert({
            user_id: user.id,
            account_id: acct.id,
            trade_no,
            symbol,
            instrument: instrument === 'ETF' ? 'ETF' : 'Stock',
            side: 'Long',
            status,
            opened_at,
            closed_at: last['ExitDateTime'] ? toISODate(last['ExitDateTime']) : null,
            setup: last['Setup'] ?? null,
            entry_method: last['Entry Method'] ?? null,
            exit_method: last['Exit Method'] ?? null,
            stop_loss: num(last['Stop Loss']),
            risk: num(last['Risk']),
            risk_multi: num(last['Risk Multi']),
            adr_pct: num(last['ADR%']),
            atr_pct: num(last['ATR%']),
            lod_pct: num(last['LoD%']),
            rvol: num(last['RVOL']),
            rs: num(last['RS']),
            bqi_regime: last['BQI Regime'] ?? null,
            bqi_swing: num(last['BQI Swing']),
            bqi_avg: num(last['BQI Avg']),
            highest_high: num(last['Highest High']),
            lowest_low: num(last['Lowest Low']),
            news: last['News'] ?? null,
            length_days: num(last['Length of Trade (Days)']),
            notes: last['Notes'] ?? null,
            pnl: num(last['P/L'])
          })
          .select('id')
          .single()

        if (error) throw error
        createdTradeIds.push({ trade_no, id: (data as any).id })
      }

      // Create executions
      for (const { trade_no, id: trade_id } of createdTradeIds) {
        const rs = byTrade.get(trade_no)!
        for (const r of rs) {
          const actionRaw = String(r['Action'] ?? '').trim().toLowerCase()

          // Treat "long" as a BUY entry (this is the key fix)
          const isBuy =
            actionRaw.includes('buy') ||
            actionRaw.includes('long') ||
            actionRaw.includes('entry') ||
            actionRaw.includes('add')

          // Everything else becomes SELL (sell / partial exit / final exit)
          const side = isBuy ? 'BUY' : 'SELL'

          // Use EntryDateTime for BUYs, ExitDateTime for SELLs (fixes weird timestamps)
          const executed_at = toISODatetime(
            isBuy
              ? (r['EntryDateTime'] ?? r['Date'])
              : (r['ExitDateTime'] ?? r['Date'])
          )

          const { error } = await supabase.from('executions').insert({
            trade_id,
            account_id: acct.id, // ✅ FIXED: was acct_id (undefined)
            symbol: String(r['Symbol']).toUpperCase(),
            side,
            quantity: num(r['Quantity']) ?? 0,
            price: num(r['Price']) ?? 0,
            executed_at,

            // ✅ NEW: store these so the UI can show correct columns
            pnl: num(r['P/L']) ?? null,
            position_size: num(r['Position Size']) ?? null,

            // will be recomputed after insert
            action: 'Imported'
          })

          if (error) throw error
        }

        await recomputeExecutionActions(trade_id)
      }

      setMsg(`Imported ${byTrade.size} trades and ${rows.length} rows into Supabase.`)
    } catch (e: any) {
      setMsg(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <div className="nav">
        <Link href="/">Home</Link>
        <Link href="/trades">Trades</Link>
        <Link href="/broker">Broker Sync</Link>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Import your existing Excel journal</h2>
        <p className="small">
          This importer expects sheets that look like your current journal template (columns like Trade ID, Symbol,
          Quantity, Price, EntryDateTime/ExitDateTime...).
        </p>

        <input
          type="file"
          accept=".xlsx"
          onChange={async e => {
            const f = e.target.files?.[0]
            if (!f) return
            setFile(f)
            await loadFile(f)
          }}
        />

        {workbook && (
          <div style={{ marginTop: 12 }}>
            <div className="small">Sheet</div>
            <select
              value={sheet}
              onChange={e => {
                const name = e.target.value
                setSheet(name)
                loadSheet(workbook, name)
              }}
            >
              {sheetNames.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {summary && (
          <div style={{ marginTop: 12 }} className="small">
            Detected {summary.tradeCount} trades across {summary.rowCount} rows.
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button className="primary" disabled={!rows.length || busy} onClick={importIntoSupabase}>
            {busy ? 'Importing…' : 'Import into app'}
          </button>
        </div>

        {msg && (
          <div style={{ marginTop: 12 }} className="small">
            {msg}
          </div>
        )}
      </div>
    </div>
  )
}

function num(x: any): number | null {
  if (x == null || x === '') return null
  if (typeof x === 'number') return x
  const s = String(x).replace(/[$,%]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function toISODate(x: any): string {
  const d = new Date(toISODatetime(x))
  return d.toISOString().slice(0, 10)
}

function toISODatetime(x: any): string {
  if (!x) return new Date().toISOString()
  if (typeof x === 'string') {
    const s = x.trim()
    if (s.includes('T')) {
      const d = new Date(s)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  if (typeof x === 'number') {
    const d = XLSX.SSF.parse_date_code(x)
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, d.S)).toISOString()
  }
  const d = new Date(x)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function findHeaderRowIndex(matrix: any[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 60); i++) {
    const row = matrix[i] ?? []
    const cells = row.map(v => String(v ?? '').trim().toLowerCase())
    if (cells.includes('trade id') && cells.includes('symbol')) return i
  }
  return -1
}

function normalizeKeys(r: Row): Row {
  const out: Row = {}
  for (const k of Object.keys(r)) out[String(k).trim()] = r[k]
  return out
}
