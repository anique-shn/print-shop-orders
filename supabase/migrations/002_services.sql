-- Migration 002: Service Groups, Items, and MOQ Pricing Tiers
-- Replaces the old items/item_variants/item_variant_pricing tables

-- ── Service Groups (top-level categories) ────────────────────────────────────
create table if not exists service_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  icon        text not null default 'Package',   -- Lucide icon name
  color       text not null default '#2E7CF6',   -- hex color
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ── Service Items (line items within a group) ─────────────────────────────────
create table if not exists service_items (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references service_groups(id) on delete cascade,
  name          text not null,
  description   text,
  pricing_type  text not null default 'flat'
                check (pricing_type in ('moq', 'flat')),
  -- flat_price used when pricing_type = 'flat'
  flat_price    numeric(10,2),
  icon          text,          -- Lucide icon name (optional override)
  color         text,          -- hex color (optional override)
  image_url     text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ── Service Item Tiers (MOQ pricing) ─────────────────────────────────────────
create table if not exists service_item_tiers (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references service_items(id) on delete cascade,
  min_qty        integer not null,
  max_qty        integer,        -- null = no upper bound
  price_per_unit numeric(10,2) not null,
  created_at     timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_service_items_group  on service_items(group_id);
create index if not exists idx_service_tiers_item   on service_item_tiers(item_id);

-- ── No RLS ────────────────────────────────────────────────────────────────────
alter table service_groups     disable row level security;
alter table service_items      disable row level security;
alter table service_item_tiers disable row level security;

-- ══════════════════════════════════════════════════════════════════════════════
-- SEED DATA — from 2026 Full Package Printing Price List
-- ══════════════════════════════════════════════════════════════════════════════

-- ── GROUP 1: Screen Print Production ─────────────────────────────────────────
insert into service_groups (id, name, description, icon, color, sort_order) values
  ('10000000-0000-0000-0000-000000000001', 'Screen Print Production',
   'Standard placements, per location. MOQ-based pricing.',
   'Layers', '#2E7CF6', 1);

-- Screen Print items (MOQ: 144, 300, 600, 1200, 2400)
insert into service_items (id, group_id, name, pricing_type, sort_order) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '1 Color', 'moq', 1),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '2 Color', 'moq', 2),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '3 Color', 'moq', 3),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '4 Color', 'moq', 4),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '5 Color', 'moq', 5),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '6 Color', 'moq', 6);

-- 1 Color tiers
insert into service_item_tiers (item_id, min_qty, max_qty, price_per_unit) values
  ('20000000-0000-0000-0000-000000000001', 144,  299,  1.42),
  ('20000000-0000-0000-0000-000000000001', 300,  599,  1.09),
  ('20000000-0000-0000-0000-000000000001', 600,  1199, 1.02),
  ('20000000-0000-0000-0000-000000000001', 1200, 2399, 0.96),
  ('20000000-0000-0000-0000-000000000001', 2400, null, 0.91);
-- 2 Color tiers
insert into service_item_tiers (item_id, min_qty, max_qty, price_per_unit) values
  ('20000000-0000-0000-0000-000000000002', 144,  299,  1.80),
  ('20000000-0000-0000-0000-000000000002', 300,  599,  1.28),
  ('20000000-0000-0000-0000-000000000002', 600,  1199, 1.13),
  ('20000000-0000-0000-0000-000000000002', 1200, 2399, 1.02),
  ('20000000-0000-0000-0000-000000000002', 2400, null, 0.94);
-- 3 Color tiers
insert into service_item_tiers (item_id, min_qty, max_qty, price_per_unit) values
  ('20000000-0000-0000-0000-000000000003', 144,  299,  2.15),
  ('20000000-0000-0000-0000-000000000003', 300,  599,  1.47),
  ('20000000-0000-0000-0000-000000000003', 600,  1199, 1.24),
  ('20000000-0000-0000-0000-000000000003', 1200, 2399, 1.08),
  ('20000000-0000-0000-0000-000000000003', 2400, null, 0.98);
-- 4 Color tiers
insert into service_item_tiers (item_id, min_qty, max_qty, price_per_unit) values
  ('20000000-0000-0000-0000-000000000004', 144,  299,  2.48),
  ('20000000-0000-0000-0000-000000000004', 300,  599,  1.64),
  ('20000000-0000-0000-0000-000000000004', 600,  1199, 1.34),
  ('20000000-0000-0000-0000-000000000004', 1200, 2399, 1.14),
  ('20000000-0000-0000-0000-000000000004', 2400, null, 1.01);
