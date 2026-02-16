'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ensureDefaultAccount } from '@/lib/ensureAccount'

export default function NewTradePage() {
  const [symbol, setSymbol] = useState('')
  const [instrument, setInstrument] = useState<'Stock'|'ETF'>('Stock')
  const [openedAt, setOpenedAt] = useState(() => new Date().toISOString().slice(0,10))
  const [stopLoss, setStopLoss] = useState<string>('')
  const [risk, setRisk] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [nextNo, setNextNo] = useState<number | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // next trade number = max(trade_no)+1
      const { data, error } = await supabase
        .from('trades')
        .select('trade_no')
        .order('trade_no', { ascending: false })
        .limit(1)
      if (!error) {
        const last = (data && data.length > 0) ? (data[0] as any).trade_no : 0
        setNextNo((last ?? 0) + 1)
      }
    })()
  }, [])

  async function create() {
    setBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const acct = await ensureDefaultAccount(user.id)

      const trade_no = nextNo ?? Date.now()
      const { data, error } = await supabase
        .from('trades')
        .insert({
          user_id: user.id,
          account_id: acct.id,
          trade_no,
          symbol: symbol.trim().toUpperCase(),
          instrument,
          side: 'Long',
          status: 'OPEN',
          opened_at: openedAt,
          stop_loss: stopLoss ? Number(stopLoss) : null,
          risk: risk ? Number(risk) : null
        })
        .select('*')
        .single()
      if (error) throw error
      window.location.href = `/trades/${(data as any).id}`
    } catch (e: any) {
      alert(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <div className="nav">
        <Link href="/trades">Back</Link>
      </div>

      <div className="card" style={{maxWidth: 520}}>
        <h2 style={{marginTop:0}}>New trade</h2>
        <p className="small">Trade # will default to {nextNo ?? '…'}; you can change it later.</p>

        <div style={{display:'grid', gap: 10}}>
          <label className="small">Symbol</label>
          <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="AAPL" />

          <label className="small">Instrument</label>
          <select value={instrument} onChange={e => setInstrument(e.target.value as any)}>
            <option value="Stock">Stock</option>
            <option value="ETF">ETF</option>
          </select>

          <label className="small">Opened date</label>
          <input type="date" value={openedAt} onChange={e => setOpenedAt(e.target.value)} />

          <label className="small">Initial stop loss (optional)</label>
          <input value={stopLoss} onChange={e => setStopLoss(e.target.value)} placeholder="129.41" />

          <label className="small">Initial risk in $ (optional)</label>
          <input value={risk} onChange={e => setRisk(e.target.value)} placeholder="5.00" />

          <button className="primary" disabled={busy || !symbol.trim()} onClick={create}>
            {busy ? 'Creating…' : 'Create trade'}
          </button>
        </div>
      </div>
    </div>
  )
}
