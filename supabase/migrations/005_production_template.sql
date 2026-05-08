-- Migration 005: Production (Multi-SKU) Template
-- Garment catalog, pricing matrices, finishing services
-- Enhanced order_items with size matrix, decorations, finishing tables

-- ── Garment (Blank) Catalog ────────────────────────────────────────────────────
create table if not exists garments (
  id             uuid primary key default gen_random_uuid(),
  brand          text not null,
  style_number   text,
  name           text not null,
  category       text,
  color          text,
  base_cost      numeric(10,2) not null default 0,
  size_upcharges jsonb not null default '{"2XL": 2.00, "3XL": 3.00}',
  markup_value   numeric(5,4) not null default 0.40,
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

alter table garments disable row level security;
create index if not exists idx_garments_category on garments(category);
create index if not exists idx_garments_brand on garments(brand);

-- ── Screen Print Pricing Matrix ────────────────────────────────────────────────
create table if not exists screen_print_matrix (
  id         uuid primary key default gen_random_uuid(),
  qty_min    integer not null,
  qty_max    integer,
  colors_1   numeric(8,2),
  colors_2   numeric(8,2),
  colors_3   numeric(8,2),
  colors_4   numeric(8,2),
  colors_5   numeric(8,2),
  colors_6   numeric(8,2),
  created_at timestamptz not null default now()
);

alter table screen_print_matrix disable row level security;

-- ── Embroidery Pricing Matrix ─────────────────────────────────────────────────
create table if not exists embroidery_matrix (
  id           uuid primary key default gen_random_uuid(),
  qty_min      integer not null,
  qty_max      integer,
  stitches_5k  numeric(8,2),
  stitches_10k numeric(8,2),
  stitches_15k numeric(8,2),
  stitches_20k numeric(8,2),
  created_at   timestamptz not null default now()
);

alter table embroidery_matrix disable row level security;

-- ── Finishing Services Catalog ─────────────────────────────────────────────────
create table if not exists finishing_services (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  unit_price numeric(8,2) not null default 0,
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table finishing_services disable row level security;

-- ── Enhance order_items ────────────────────────────────────────────────────────
-- Widen line_type constraint to include 'garment' and 'setup_fee'
alter table order_items drop constraint if exists order_items_line_type_check;
alter table order_items add constraint order_items_line_type_check
  check (line_type in ('product', 'service', 'fee', 'garment', 'setup_fee'));

alter table order_items
  add column if not exists garment_id       uuid references garments(id) on delete set null,
  add column if not exists size_matrix      jsonb,
  add column if not exists blank_cost       numeric(10,2),
  add column if not exists markup_pct       numeric(5,4),
  add column if not exists price_overridden boolean not null default false,
  add column if not exists override_reason  text;

-- ── Order Item Decorations ─────────────────────────────────────────────────────
create table if not exists order_item_decorations (
  id              uuid primary key default gen_random_uuid(),
  order_item_id   uuid not null references order_items(id) on delete cascade,
  decoration_type text not null check (decoration_type in ('screen_print', 'embroidery')),
  location        text not null,
  colors          integer,
  stitch_count    integer,
  unit_price      numeric(8,2) not null default 0,
  notes           text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

alter table order_item_decorations disable row level security;
create index if not exists idx_oid_item on order_item_decorations(order_item_id);

-- ── Order Item Finishing ──────────────────────────────────────────────────────
create table if not exists order_item_finishing (
  id                   uuid primary key default gen_random_uuid(),
  order_item_id        uuid not null references order_items(id) on delete cascade,
  finishing_service_id uuid references finishing_services(id) on delete set null,
  service_name         text not null,
  unit_price           numeric(8,2) not null default 0,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now()
);

alter table order_item_finishing disable row level security;
create index if not exists idx_oif_item on order_item_finishing(order_item_id);

-- ── Seed: Screen Print Matrix ─────────────────────────────────────────────────
insert into screen_print_matrix (qty_min, qty_max, colors_1, colors_2, colors_3, colors_4, colors_5, colors_6) values
  (12,   23,  6.00, 7.50, 9.00, 10.50, 12.00, 13.50),
  (24,   47,  4.50, 5.50, 6.50,  7.50,  8.50,  9.50),
  (48,   71,  3.25, 4.00, 4.75,  5.50,  6.25,  7.00),
  (72,  143,  2.50, 3.00, 3.50,  4.00,  4.50,  5.00),
  (144, 287,  1.85, 2.20, 2.55,  2.90,  3.25,  3.60),
  (288, null, 1.50, 1.75, 2.00,  2.25,  2.50,  2.75);

-- ── Seed: Embroidery Matrix ───────────────────────────────────────────────────
insert into embroidery_matrix (qty_min, qty_max, stitches_5k, stitches_10k, stitches_15k, stitches_20k) values
  (1,    11,  8.00, 10.00, 12.50, 15.00),
  (12,   23,  6.50,  8.00, 10.00, 12.00),
  (24,   71,  5.00,  6.50,  8.00,  9.50),
  (72,  143,  4.00,  5.00,  6.50,  8.00),
  (144, null, 3.25,  4.25,  5.50,  7.00);

-- ── Seed: Finishing Services ──────────────────────────────────────────────────
insert into finishing_services (name, unit_price, sort_order) values
  ('Fold and bag (poly)',              0.35, 1),
  ('Individual poly bag',             0.25, 2),
  ('Hangtag application',             0.40, 3),
  ('Custom neck label — printed',     1.50, 4),
  ('Custom neck label — woven, sewn', 2.00, 5),
  ('Tag removal / relabeling',        0.75, 6),
  ('Size sticker',                    0.10, 7),
  ('Steam / press',                   0.50, 8);

-- ── Seed: Sample Garments ─────────────────────────────────────────────────────
insert into garments (brand, style_number, name, category, color, base_cost, size_upcharges, markup_value, sort_order) values
  ('Gildan',       'G500',   'Gildan 5000 Heavy Cotton T-Shirt', 'T-Shirt', 'White',  2.85, '{"2XL":2.00,"3XL":3.00}', 0.40, 1),
  ('Gildan',       'G500',   'Gildan 5000 Heavy Cotton T-Shirt', 'T-Shirt', 'Black',  2.85, '{"2XL":2.00,"3XL":3.00}', 0.40, 2),
  ('Gildan',       'G500',   'Gildan 5000 Heavy Cotton T-Shirt', 'T-Shirt', 'Navy',   2.85, '{"2XL":2.00,"3XL":3.00}', 0.40, 3),
  ('Gildan',       'G500',   'Gildan 5000 Heavy Cotton T-Shirt', 'T-Shirt', 'Red',    2.85, '{"2XL":2.00,"3XL":3.00}', 0.40, 4),
  ('Gildan',       'G500',   'Gildan 5000 Heavy Cotton T-Shirt', 'T-Shirt', 'Royal',  2.85, '{"2XL":2.00,"3XL":3.00}', 0.40, 5),
  ('Gildan',       'G180',   'Gildan 18000 Heavy Blend Hoodie',  'Hoodie',  'Black',  9.50, '{"2XL":2.00,"3XL":3.00}', 0.40, 6),
  ('Gildan',       'G180',   'Gildan 18000 Heavy Blend Hoodie',  'Hoodie',  'Navy',   9.50, '{"2XL":2.00,"3XL":3.00}', 0.40, 7),
  ('Bella+Canvas', 'BC3001', 'Bella+Canvas 3001 Unisex Tee',    'T-Shirt', 'White',  3.50, '{"2XL":2.00,"3XL":3.00}', 0.40, 8),
  ('Bella+Canvas', 'BC3001', 'Bella+Canvas 3001 Unisex Tee',    'T-Shirt', 'Black',  3.50, '{"2XL":2.00,"3XL":3.00}', 0.40, 9),
  ('Next Level',   'NL3600', 'Next Level 3600 Cotton Crew',     'T-Shirt', 'White',  3.75, '{"2XL":2.00}',            0.40, 10),
  ('Next Level',   'NL3600', 'Next Level 3600 Cotton Crew',     'T-Shirt', 'Black',  3.75, '{"2XL":2.00}',            0.40, 11);
