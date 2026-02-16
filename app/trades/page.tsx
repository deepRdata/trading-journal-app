'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Trade } from '@/lib/types'

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

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    ; (async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .order('opened_at', { ascending: false })
        .limit(500)

      if (error) {
        console.error(error)
      } else {
        setTrades((data as any) ?? [])
      }
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase()
    if (!s) return trades
    return trades.filter(t =>
      (t.symbol ?? '').toUpperCase().includes(s) || String(t.trade_no ?? '').includes(s)
    )
  }, [trades, q])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="container">
      <div className="nav">
        <Link href="/">Home</Link>
        <Link href="/import">Import Excel</Link>
        <Link href="/broker">Broker Sync</Link>
        <button onClick={signOut}>Sign out</button>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Trades</h2>
          <Link href="/trades/new"><button className="primary">New trade</button></Link>
        </div>

        <div style={{ marginTop: 12 }}>
          <input
            placeholder="Search symbol or trade #"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="small">Loading…</p>
        ) : (
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Symbol</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Closed</th>
                <th>P/L</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id}>
                  <td>{t.trade_no}</td>
                  <td><b>{t.symbol}</b></td>
                  <td>{t.status}</td>
                  <td>{t.opened_at?.slice(0, 10)}</td>
                  <td>{t.closed_at?.slice(0, 10) ?? ''}</td>
                  <td>{fmtMoney(t.pnl)}</td>
                  <td><Link href={`/trades/${t.id}`}>Open</Link></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="small">No trades found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
