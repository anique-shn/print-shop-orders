-- Add 'inquiry' to order status and tracking fields

-- Widen the status check to include inquiry
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('inquiry','new','production','quality','ready','shipped','delivered','cancelled'));

-- Update default to inquiry for new orders
alter table orders alter column status set default 'inquiry';

-- Tracking fields for shipped orders
alter table orders add column if not exists tracking_number text;
alter table orders add column if not exists carrier         text;
