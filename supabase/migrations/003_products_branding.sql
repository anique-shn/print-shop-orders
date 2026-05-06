-- Migration 003: Products table, branding settings, order_items enhancements

-- ── Products (physical goods: T-shirts, hoodies, etc.) ────────────────────────
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,                    -- e.g. T-Shirt, Hoodie, Long Sleeve, Cap
  description text,
  image_url   text,
  base_price  numeric(10,2),           -- optional suggested base price
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table products disable row level security;
create index if not exists idx_products_category on products(category);

-- Seed common garment types
insert into products (name, category, sort_order) values
  ('T-Shirt',                  'Tops',        1),
  ('Long Sleeve Shirt',        'Tops',        2),
  ('Polo Shirt',               'Tops',        3),
  ('Tank Top',                 'Tops',        4),
  ('Pullover Hoodie',          'Sweatshirts', 5),
  ('Zip-Up Hoodie',            'Sweatshirts', 6),
  ('Crewneck Sweatshirt',      'Sweatshirts', 7),
  ('Jogger Pants',             'Bottoms',     8),
  ('Shorts',                   'Bottoms',     9),
  ('Structured Cap',           'Headwear',    10),
  ('Dad Hat',                  'Headwear',    11),
  ('Beanie',                   'Headwear',    12),
  ('Tote Bag',                 'Accessories', 13),
  ('Drawstring Bag',           'Accessories', 14);

-- ── Enhance order_items ────────────────────────────────────────────────────────
-- Add line type (product / service / fee) and relationships
alter table order_items
  add column if not exists line_type text not null default 'service'
    check (line_type in ('product', 'service', 'fee')),
  add column if not exists product_id uuid references products(id) on delete set null,
  add column if not exists service_item_id uuid references service_items(id) on delete set null,
  add column if not exists parent_order_item_id uuid references order_items(id) on delete cascade;

create index if not exists idx_order_items_parent on order_items(parent_order_item_id);
create index if not exists idx_order_items_product on order_items(product_id);
create index if not exists idx_order_items_service on order_items(service_item_id);

-- ── Branding settings on company_settings ──────────────────────────────────────
alter table company_settings
  add column if not exists primary_color   text default '#05253D',
  add column if not exists accent_color    text default '#2E7CF6',
  add column if not exists email_footer    text;
