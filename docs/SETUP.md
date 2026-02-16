# Trading Journal Web App (MVP) — Setup + Deployment

This repo is a working MVP that lets you:
- Sign in (Supabase Auth)
- Create trades (your Trade ID counter auto-increments)
- Store executions (fills) as **rows** like your Excel
- Auto-label fills as **Entry / Add / Partial Exit / Final Exit**
- Auto-close the trade when your net shares returns to 0
- Import your existing Excel journal
- Connect to Schwab via OAuth and **sync fills automatically**

---

## 0) What you need installed
- Node.js 20+
- Git (optional)

---

## 1) Create a Supabase project
1. Create a new project in Supabase.
2. In the **SQL editor**, run the migrations (in order):
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_unique_broker_exec.sql`
3. In **Auth → Providers**, enable **Email**.
   - For fastest testing: disable email confirmation (you can turn it back on later).

---

## 2) Add environment variables (local dev)
Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...                 # same as above
SUPABASE_SERVICE_ROLE_KEY=...

# Schwab / Thinkorswim (optional)
SCHWAB_CLIENT_ID=...
SCHWAB_CLIENT_SECRET=...
SCHWAB_REDIRECT_URI=http://localhost:3000/broker/callback
```

Where to find these:
- Supabase URL + anon key: Supabase project → **Settings → API**
- Service role key: same page (**keep private**) — used only on server routes

---

## 3) Run locally
```
npm install
npm run dev
```
Open http://localhost:3000

---

## 4) Deploy (recommended: Vercel)
1. Push this repo to GitHub.
2. Create a new project in Vercel from the repo.
3. Add the same environment variables in Vercel.
4. Deploy.

Set your Schwab redirect URI to:
- `https://YOUR-VERCEL-URL/broker/callback`

Also add that same redirect URI inside your Schwab Developer App settings.

Tip: In Schwab's portal, you can store multiple callbacks. Add both:
- `http://localhost:3000/broker/callback` (local)
- `https://YOUR-VERCEL-URL/broker/callback` (prod)

---

## 5) What’s implemented vs. next
### Implemented now
- Trades + executions CRUD
- Import from Excel
- Execution action labeling
- Simple P/L calculation from fills (average-cost method)
- OAuth token exchange + token storage for Schwab
- **Sync now** (Broker page): pulls fills (transactions type=TRADE) and auto-builds trades

### Next iteration (planned)
- Background / scheduled sync (Vercel Cron)
- Market-data table (daily OHLCV) + computed indicators: ADR%, ATR%, RVOL, RS rating
- Dashboards (daily/weekly/monthly stats)

---

## Security notes
- `broker_tokens` is currently stored in plaintext (MVP). Production should encrypt refresh tokens at rest.
- Supabase Row-Level Security is enabled for all tables; the server route uses a service-role key and MUST remain server-only.

