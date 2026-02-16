'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (loading) return <div className="container"><div className="card">Loading…</div></div>

  if (!session) {
    return (
      <div className="container">
        <div className="card">
          <h2>Sign in</h2>
          <p className="small">Use email + password. (You can switch to magic links later if you want.)</p>
          <AuthForm />
        </div>
      </div>
    )
  }

  return <>{children}</>
}

function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin'|'signup'>('signup')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setMsg(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg('Account created. If Supabase email confirmation is enabled, check your email.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e: any) {
      setMsg(e.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{display:'grid', gap: 10, maxWidth: 380}}>
      <div className="row">
        <button className={mode==='signup'?'primary':''} onClick={() => setMode('signup')}>Create account</button>
        <button className={mode==='signin'?'primary':''} onClick={() => setMode('signin')}>Sign in</button>
      </div>
      <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button className="primary" disabled={busy || !email || !password} onClick={submit}>
        {busy ? 'Working…' : (mode === 'signup' ? 'Create account' : 'Sign in')}
      </button>
      {msg && <div className="small">{msg}</div>}
    </div>
  )
}
