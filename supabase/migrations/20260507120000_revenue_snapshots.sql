create table if not exists revenue_snapshots (
  id              uuid primary key default gen_random_uuid(),
  label           text not null,
  period_start    date not null,
  period_end      date not null,
  gross_revenue   numeric(12,2) not null default 0,
  expenses        jsonb not null default '[]',
  total_expenses  numeric(12,2) not null default 0,
  net_profit      numeric(12,2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table revenue_snapshots disable row level security;
