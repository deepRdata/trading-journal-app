-- Ensure we don't duplicate the same broker execution on repeated sync.
--
-- We use a partial unique index so manual rows (broker_exec_id NULL) are unaffected.

create unique index if not exists executions_account_broker_exec_uidx
  on public.executions (account_id, broker_exec_id)
  where broker_exec_id is not null;