-- 5 Color tiers
insert into service_item_tiers (item_id, min_qty, max_qty, price_per_unit) values
  ('20000000-0000-0000-0000-000000000005', 144,  299,  2.79),
  ('20000000-0000-0000-0000-000000000005', 300,  599,  1.80),
  ('20000000-0000-0000-0000-000000000005', 600,  1199, 1.43),
  ('20000000-0000-0000-0000-000000000005', 1200, 2399, 1.19),
  ('20000000-0000-0000-0000-000000000005', 2400, null, 1.04);
-- 6 Color tiers
insert into service_item_tiers (item_id, min_qty, max_qty, price_per_unit) values
  ('20000000-0000-0000-0000-000000000006', 144,  299,  3.07),
  ('20000000-0000-0000-0000-000000000006', 300,  599,  1.94),
  ('20000000-0000-0000-0000-000000000006', 600,  1199, 1.52),
  ('20000000-0000-0000-0000-000000000006', 1200, 2399, 1.24),
  ('20000000-0000-0000-0000-000000000006', 2400, null, 1.07);

-- ── GROUP 2: Neck Print ───────────────────────────────────────────────────────
insert into service_groups (id, name, description, icon, color, sort_order) values
  ('10000000-0000-0000-0000-000000000002', 'Neck Print',
   'Includes OEM label removal. MOQ-based pricing.',
   'Tag', '#8B5CF6', 2);

insert into service_items (id, group_id, name, pricing_type, sort_order) values
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', '1 Color – Tear Away Label', 'moq', 1),
  ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', '1 Color – Scissor Cut',     'moq', 2),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'Fleece Print',              'flat', 3),
  ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002', 'Oversized Print (<600 pcs)','flat', 4),
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002', 'Oversized Print (600+ pcs)','flat', 5);

-- Neck Print tiers
insert into service_item_tiers (item_id, min_qty, max_qty, price_per_unit) values
  ('20000000-0000-0000-0000-000000000007', 144,  299,  1.43),
  ('20000000-0000-0000-0000-000000000007', 300,  599,  0.93),
  ('20000000-0000-0000-0000-000000000007', 600,  1199, 0.68),
  ('20000000-0000-0000-0000-000000000007', 1200, 2399, 0.55),
  ('20000000-0000-0000-0000-000000000007', 2400, null, 0.48),
  ('20000000-0000-0000-0000-000000000008', 144,  299,  2.68),
  ('20000000-0000-0000-0000-000000000008', 300,  599,  1.63),
  ('20000000-0000-0000-0000-000000000008', 600,  1199, 0.88),
  ('20000000-0000-0000-0000-000000000008', 1200, 2399, 0.75),
  ('20000000-0000-0000-0000-000000000008', 2400, null, 0.68);

-- Flat prices for neck print add-ons
update service_items set flat_price = 0.30 where id = '20000000-0000-0000-0000-000000000009';
update service_items set flat_price = 0.27 where id = '20000000-0000-0000-0000-000000000010';
update service_items set flat_price = 0.22 where id = '20000000-0000-0000-0000-000000000011';

-- ── GROUP 3: Setup Fees ───────────────────────────────────────────────────────
insert into service_groups (id, name, description, icon, color, sort_order) values
  ('10000000-0000-0000-0000-000000000003', 'Setup Fees',
   'One-time fees per color. Applied at order level.',
   'Settings', '#F59E0B', 3);

insert into service_items (id, group_id, name, pricing_type, flat_price, sort_order) values
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000003', 'Standard Screens (per color)',                 'flat', 25.00, 1),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000003', 'Standard Screens on Reorder (per color)',      'flat', 10.00, 2),
  ('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000003', 'Oversized Screens (per color)',                'flat', 40.00, 3),
  ('20000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000003', 'Oversized Screens on Reorder (per color)',     'flat', 30.00, 4),
  ('20000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000003', 'Film Charge (per color)',                      'flat', 15.00, 5),
  ('20000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000003', 'Color Change (per color)',                     'flat', 15.00, 6),
  ('20000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000003', 'Color Separations – Simple (per color)',       'flat', 10.00, 7),
  ('20000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000003', 'Color Separations – Complex (per color)',      'flat', 15.00, 8);

