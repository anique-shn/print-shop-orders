-- Migration 006: Generic Decoration Groups + Finishing Categories
-- Replaces separate screen_print_matrix / embroidery_matrix with one flexible system

-- ── Decoration Groups ─────────────────────────────────────────────────────────
-- Each group defines a decoration type (Screen Print, Embroidery, DTG, Vinyl…)
-- with its own matrix column structure
create table if not exists decoration_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  icon        text not null default 'Printer',
  color       text not null default '#2E7CF6',
  -- col_labels: JSON array of column header names, length = col_count
  -- e.g. ["1 Color","2 Colors","3 Colors","4 Colors","5 Colors","6 Colors"]
  col_labels  jsonb not null default '["Col 1","Col 2","Col 3"]',
  col_count   integer not null default 3 check (col_count between 1 and 6),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table decoration_groups disable row level security;
create index if not exists idx_decoration_groups_sort on decoration_groups(sort_order);

-- ── Generic Decoration Matrix ─────────────────────────────────────────────────
-- One row = one qty tier. col_1…col_6 map to the group's col_labels.
-- Unused columns (beyond col_count) are null.
create table if not exists decoration_matrix (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references decoration_groups(id) on delete cascade,
  qty_min    integer not null,
  qty_max    integer,
  col_1      numeric(8,2),
  col_2      numeric(8,2),
  col_3      numeric(8,2),
  col_4      numeric(8,2),
  col_5      numeric(8,2),
  col_6      numeric(8,2),
  created_at timestamptz not null default now()
);

alter table decoration_matrix disable row level security;
create index if not exists idx_decoration_matrix_group on decoration_matrix(group_id, qty_min);

-- ── Enhance order_item_decorations ───────────────────────────────────────────
-- Drop old hard-coded check; add generic group FK + col_index
alter table order_item_decorations
  drop constraint if exists order_item_decorations_decoration_type_check;

alter table order_item_decorations
  add column if not exists decoration_group_id uuid references decoration_groups(id) on delete set null,
  add column if not exists col_index           integer;

-- ── Add category column to finishing_services ────────────────────────────────
alter table finishing_services
  add column if not exists group_name text;

-- ── Seed: Screen Print group ──────────────────────────────────────────────────
insert into decoration_groups
  (id, name, description, icon, color, col_labels, col_count, sort_order)
values (
  '20000000-0000-0000-0000-000000000001',
  'Screen Print',
  'Per-color pricing per location. Underbase adds +1 effective color on dark garments.',
  'Printer',
  '#2E7CF6',
  '["1 Color","2 Colors","3 Colors","4 Colors","5 Colors","6 Colors"]',
  6,
  1
) on conflict (id) do nothing;

-- Migrate existing screen_print_matrix rows
insert into decoration_matrix (group_id, qty_min, qty_max, col_1, col_2, col_3, col_4, col_5, col_6)
select
  '20000000-0000-0000-0000-000000000001',
  qty_min, qty_max, colors_1, colors_2, colors_3, colors_4, colors_5, colors_6
from screen_print_matrix;

-- ── Seed: Embroidery group ────────────────────────────────────────────────────
insert into decoration_groups
  (id, name, description, icon, color, col_labels, col_count, sort_order)
values (
  '20000000-0000-0000-0000-000000000002',
  'Embroidery',
  'Per-stitch-count pricing per location. Digitizing fee charged separately.',
  'Scissors',
  '#7C3AED',
  '["≤5K sts","5–10K sts","10–15K sts","15–20K sts"]',
  4,
  2
) on conflict (id) do nothing;

-- Migrate existing embroidery_matrix rows
insert into decoration_matrix (group_id, qty_min, qty_max, col_1, col_2, col_3, col_4)
select
  '20000000-0000-0000-0000-000000000002',
  qty_min, qty_max, stitches_5k, stitches_10k, stitches_15k, stitches_20k
from embroidery_matrix;

-- ── Assign finishing service categories ───────────────────────────────────────
update finishing_services set group_name = 'Packaging'
  where name in ('Fold and bag (poly)', 'Individual poly bag', 'Tissue wrap', 'Box-and-label per recipient');

update finishing_services set group_name = 'Labels & Tags'
  where name in (
    'Hangtag application',
    'Custom neck label — printed',
    'Custom neck label — woven, sewn',
    'Size sticker',
    'Hem tag'
  );

update finishing_services set group_name = 'Alterations'
  where name in ('Tag removal / relabeling', 'Steam / press', 'Inside-out folding');
