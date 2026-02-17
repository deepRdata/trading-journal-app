-- Adds columns needed by the Excel importer + reversible sheet imports.
-- Safe to run multiple times.

alter table public.trades
  add column if not exists source_sheet text;

alter table public.executions
  add column if not exists source_sheet text,
  add column if not exists pnl numeric,
  add column if not exists position_size numeric;

-- Optional but recommended indexes for fast cleanup/filtering
create index if not exists trades_user_source_sheet_idx
  on public.trades (user_id, source_sheet);

create index if not exists exec_account_source_sheet_idx
  on public.executions (account_id, source_sheet);