-- ── GROUP 4: Folding & Bagging ────────────────────────────────────────────────
insert into service_groups (id, name, description, icon, color, sort_order) values
  ('10000000-0000-0000-0000-000000000004', 'Folding & Bagging',
   'Per unit folding, polybag, and size sticker.',
   'Package', '#10B981', 4);

insert into service_items (id, group_id, name, pricing_type, flat_price, sort_order) values
  ('20000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000004', 'Fold, Polybag & Size Sticker – Tees', 'flat', 0.35, 1),
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000004', 'Fold, Polybag & Size Sticker – L/S',  'flat', 0.50, 2),
  ('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000004', 'Packing (multi-destination)',         'flat', 0.20, 3);

-- ── GROUP 5: Stickers & Ticketing ─────────────────────────────────────────────
insert into service_groups (id, name, description, icon, color, sort_order) values
  ('10000000-0000-0000-0000-000000000005', 'Stickers & Ticketing',
   'Barcode stickers, hangtags, and safety pin affixing.',
   'Ticket', '#EC4899', 5);

insert into service_items (id, group_id, name, pricing_type, flat_price, sort_order) values
  ('20000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000005', 'Barcode Sticker (customer provided)',                    'flat', 0.05, 1),
  ('20000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000005', 'Barcode Sticker (includes sticker)',                     'flat', 0.15, 2),
  ('20000000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000005', 'Affix Tickets/Hangtags with Fastener (incl. fastener)',  'flat', 0.15, 3),
  ('20000000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000005', 'Affix Tickets/Hangtags with Safety Pin',                 'flat', 0.45, 4);

-- ── GROUP 6: Label & Trims ────────────────────────────────────────────────────
insert into service_groups (id, name, description, icon, color, sort_order) values
  ('10000000-0000-0000-0000-000000000006', 'Label & Trims',
   'Neck label, hem label, and patch sewing services.',
   'Scissors', '#EF4444', 6);

insert into service_items (id, group_id, name, pricing_type, flat_price, sort_order) values
  ('20000000-0000-0000-0000-000000000027', '10000000-0000-0000-0000-000000000006', 'Neck Label Sewing Over Seam (no opening needed)', 'flat', 0.40, 1),
  ('20000000-0000-0000-0000-000000000028', '10000000-0000-0000-0000-000000000006', 'Neck Label Sewing Under Seam (opening required)', 'flat', 0.70, 2),
  ('20000000-0000-0000-0000-000000000029', '10000000-0000-0000-0000-000000000006', 'Hem Label Sewing (no folding required)',           'flat', 0.35, 3),
  ('20000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000006', 'Hem Label Sewing (folding required)',              'flat', 0.45, 4),
  ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000006', 'Label/Patch Sewing – 2 Sides',                    'flat', 0.65, 5),
  ('20000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000006', 'Label/Patch Sewing – 4 Sides',                    'flat', 0.80, 6);

-- ── GROUP 7: Specialty Inks ───────────────────────────────────────────────────
insert into service_groups (id, name, description, icon, color, sort_order) values
  ('10000000-0000-0000-0000-000000000007', 'Specialty Inks',
   'Per location add-on charge for specialty ink types.',
   'Droplets', '#06B6D4', 7);

insert into service_items (id, group_id, name, pricing_type, flat_price, sort_order) values
  ('20000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000007', 'Waterbased',         'flat', 0.10, 1),
  ('20000000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000007', 'Discharge',          'flat', 0.10, 2),
  ('20000000-0000-0000-0000-000000000035', '10000000-0000-0000-0000-000000000007', 'Metallic/Shimmer',   'flat', 0.10, 3),
  ('20000000-0000-0000-0000-000000000036', '10000000-0000-0000-0000-000000000007', 'Glitter/Crystalina', 'flat', 0.40, 4),
  ('20000000-0000-0000-0000-000000000037', '10000000-0000-0000-0000-000000000007', 'Reflective',         'flat', 0.50, 5),
  ('20000000-0000-0000-0000-000000000038', '10000000-0000-0000-0000-000000000007', 'Glow in the Dark',   'flat', 0.40, 6),
  ('20000000-0000-0000-0000-000000000039', '10000000-0000-0000-0000-000000000007', 'Puff Ink',           'flat', 0.20, 7);
