-- Migration 008: Add size_label and order_item_id to invoice_items
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS size_label text;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS order_item_id uuid references order_items(id) on delete set null;

-- Back-fill size_label for existing invoice_items that came from an order,
-- matching by order_id + description + qty (best effort).
UPDATE invoice_items ii
SET size_label = oi.size
FROM invoices inv, order_items oi
WHERE ii.invoice_id   = inv.id
  AND oi.order_id     = inv.order_id
  AND oi.description  = ii.description
  AND oi.qty          = ii.qty
  AND inv.order_id    IS NOT NULL
  AND ii.size_label   IS NULL
  AND oi.size         IS NOT NULL;
