'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function CallbackClient() {
    const router = useRouter()
    const sp = useSearchParams()

    // Schwab should send `code`, but we allow a few fallbacks just in case.
    const code =
        sp.get('code') ??
        sp.get('authCode') ??
        sp.get('authorization_code')

    const error = sp.get('error')
    const errorDesc = sp.get('error_description')

    const [msg, setMsg] = useState('')

    useEffect(() => {
        ; (async () => {
            try {
                if (error) {
                    setMsg(`${error}${errorDesc ? `: ${errorDesc}` : ''}`)
                    return
                }

                if (!code) {
                    setMsg('Missing code')
                    return
                }

                setMsg('Exchanging code...')

                // ✅ Get Supabase session (we need the access_token to auth the API route)
                const { data: sessionData, error: sessErr } = await supabase.auth.getSession()
                if (sessErr) throw sessErr

                const session = sessionData.session
                if (!session?.access_token) {
                    setMsg('Not signed in to the app. Go back to Broker and sign in, then try Connect again.')
                    return
                }

                // IMPORTANT: Call exchange with POST (your route.ts is POST).
                const res = await fetch('/api/schwab/exchange', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // ✅ This is what your server route is complaining about
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    cache: 'no-store',
                    body: JSON.stringify({ code }),
                })

                if (!res.ok) {
                    const txt = await res.text().catch(() => '')
                    setMsg(`Exchange failed (${res.status})${txt ? `: ${txt}` : ''}`)
                    return
                }

                setMsg('Connected! Returning to Broker...')
                router.replace('/broker')
            } catch (e: any) {
                setMsg(e?.message ?? String(e))
            }
        })()
    }, [code, error, errorDesc, router])

    return (
        <div style={{ maxWidth: 720, margin: '48px auto', padding: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>Schwab connection</h1>
            <p style={{ marginTop: 12 }}>{msg || 'Working...'}</p>

            <div style={{ marginTop: 16 }}>
                <Link href="/broker">Back to Broker</Link>
            </div>
        </div>
    )
}