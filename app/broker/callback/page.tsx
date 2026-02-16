'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function SchwabCallbackPage({ searchParams }: { searchParams: { code?: string } }) {
  const [msg, setMsg] = useState('Connecting…')

  useEffect(() => {
    (async () => {
      try {
        const code = searchParams.code
        if (!code) throw new Error('Missing code')
        const account_id = localStorage.getItem('schwab_account_id')
        if (!account_id) throw new Error('Missing local account id (go back to Broker page and click Connect again)')
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Not signed in')

        const resp = await fetch('/api/schwab/exchange', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ code, account_id })
        })
        const j = await resp.json()
        if (!resp.ok) throw new Error(j.error ?? 'Exchange failed')

        setMsg('Connected! You can close this page.')
      } catch (e: any) {
        setMsg(e.message ?? String(e))
      }
    })()
  }, [searchParams.code])

  return (
    <div className="container">
      <div className="card">
        <h2 style={{marginTop:0}}>Schwab connection</h2>
        <p className="small">{msg}</p>
        <Link href="/broker">Back to Broker</Link>
      </div>
    </div>
  )
}
