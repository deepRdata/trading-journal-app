'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function BrokerCallbackPage() {
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

      setMsg('Exchanging code…')

      // NOTE: If your /api/schwab/exchange route expects POST, change method to 'POST'.
      const res = await fetch(`/api/schwab/exchange?code=${encodeURIComponent(code)}`, {
        method: 'GET',
        cache: 'no-store',
      })

      const text = await res.text()

      if (!res.ok) {
        setMsg(`Exchange failed (${res.status}): ${text}`)
        return
      }

      setMsg('Connected! Go back to Broker Sync.')
    })()
  }, [code, error, errorDesc])

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Schwab connection</h1>
      <p style={{ marginTop: 12 }}>{msg || 'Working…'}</p>
      <div style={{ marginTop: 12 }}>
        <Link href="/broker">Back to Broker</Link>
      </div>
    </div>
  )
}
