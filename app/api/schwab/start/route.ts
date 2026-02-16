import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.SCHWAB_CLIENT_ID
  const redirectUri = process.env.SCHWAB_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'Missing SCHWAB_CLIENT_ID or SCHWAB_REDIRECT_URI' }, { status: 500 })
  }

  // Schwab OAuth authorize endpoint
  const base = 'https://api.schwabapi.com/v1/oauth/authorize'
  const url = new URL(base)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'api')

  return NextResponse.redirect(url.toString())
}
