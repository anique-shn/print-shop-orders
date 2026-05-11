export type OrderStatus = 'inquiry' | 'new' | 'production' | 'quality' | 'ready' | 'shipped' | 'delivered' | 'cancelled';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type DiscountType = 'percent' | 'flat';
export type PaymentTerms = 'due_on_receipt' | 'net15' | 'net30' | 'net45' | 'net60' | 'cod';

export interface Database {
  public: {
    Tables: {
      items: { Row: Item; Insert: ItemInsert; Update: Partial<ItemInsert> };
      item_variants: { Row: ItemVariant; Insert: ItemVariantInsert; Update: Partial<ItemVariantInsert> };
      item_variant_pricing: { Row: VariantPricing; Insert: VariantPricingInsert; Update: Partial<VariantPricingInsert> };
      customers: { Row: Customer; Insert: CustomerInsert; Update: Partial<CustomerInsert> };
      orders: { Row: Order; Insert: OrderInsert; Update: Partial<OrderInsert> };
      order_items: { Row: OrderItem; Insert: OrderItemInsert; Update: Partial<OrderItemInsert> };
      invoices: { Row: Invoice; Insert: InvoiceInsert; Update: Partial<InvoiceInsert> };
      invoice_items: { Row: InvoiceItem; Insert: InvoiceItemInsert; Update: Partial<InvoiceItemInsert> };
      company_settings: { Row: CompanySettings; Insert: Partial<CompanySettings>; Update: Partial<CompanySettings> };
    };
  };
}

export interface Item {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  created_at: string;
}
export type ItemInsert = Omit<Item, 'id' | 'created_at'>;

export interface ItemVariant {
  id: string;
  item_id: string;
  name: string;
  description: string | null;
  created_at: string;
}
export type ItemVariantInsert = Omit<ItemVariant, 'id' | 'created_at'>;

export interface VariantPricing {
  id: string;
  variant_id: string;
  min_qty: number;
  max_qty: number | null;
  price_per_unit: number;
  created_at: string;
}
export type VariantPricingInsert = Omit<VariantPricing, 'id' | 'created_at'>;

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  created_at: string;
}
export type CustomerInsert = Omit<Customer, 'id' | 'created_at'>;

export interface Order {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_company: string | null;
  status: OrderStatus;
  due_date: string | null;
  notes: string | null;
  image_url: string | null;
  discount_type: DiscountType;
  discount_value: number;
  tax_rate: number;
  deposit_amount: number;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  updated_at: string;
}
export type OrderInsert = Omit<Order, 'id' | 'created_at' | 'updated_at'>;

export interface OrderItem {
  id: string;
  order_id: string;
  item_id: string | null;
  variant_id: string | null;
  description: string;
  decoration_type: string | null;
  decoration_location: string | null;
  color: string | null;
  size: string | null;
  qty: number;
  unit_price: number;
  taxable: boolean;
  image_url: string | null;
  notes: string | null;
  // Production (Multi-SKU) template fields
  line_type: 'product' | 'service' | 'fee' | 'garment' | 'setup_fee';
  garment_id: string | null;
  size_matrix: Record<string, number> | null;
  blank_cost: number | null;
  markup_pct: number | null;
  price_overridden: boolean;
  override_reason: string | null;
  // Optional joins
  parent_order_item_id?: string | null;
  product_id?: string | null;
  service_item_id?: string | null;
  order_item_decorations?: OrderItemDecoration[];
  order_item_finishing?: OrderItemFinishing[];
  created_at: string;
}
export type OrderItemInsert = Omit<OrderItem, 'id' | 'created_at' | 'order_item_decorations' | 'order_item_finishing'>;

export interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_company: string | null;
  customer_address: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  payment_terms: PaymentTerms;
  discount_type: DiscountType;
  discount_value: number;
  tax_rate: number;
  notes: string | null;
  terms: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}
export type InvoiceInsert = Omit<Invoice, 'id' | 'created_at' | 'updated_at'>;

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  qty: number;
  rate: number;
  taxable: boolean;
  size_label: string | null;
  order_item_id: string | null;
  created_at: string;
}
export type InvoiceItemInsert = Omit<InvoiceItem, 'id' | 'created_at'>;

