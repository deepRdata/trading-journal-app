# Design Notes (Lee’s Trading Journal)

## Core rules (your “ground truth”)
- **Trade starts** at the first entry fill (BUY for you, since you’re long-only today).
- **Trade ends** when your **net shares returns to 0** for that symbol.
- Any later re-entry (even same day) is a **new trade** and gets a new Trade ID.
- Scale-in = BUY while already in position → **Add**
- Scale-out = SELL while position remains >0 → **Partial Exit**
- Final exit = SELL that brings position to 0 → **Final Exit**

These rules let the app group fills automatically.

## Data model (MVP)
- `accounts` — your single Schwab cash account.
- `trades` — one row per trade (your `Trade ID` counter is `trade_no`). Contains manual journal fields.
- `executions` — one row per fill (what you wanted: each partial exit is its own row).
- `broker_tokens` — stores Schwab OAuth tokens so the server can call Schwab APIs.

## Ledger calculations
The UI builds a running ledger from executions:
- Running position (shares)
- Avg price (average-cost)
- Position size ($)
- Realized P/L ($)

## Broker integration strategy
1) OAuth connect → store refresh token in `broker_tokens`
2) “Sync now” pulls fills since last sync:
   - map Schwab fills to `executions`
   - group into trades using your “flat = trade ended” rule
3) Optional scheduled sync: Vercel Cron hits a protected endpoint.

