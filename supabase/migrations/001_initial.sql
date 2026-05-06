-- Print Shop Orders & Invoicing Module
-- No RLS — public access for MVP

-- ── Company Settings (single row) ───────────────────────────────────────────
create table if not exists company_settings (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null default 'My Print Shop',
  address              text,
  city                 text,
  state                text,
  zip                  text,
  phone                text,
  email                text,
  website              text,
  logo_url             text,
  tax_number           text,
  default_tax_rate     numeric(5,2) not null default 0,
  default_payment_terms text not null default 'due_on_receipt',
  invoice_notes        text,
  invoice_terms        text,
  updated_at           timestamptz not null default now()
);

-- Seed a single settings row
insert into company_settings (name) values ('My Print Shop')
on conflict do nothing;

-- ── Items / Catalog ──────────────────────────────────────────────────────────
create table if not exists items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  category    text,
  image_url   text,
  created_at  timestamptz not null default now()
);

-- ── Item Variants ─────────────────────────────────────────────────────────────
-- e.g. "1 Color Screen Print", "2 Color Screen Print", "Left Chest Embroidery"
create table if not exists item_variants (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- ── MOQ-Based Pricing ─────────────────────────────────────────────────────────
create table if not exists item_variant_pricing (
  id             uuid primary key default gen_random_uuid(),
  variant_id     uuid not null references item_variants(id) on delete cascade,
  min_qty        integer not null default 1,
  max_qty        integer,                -- null = no upper limit
  price_per_unit numeric(10,2) not null,
  created_at     timestamptz not null default now()
);

-- ── Customers ─────────────────────────────────────────────────────────────────
create table if not exists customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  company    text,
  address    text,
  city       text,
  state      text,
  zip        text,
  notes      text,
  created_at timestamptz not null default now()
);

-- ── Orders ────────────────────────────────────────────────────────────────────
create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,
  customer_id      uuid references customers(id) on delete set null,
  -- Denormalized customer info (for walk-in / quick orders)
  customer_name    text,
  customer_email   text,
  customer_phone   text,
  customer_company text,
  status           text not null default 'new'
                   check (status in ('new','production','quality','ready','shipped','delivered','cancelled')),
  due_date         date,
  notes            text,
  image_url        text,
  discount_type    text not null default 'percent' check (discount_type in ('percent','flat')),
  discount_value   numeric(10,2) not null default 0,
  tax_rate         numeric(5,2) not null default 0,
  deposit_amount   numeric(10,2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Order Items (line items) ──────────────────────────────────────────────────
create table if not exists order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders(id) on delete cascade,
  item_id             uuid references items(id) on delete set null,
  variant_id          uuid references item_variants(id) on delete set null,
  description         text not null,
  decoration_type     text,
  decoration_location text,
  color               text,
  size                text,
  qty                 integer not null default 1,
  unit_price          numeric(10,2) not null default 0,
  taxable             boolean not null default true,
  image_url           text,
  notes               text,
  created_at          timestamptz not null default now()
);

-- ── Invoices ──────────────────────────────────────────────────────────────────
create table if not exists invoices (
  id                uuid primary key default gen_random_uuid(),
  invoice_number    text not null unique,
  order_id          uuid references orders(id) on delete set null,
  customer_id       uuid references customers(id) on delete set null,
  -- Denormalized customer info
  customer_name     text,
  customer_email    text,
  customer_company  text,
  customer_address  text,
  status            text not null default 'draft'
                    check (status in ('draft','sent','paid','overdue','cancelled')),
  issue_date        date not null default current_date,
  due_date          date,
  payment_terms     text not null default 'due_on_receipt',
  discount_type     text not null default 'percent' check (discount_type in ('percent','flat')),
  discount_value    numeric(10,2) not null default 0,
  tax_rate          numeric(5,2) not null default 0,
  notes             text,
  terms             text,
  sent_at           timestamptz,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Invoice Items ─────────────────────────────────────────────────────────────
create table if not exists invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null,
  qty         integer not null default 1,
  rate        numeric(10,2) not null default 0,
  taxable     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Order status history ──────────────────────────────────────────────────────
create table if not exists order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger orders_updated_at
  before update on orders
  for each row execute function update_updated_at();

create or replace trigger invoices_updated_at
  before update on invoices
  for each row execute function update_updated_at();

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_orders_status       on orders(status);
create index if not exists idx_orders_customer_id  on orders(customer_id);
create index if not exists idx_orders_created_at   on orders(created_at desc);
create index if not exists idx_order_items_order   on order_items(order_id);
create index if not exists idx_invoices_order_id   on invoices(order_id);
create index if not exists idx_invoices_status     on invoices(status);
create index if not exists idx_item_variants_item  on item_variants(item_id);
create index if not exists idx_variant_pricing_var on item_variant_pricing(variant_id);

-- ── Disable RLS (public access MVP) ──────────────────────────────────────────
alter table company_settings      disable row level security;
alter table items                 disable row level security;
alter table item_variants         disable row level security;
alter table item_variant_pricing  disable row level security;
alter table customers             disable row level security;
alter table orders                disable row level security;
alter table order_items           disable row level security;
alter table invoices              disable row level security;
alter table invoice_items         disable row level security;
alter table order_status_history  disable row level security;