export interface CompanySettings {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  tax_number: string | null;
  default_tax_rate: number;
  default_payment_terms: PaymentTerms;
  invoice_notes: string | null;
  invoice_terms: string | null;
  primary_color: string | null;
  accent_color: string | null;
  email_footer: string | null;
  updated_at: string;
}

// ── Service Catalog Types ──────────────────────────────────────────────────────

export interface ServiceGroup {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
}
export type ServiceGroupInsert = Omit<ServiceGroup, 'id' | 'created_at'>;

export interface ServiceItem {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  pricing_type: 'moq' | 'flat';
  flat_price: number | null;
  icon: string | null;
  color: string | null;
  image_url: string | null;
  sort_order: number;
  created_at: string;
}
export type ServiceItemInsert = Omit<ServiceItem, 'id' | 'created_at'>;

export interface ServiceItemTier {
  id: string;
  item_id: string;
  min_qty: number;
  max_qty: number | null;
  price_per_unit: number;
  created_at: string;
}
export type ServiceItemTierInsert = Omit<ServiceItemTier, 'id' | 'created_at'>;

export interface ServiceItemWithTiers extends ServiceItem {
  tiers: ServiceItemTier[];
}
export interface ServiceGroupWithItems extends ServiceGroup {
  items: ServiceItemWithTiers[];
}

// ── Product Types ──────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  base_price: number | null;
  sort_order: number;
  created_at: string;
}
export type ProductInsert = Omit<Product, 'id' | 'created_at'>;

// ── Decoration Groups (generic matrix system) ─────────────────────────────────

export interface DecorationGroup {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  col_labels: string[];
  col_count: number;
  sort_order: number;
  active: boolean;
  created_at: string;
}
export type DecorationGroupInsert = Omit<DecorationGroup, 'id' | 'created_at'>;

export interface DecorationMatrixRow {
  id: string;
  group_id: string;
  qty_min: number;
  qty_max: number | null;
  prices: (number | null)[];
  created_at: string;
}
export type DecorationMatrixRowInsert = Omit<DecorationMatrixRow, 'id' | 'created_at'>;

// ── Production (Multi-SKU) Template Types ─────────────────────────────────────

export interface Garment {
  id: string;
  brand: string;
  style_number: string | null;
  name: string;
  category: string | null;
  color: string | null;
  base_cost: number;
  size_upcharges: Record<string, number>;
  markup_value: number;
  active: boolean;
  sort_order: number;
  created_at: string;
}
export type GarmentInsert = Omit<Garment, 'id' | 'created_at'>;

export interface ScreenPrintMatrix {
  id: string;
  qty_min: number;
  qty_max: number | null;
  colors_1: number | null;
  colors_2: number | null;
  colors_3: number | null;
  colors_4: number | null;
  colors_5: number | null;
  colors_6: number | null;
  created_at: string;
}

export interface EmbroideryMatrix {
  id: string;
  qty_min: number;
  qty_max: number | null;
  stitches_5k: number | null;
  stitches_10k: number | null;
  stitches_15k: number | null;
  stitches_20k: number | null;
  created_at: string;
}

export interface FinishingService {
  id: string;
  name: string;
  unit_price: number;
  group_name: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface OrderItemDecoration {
  id: string;
  order_item_id: string;
  decoration_type: string;           // group name, e.g. "Screen Print"
  decoration_group_id: string | null;
  location: string;
  col_index: number | null;          // 0-based column index in the group's matrix
  colors: number | null;             // legacy
  stitch_count: number | null;       // legacy
  unit_price: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
}
export type OrderItemDecorationInsert = Omit<OrderItemDecoration, 'id' | 'created_at'>;

export interface OrderItemFinishing {
  id: string;
  order_item_id: string;
  finishing_service_id: string | null;
  service_name: string;
  unit_price: number;
  sort_order: number;
  created_at: string;
}
export type OrderItemFinishingInsert = Omit<OrderItemFinishing, 'id' | 'created_at'>;

// ── Extended CompanySettings with branding ────────────────────────────────────
