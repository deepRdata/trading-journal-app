-- Trading Journal MVP schema
-- Run this in Supabase SQL editor (or via supabase CLI migrations).

create extension if not exists pgcrypto;

-- 1) Accounts
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  broker text not null,
  currency text not null default 'USD',
  created_at timestamp with time zone not null default now()
);

-- 2) Trades
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  trade_no integer not null,
  symbol text not null,
  instrument text not null default 'Stock',
  side text not null default 'Long',
  status text not null default 'OPEN',
  opened_at date not null,
  closed_at date,

  setup text,
  entry_method text,
  exit_method text,

  stop_loss numeric,
  risk numeric,
  risk_multi numeric,

  adr_pct numeric,
  atr_pct numeric,
  lod_pct numeric,
  rvol numeric,
  rs numeric,

  bqi_regime text,
  bqi_swing numeric,
  bqi_avg numeric,

  highest_high numeric,
  lowest_low numeric,

  news text,
  length_days integer,
  notes text,

  pnl numeric,
  gain_dollars numeric,
  gain_pct numeric,

  created_at timestamp with time zone not null default now(),
  unique(user_id, trade_no)
);

create index if not exists trades_user_opened_idx on public.trades (user_id, opened_at desc);
create index if not exists trades_user_symbol_idx on public.trades (user_id, symbol);

-- 3) Executions (fills)
create table if not exists public.executions (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  quantity numeric not null,
  price numeric not null,
  executed_at timestamp with time zone not null,
  broker_exec_id text,
  broker_order_id text,
  action text not null default 'Entry',
  created_at timestamp with time zone not null default now()
);

create index if not exists exec_trade_time_idx on public.executions (trade_id, executed_at asc);

-- 4) Broker tokens (MVP stores plaintext; encrypt at rest later)
create table if not exists public.broker_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  broker text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamp with time zone not null,
  raw jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, account_id, broker)
);

-- RLS
alter table public.accounts enable row level security;
alter table public.trades enable row level security;
alter table public.executions enable row level security;
alter table public.broker_tokens enable row level security;

-- Accounts policies
create policy "accounts_select_own" on public.accounts
  for select using (auth.uid() = user_id);
create policy "accounts_insert_own" on public.accounts
  for insert with check (auth.uid() = user_id);
create policy "accounts_update_own" on public.accounts
  for update using (auth.uid() = user_id);
create policy "accounts_delete_own" on public.accounts
  for delete using (auth.uid() = user_id);

-- Trades policies
create policy "trades_select_own" on public.trades
  for select using (auth.uid() = user_id);
create policy "trades_insert_own" on public.trades
  for insert with check (auth.uid() = user_id);
create policy "trades_update_own" on public.trades
  for update using (auth.uid() = user_id);
create policy "trades_delete_own" on public.trades
  for delete using (auth.uid() = user_id);

-- Executions policies (join through trades)
create policy "exec_select_own" on public.executions
  for select using (
    exists (select 1 from public.trades t where t.id = executions.trade_id and t.user_id = auth.uid())
  );
create policy "exec_insert_own" on public.executions
  for insert with check (
    exists (select 1 from public.trades t where t.id = executions.trade_id and t.user_id = auth.uid())
  );
create policy "exec_update_own" on public.executions
  for update using (
    exists (select 1 from public.trades t where t.id = executions.trade_id and t.user_id = auth.uid())
  );
create policy "exec_delete_own" on public.executions
  for delete using (
    exists (select 1 from public.trades t where t.id = executions.trade_id and t.user_id = auth.uid())
  );

-- Broker tokens policies (restrict to own tokens; NOTE: service-role bypasses RLS for server routes)
create policy "tokens_select_own" on public.broker_tokens
  for select using (auth.uid() = user_id);
create policy "tokens_insert_own" on public.broker_tokens
  for insert with check (auth.uid() = user_id);
create policy "tokens_update_own" on public.broker_tokens
  for update using (auth.uid() = user_id);
create policy "tokens_delete_own" on public.broker_tokens
  for delete using (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists broker_tokens_set_updated_at on public.broker_tokens;
create trigger broker_tokens_set_updated_at
before update on public.broker_tokens
for each row execute procedure public.set_updated_at();
