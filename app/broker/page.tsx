'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ensureDefaultAccount } from '@/lib/ensureAccount'

export default function BrokerPage() {
  const [accountId, setAccountId] = useState<string>('')
  const [msg, setMsg] = useState<string>('')
  const [syncMsg, setSyncMsg] = useState<string>('')
  const [syncing, setSyncing] = useState<boolean>(false)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const acct = await ensureDefaultAccount(user.id)
      setAccountId(acct.id)
    })()
  }, [])

  async function connect() {
    if (!accountId) return
    // Save account id so callback can read it
    localStorage.setItem('schwab_account_id', accountId)
    window.location.href = '/api/schwab/start'
  }

  async function disconnect() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('broker_tokens').delete().eq('user_id', user.id).eq('account_id', accountId).eq('broker', 'SCHWAB')
    if (error) setMsg(error.message)
    else setMsg('Disconnected.')
  }

  async function sync(mode: 'recent' | 'all') {
    try {
      setSyncing(true)
      setSyncMsg('Syncing…')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      if (!accountId) throw new Error('Missing local account')

      const resp = await fetch('/api/schwab/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ account_id: accountId, mode })
      })
      const j = await resp.json()
      if (!resp.ok) throw new Error(j.error ?? 'Sync failed')
      setSyncMsg(`Done. Trades created: ${j.trades_created}, executions inserted: ${j.executions_inserted}, trades closed: ${j.trades_closed}.`) 
    } catch (e: any) {
      setSyncMsg(e.message ?? String(e))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="container">
      <div className="nav">
        <Link href="/">Home</Link>
        <Link href="/trades">Trades</Link>
        <Link href="/import">Import Excel</Link>
      </div>

      <div className="card">
        <h2 style={{marginTop:0}}>Broker sync (Schwab / Thinkorswim)</h2>
        <p className="small">
          This connects your Schwab account via Schwab&apos;s Trader API OAuth flow, then stores a refresh token so the app can pull your fills.
          Note: Schwab refresh tokens expire (typically 7 days), so you may need to re-auth occasionally.
        </p>

        <div className="row" style={{alignItems:'center'}}>
          <button className="primary" onClick={connect}>Connect Schwab</button>
          <button onClick={disconnect}>Disconnect</button>
        </div>

        {msg && <div className="small" style={{marginTop: 10}}>{msg}</div>}

        <div className="card" style={{marginTop: 16}}>
          <h3 style={{marginTop:0}}>Sync fills → build trades</h3>
          <p className="small">
            “Recent” pulls ~last 180 days. “All” steps backward in 1-year chunks (up to 10 years) and imports what Schwab returns.
          </p>
          <div className="row" style={{alignItems:'center'}}>
            <button className="primary" disabled={syncing} onClick={() => sync('recent')}>Sync recent</button>
            <button disabled={syncing} onClick={() => sync('all')}>Sync all history</button>
          </div>
          {syncMsg && <div className="small" style={{marginTop:10}}>{syncMsg}</div>}
        </div>
      </div>
    </div>
  )
}
