'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function CallbackClient() {
    const router = useRouter()
    const sp = useSearchParams()

    // Pull code from query string (Schwab uses `code`)
    const code = useMemo(() => {
        return (
            sp.get('code') ??
            sp.get('authCode') ??
            sp.get('authorization_code') ??
            null
        )
    }, [sp])

    const error = sp.get('error')
    const errorDesc = sp.get('error_description')

    const [msg, setMsg] = useState<string>('Working...')

    useEffect(() => {
        let cancelled = false

            ; (async () => {
                if (error) {
                    if (!cancelled) setMsg(`${error}${errorDesc ? `: ${errorDesc}` : ''}`)
                    return
                }

                if (!code) {
                    if (!cancelled) setMsg('Missing code')
                    return
                }

                if (!cancelled) setMsg('Exchanging code...')

                try {
                    // Your API route expects POST (405 happens if you GET it)
                    const res = await fetch('/api/schwab/exchange', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        cache: 'no-store',
                        body: JSON.stringify({ code }),
                    })

                    if (!res.ok) {
                        const txt = await res.text().catch(() => '')
                        if (!cancelled) {
                            setMsg(`Exchange failed (${res.status})${txt ? `: ${txt}` : ''}`)
                        }
                        return
                    }

                    if (!cancelled) setMsg('Connected! Returning to Broker...')
                    router.replace('/broker')
                } catch (e: any) {
                    if (!cancelled) setMsg(e?.message ?? String(e))
                }
            })()

        return () => {
            cancelled = true
        }
    }, [code, error, errorDesc, router])

    return (
        <div style={{ maxWidth: 720, margin: '48px auto', padding: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>Schwab connection</h1>
            <p style={{ marginTop: 12 }}>{msg}</p>

            <div style={{ marginTop: 16 }}>
                <Link href="/broker">Back to Broker</Link>
            </div>
        </div>
    )
}
