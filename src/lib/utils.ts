import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function generateOrderNumber(): string {
  const prefix = 'ORD';
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${timestamp}`;
}

export function generateInvoiceNumber(): string {
  const prefix = 'INV';
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${timestamp}`;
}

export function calcSubtotal(items: { qty: number; unit_price: number }[]): number {
  return items.reduce((sum, i) => sum + i.qty * i.unit_price, 0);
}

export function calcDiscount(subtotal: number, type: 'percent' | 'flat', value: number): number {
  if (type === 'percent') return (subtotal * value) / 100;
  return Math.min(value, subtotal);
}

export function calcTax(amount: number, rate: number): number {
  return (amount * rate) / 100;
}

export const ORDER_STATUSES = [
  { value: 'inquiry',    label: 'Inquiry',           color: 'status-inquiry',    dot: '#6366f1' },
  { value: 'new',        label: 'Confirmed',         color: 'status-new',        dot: '#2E7CF6' },
  { value: 'production', label: 'In Production',     color: 'status-production', dot: '#f59e0b' },
  { value: 'quality',    label: 'Quality Check',     color: 'status-quality',    dot: '#8b5cf6' },
  { value: 'ready',      label: 'Ready',             color: 'status-ready',      dot: '#10b981' },
  { value: 'shipped',    label: 'Shipped',           color: 'status-shipped',    dot: '#06b6d4' },
  { value: 'delivered',  label: 'Delivered',         color: 'status-delivered',  dot: '#22c55e' },
  { value: 'cancelled',  label: 'Cancelled',         color: 'status-cancelled',  dot: '#ef4444' },
] as const;

export const ORDER_EMAIL_TEMPLATES: Record<string, { subject: string; body: string }> = {
  inquiry: {
    subject: 'We received your inquiry — {order_number}',
    body: `Hi {customer_name},

Thank you for reaching out! We've received your inquiry ({order_number}) and our team will review the details shortly.

We'll be in touch with a quote soon.

Best regards`,
  },
  new: {
    subject: 'Your order is confirmed — {order_number}',
    body: `Hi {customer_name},

Great news! Your order {order_number} has been confirmed and we're getting ready to begin production.

If you have any questions, don't hesitate to reach out.

Best regards`,
  },
  production: {
    subject: 'Your order is in production — {order_number}',
    body: `Hi {customer_name},

Your order {order_number} has entered production. Our team is actively working on it.

We'll update you as soon as it moves to the next stage.

Best regards`,
  },
  quality: {
    subject: 'Quality check underway — {order_number}',
    body: `Hi {customer_name},

Your order {order_number} is in our quality check phase — we're almost done!

Best regards`,
  },
  ready: {
    subject: 'Your order is ready — {order_number}',
    body: `Hi {customer_name},

Your order {order_number} is complete and ready! Please let us know your preferred pickup or delivery arrangement.

Best regards`,
  },
  shipped: {
    subject: 'Your order has shipped — {order_number}',
    body: `Hi {customer_name},

Your order {order_number} is on its way!

{tracking_info}

Best regards`,
  },
  delivered: {
    subject: 'Your order has been delivered — {order_number}',
    body: `Hi {customer_name},

We hope you love your order {order_number}! Thank you for your business.

Please don't hesitate to reach out if anything needs attention.

Best regards`,
  },
};

export const INVOICE_STATUSES = [
  { value: 'draft',     label: 'Draft',     color: 'inv-draft' },
  { value: 'sent',      label: 'Sent',      color: 'inv-sent' },
  { value: 'paid',      label: 'Paid',      color: 'inv-paid' },
  { value: 'overdue',   label: 'Overdue',   color: 'inv-overdue' },
  { value: 'cancelled', label: 'Cancelled', color: 'inv-cancelled' },
] as const;

export const DECORATION_TYPES = [
  'Screen Printing',
  'Embroidery',
  'DTG (Direct to Garment)',
  'DTF (Direct to Film)',
  'Vinyl Heat Transfer',
  'Sublimation',
  'Patch',
  'Other',
];

export const DECORATION_LOCATIONS = [
  'Left Chest',
  'Right Chest',
  'Full Front',
  'Full Back',
  'Left Sleeve',
  'Right Sleeve',
  'Back Yoke',
  'Hem',
  'Other',
];

export const PAYMENT_TERMS = [
  { value: 'due_on_receipt', label: 'Due on Receipt' },
  { value: 'net15',  label: 'Net 15' },
  { value: 'net30',  label: 'Net 30' },
  { value: 'net45',  label: 'Net 45' },
  { value: 'net60',  label: 'Net 60' },
  { value: 'cod',    label: 'Cash on Delivery' },
];
