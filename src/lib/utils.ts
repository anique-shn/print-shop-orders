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
  { value: 'new',        label: 'New Order',        color: 'status-new' },
  { value: 'production', label: 'In Production',     color: 'status-production' },
  { value: 'quality',    label: 'Quality Check',     color: 'status-quality' },
  { value: 'ready',      label: 'Ready',             color: 'status-ready' },
  { value: 'shipped',    label: 'Shipped',           color: 'status-shipped' },
  { value: 'delivered',  label: 'Delivered',         color: 'status-delivered' },
  { value: 'cancelled',  label: 'Cancelled',         color: 'status-cancelled' },
] as const;

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
