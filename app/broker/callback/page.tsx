'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function CallbackInner() {
  const sp = useSearchParams()

  // Schwab should send `code`, but we allow a few fallbacks just in case.
  const code =
    sp.get('code') ??
    sp.get('authCode') ??
    sp.get('authorization_code')

  const error = sp.get('error')
  const errorDesc = sp.get('error_description')

  const [msg, setMsg] = useState<string>('')

  useEffect(() => {
    ; (async () => {
      if (error) {
        setMsg(`${error}${errorDesc ? `: ${errorDesc}` : ''}`)
        return
      }

      if (!code) {
        setMsg('Missing code')
        return
      }

      setMsg('Exchanging code...')
      const res = await fetch(`/api/schwab/exchange?code=${encodeURIComponent(code)}`, {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(json?.error ?? `Exchange failed (${res.status})`)
        return
      }

      setMsg('Connected! You can go back to Broker Sync.')
    })()
  }, [code, error, errorDesc])

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
      <h1>Schwab connection</h1>
      <div style={{ marginTop: 12 }}>{msg}</div>
      <div style={{ marginTop: 12 }}>
        <Link href="/broker">Back to Broker</Link>
      </div>
    </div>
  )
}

export default function BrokerCallbackPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <CallbackInner />
    </Suspense>
  )
}
