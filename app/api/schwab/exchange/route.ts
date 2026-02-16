import { NextResponse } from 'next/server'
import { serverSupabase } from '@/lib/serverSupabase'

async function fetchAccountNumbers(accessToken: string) {
  const resp = await fetch('https://api.schwabapi.com/trader/v1/accounts/accountNumbers', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  })
  if (!resp.ok) return null
  try {
    return await resp.json()
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing supabase auth' }, { status: 401 })
  }
  const token = auth.replace('Bearer ', '').trim()

  const sb = serverSupabase()
  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Invalid user' }, { status: 401 })
  }
  const user = userData.user

  const body = await req.json()
  const code = body.code as string | undefined
  const accountId = body.account_id as string | undefined
  if (!code || !accountId) {
    return NextResponse.json({ error: 'Missing code or account_id' }, { status: 400 })
  }

  const clientId = process.env.SCHWAB_CLIENT_ID
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET
  const redirectUri = process.env.SCHWAB_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: 'Missing Schwab env vars' }, { status: 500 })
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const form = new URLSearchParams()
  form.set('grant_type', 'authorization_code')
  form.set('code', decodeURIComponent(code))
  form.set('redirect_uri', redirectUri)

  const resp = await fetch('https://api.schwabapi.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  })

  if (!resp.ok) {
    const txt = await resp.text()
    return NextResponse.json({ error: 'Token exchange failed', details: txt }, { status: 400 })
  }

  const tokenJson: any = await resp.json()
  const expiresIn = Number(tokenJson.expires_in ?? 1800)
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Try to pre-fetch Schwab "account hash" (encryptedAccountId) to simplify sync later.
  const acctNums = await fetchAccountNumbers(tokenJson.access_token)
  const first = Array.isArray(acctNums) && acctNums.length ? acctNums[0] : null
  // Common keys seen in community docs: "accountNumber" + "hashValue".
  const accountHash = first?.hashValue ?? first?.encryptedAccountId ?? null

  // store tokens (MVP: plaintext). In production, encrypt at rest.
  const { error: upErr } = await sb.from('broker_tokens').upsert({
    user_id: user.id,
    account_id: accountId,
    broker: 'SCHWAB',
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token,
    expires_at: expiresAt,
    raw: {
      ...tokenJson,
      account_hash: accountHash,
      account_number: first?.accountNumber ?? null
    }
  }, { onConflict: 'user_id,account_id,broker' })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, expires_at: expiresAt })
}
