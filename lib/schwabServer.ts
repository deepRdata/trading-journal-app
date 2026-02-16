import { serverSupabase } from './serverSupabase'

type BrokerTokenRow = {
  user_id: string
  account_id: string
  broker: string
  access_token: string
  refresh_token: string
  expires_at: string
  raw: any
}

function basicAuthHeader() {
  const clientId = process.env.SCHWAB_CLIENT_ID
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Missing SCHWAB_CLIENT_ID or SCHWAB_CLIENT_SECRET')
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  return `Basic ${basic}`
}

export async function getAndRefreshSchwabToken(user_id: string, account_id: string): Promise<BrokerTokenRow> {
  const sb = serverSupabase()
  const { data, error } = await sb
    .from('broker_tokens')
    .select('*')
    .eq('user_id', user_id)
    .eq('account_id', account_id)
    .eq('broker', 'SCHWAB')
    .single()

  if (error || !data) throw new Error('Schwab is not connected for this account.')
  const tok = data as BrokerTokenRow

  // refresh if expired or expiring soon (<= 2 minutes)
  const expiresAtMs = new Date(tok.expires_at).getTime()
  const needsRefresh = isNaN(expiresAtMs) || (expiresAtMs - Date.now() < 2 * 60 * 1000)
  if (!needsRefresh) return tok

  const form = new URLSearchParams()
  form.set('grant_type', 'refresh_token')
  form.set('refresh_token', tok.refresh_token)

  const resp = await fetch('https://api.schwabapi.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  })

  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Schwab refresh failed. You may need to re-connect. Details: ${txt}`)
  }

  const json: any = await resp.json()
  const expiresIn = Number(json.expires_in ?? 1800)
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  const next: BrokerTokenRow = {
    ...tok,
    access_token: json.access_token,
    // Schwab refresh tokens rotate; store the new one if present.
    refresh_token: json.refresh_token ?? tok.refresh_token,
    expires_at: expiresAt,
    raw: { ...(tok.raw ?? {}), ...json }
  }

  const { error: upErr } = await sb.from('broker_tokens').update({
    access_token: next.access_token,
    refresh_token: next.refresh_token,
    expires_at: next.expires_at,
    raw: next.raw,
    updated_at: new Date().toISOString()
  }).eq('user_id', user_id).eq('account_id', account_id).eq('broker', 'SCHWAB')

  if (upErr) throw new Error(upErr.message)
  return next
}

export async function schwabGet<T>(accessToken: string, path: string, query?: Record<string, string>) {
  const base = path.startsWith('http') ? path : `https://api.schwabapi.com${path}`
  const url = new URL(base)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, v)
    }
  }
  const resp = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Schwab API error ${resp.status}: ${txt}`)
  }
  return resp.json() as Promise<T>
}
