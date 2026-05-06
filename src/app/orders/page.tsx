'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Plus, Search, List, LayoutGrid, X, ChevronRight,
  Pencil, Trash2, ShoppingCart, FileText, Check, Mail,
  Bell, Truck, Copy, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import {
  formatCurrency, formatDate, generateOrderNumber, generateInvoiceNumber,
  ORDER_STATUSES, ORDER_EMAIL_TEMPLATES, DECORATION_TYPES, DECORATION_LOCATIONS,
  calcSubtotal, calcDiscount, calcTax,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Order, OrderItem, Customer } from '@/types/database';
import { OrderCreateModal } from './OrderCreateModal';

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderWithItems = Order & { order_items?: OrderItem[] };

interface LineItemRow {
  description: string;
  decoration_type: string;
  decoration_location: string;
  color: string;
  size: string;
  qty: number;
  unit_price: number;
  taxable: boolean;
  image_url: string;
}

const emptyLine = (): LineItemRow => ({
  description: '', decoration_type: '', decoration_location: '',
  color: '', size: '', qty: 1, unit_price: 0, taxable: false, image_url: '',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const def = ORDER_STATUSES.find((s) => s.value === status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${def?.color ?? ''}`}>
      {def?.label ?? status}
    </span>
  );
}

function orderTotal(order: OrderWithItems): number {
  const items = order.order_items ?? [];
  const sub = calcSubtotal(items.map((i) => ({ qty: i.qty, unit_price: i.unit_price })));
  const disc = calcDiscount(sub, order.discount_type, order.discount_value);
  const tax = calcTax(sub - disc, order.tax_rate);
  return sub - disc + tax;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderWithItems[];
    },
  });
}

function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').order('name');
      return (data ?? []) as Customer[];
    },
  });
}

// ── Create Invoice from Order ─────────────────────────────────────────────────

async function createInvoiceFromOrder(order: OrderWithItems, qc: ReturnType<typeof useQueryClient>) {
  try {
    const invNum = generateInvoiceNumber();
    const today = new Date().toISOString().split('T')[0];
    const { data: inv, error: invErr } = await db
      .from('invoices')
      .insert({
        invoice_number: invNum,
        order_id: order.id,
        customer_id: order.customer_id,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_company: order.customer_company,
        customer_address: null,
        status: 'draft',
        issue_date: today,
        due_date: null,
        payment_terms: 'net30',
        discount_type: order.discount_type,
        discount_value: order.discount_value,
        tax_rate: order.tax_rate,
        notes: null,
        terms: null,
        sent_at: null,
        paid_at: null,
      })
      .select('id')
      .single();
    if (invErr) throw invErr;

    if (order.order_items?.length) {
      const invItems = order.order_items.map((oi) => ({
        invoice_id: inv.id,
        description: oi.description,
        qty: oi.qty,
        rate: oi.unit_price,
        taxable: oi.taxable,
      }));
      const { error: iiErr } = await db.from('invoice_items').insert(invItems);
      if (iiErr) throw iiErr;
    }

    qc.invalidateQueries({ queryKey: ['invoices'] });
    toast.success(`Invoice ${invNum} created from order`);
    return inv.id;
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : 'Failed to create invoice');
    return null;
  }
}

// ── Email Compose Modal ───────────────────────────────────────────────────────

function EmailComposeModal({
  open,
  onClose,
  order,
  triggerStatus,
}: {
  open: boolean;
  onClose: () => void;
  order: OrderWithItems;
  triggerStatus: string;
}) {
  const tpl = ORDER_EMAIL_TEMPLATES[triggerStatus];
  const trackingInfo = order.tracking_number
    ? `Tracking: ${order.tracking_number}${order.carrier ? ` via ${order.carrier}` : ''}`
    : '';

  const fillTemplate = (str: string) =>
    str
      .replace(/{customer_name}/g, order.customer_name ?? 'there')
      .replace(/{order_number}/g, order.order_number)
      .replace(/{tracking_info}/g, trackingInfo);

  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (!open || !tpl) return;
    setTo(order.customer_email ?? '');
    setCc('');
    setSubject(fillTemplate(tpl.subject));
    setBody(fillTemplate(tpl.body));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, triggerStatus]);

  const openMailto = () => {
    const params = new URLSearchParams();
    if (cc) params.set('cc', cc);
    params.set('subject', subject);
    params.set('body', body);
    window.open(`mailto:${to}?${params.toString()}`);
  };

  const copyBody = () => {
    navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
    toast.success('Copied to clipboard');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" style={{ color: 'hsl(218 91% 57%)' }} />
            Send Status Update
          </DialogTitle>
          <DialogDescription>Review and edit before sending.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input className="h-8 text-sm" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@email.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CC <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input className="h-8 text-sm" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@email.com" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subject</Label>
            <Input className="h-8 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Message</Label>
            <Textarea className="text-sm" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={copyBody}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" onClick={openMailto} style={{ backgroundColor: 'hsl(218 91% 57%)' }}>
            <ExternalLink className="h-3.5 w-3.5" /> Open in Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Order Detail Panel ────────────────────────────────────────────────────────

type RichOrderItem = OrderItem & {
  line_type?: 'product' | 'service' | 'fee';
  product_id?: string | null;
  service_item_id?: string | null;
  parent_order_item_id?: string | null;
};

function ItemsAccordion({ items }: { items: RichOrderItem[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    items.forEach((i) => { if (i.line_type === 'product' || !i.line_type) s.add(i.id); });
    return s;
  });

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const productItems = items.filter(
    (i) => i.line_type === 'product'
  );
  const standaloneServices = items.filter(
    (i) => (i.line_type === 'service' || !i.line_type) && !i.parent_order_item_id
  );
  const feeItems = items.filter((i) => i.line_type === 'fee');

  const renderServiceRow = (item: RichOrderItem, indent = false) => {
    const isFee = item.line_type === 'fee';
    const dotColor = isFee ? 'hsl(38 92% 50%)' : 'hsl(218 91% 57%)';
    return (
      <div
        key={item.id}
        className="flex items-center gap-3 py-2.5 text-sm"
      >
        {indent && (
          <span
            className="h-2 w-2 rounded-full shrink-0 ml-1"
            style={{ backgroundColor: dotColor }}
          />
        )}
        {!indent && isFee && (
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: dotColor }}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className={`font-medium truncate ${indent ? 'text-xs' : 'text-sm'}`}>{item.description}</p>
          {item.decoration_location && (
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.decoration_location}</p>
          )}
        </div>
        {item.unit_price > 0 && (
          <div className="text-right shrink-0">
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {item.qty.toLocaleString()} × {formatCurrency(item.unit_price)}
            </p>
            <p className={`font-semibold ${indent ? 'text-xs' : 'text-sm'}`}>{formatCurrency(item.qty * item.unit_price)}</p>
          </div>
        )}
      </div>
    );
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Product items with children */}
      {productItems.map((product) => {
        const children = items.filter(
          (i) => (i.line_type === 'service' || !i.line_type) && i.parent_order_item_id === product.id
        );
        const isHeader = product.unit_price === 0;
        const expanded = expandedIds.has(product.id);

        return (
          <div
            key={product.id}
            className="rounded-lg border overflow-hidden"
            style={{ borderLeft: '3px solid hsl(218 91% 57%)', borderColor: 'hsl(var(--border))', borderLeftColor: 'hsl(218 91% 57%)' }}
          >
            {/* Product row */}
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
              style={isHeader ? { backgroundColor: 'hsl(var(--muted) / 0.5)' } : undefined}
              onClick={() => toggle(product.id)}
            >
              {isHeader ? (
                <p className="flex-1 text-xs font-bold uppercase tracking-widest truncate" style={{ color: 'hsl(var(--foreground))' }}>
                  {product.description}
                </p>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{product.description}</p>
                    {(product.color || product.size) && (
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {[product.color, product.size].filter(Boolean).join(' / ')}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5 mr-2">
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {product.qty.toLocaleString()} × {formatCurrency(product.unit_price)}
                    </p>
                    <p className="text-sm font-bold">{formatCurrency(product.qty * product.unit_price)}</p>
                  </div>
                </>
              )}
              {children.length > 0 && (
                expanded
                  ? <ChevronUp className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  : <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
              )}
            </button>

            {/* Child services */}
            {expanded && children.length > 0 && (
              <div className="border-t px-4" style={{ borderColor: 'hsl(var(--border))' }}>
                {children.map((child, idx) => (
                  <div
                    key={child.id}
                    className={idx < children.length - 1 ? 'border-b' : ''}
                    style={{ borderColor: 'hsl(var(--border))' }}
                  >
                    {renderServiceRow(child, true)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Standalone services (no parent) */}
      {standaloneServices.length > 0 && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
          {standaloneServices.map((item, idx) => (
            <div
              key={item.id}
              className={`px-4 ${idx < standaloneServices.length - 1 ? 'border-b' : ''}`}
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              {renderServiceRow(item, false)}
            </div>
          ))}
        </div>
      )}

      {/* Fee items */}
      {feeItems.length > 0 && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(38 92% 50% / 0.3)', backgroundColor: 'hsl(38 92% 50% / 0.03)' }}>
          {feeItems.map((item, idx) => (
            <div
              key={item.id}
              className={`px-4 ${idx < feeItems.length - 1 ? 'border-b' : ''}`}
              style={{ borderColor: 'hsl(38 92% 50% / 0.3)' }}
            >
              {renderServiceRow(item, false)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderDetailPanel({
  order,
  onClose,
  onEdit,
}: {
  order: OrderWithItems;
  onClose: () => void;
  onEdit: (o: OrderWithItems) => void;
}) {
  const qc = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? '');
  const [carrier, setCarrier] = useState(order.carrier ?? '');
  const [savingTracking, setSavingTracking] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const router = useRouter();

  const moveStatus = async (newStatus: string) => {
    if (newStatus === order.status) return;
    setUpdating(true);
    try {
      await db.from('orders').update({ status: newStatus }).eq('id', order.id);
      await db.from('order_status_history').insert({
        order_id: order.id,
        from_status: order.status,
        to_status: newStatus,
      });
      qc.invalidateQueries({ queryKey: ['orders'] });
      setNotifyStatus(newStatus);
      toast.success(`Moved to ${ORDER_STATUSES.find((s) => s.value === newStatus)?.label}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setUpdating(false);
    }
  };

  const handleCreateInvoice = async () => {
    const id = await createInvoiceFromOrder(order, qc);
    if (id) router.push('/invoices');
  };

  const saveTracking = async () => {
    setSavingTracking(true);
    try {
      await db.from('orders').update({ tracking_number: trackingNumber || null, carrier: carrier || null }).eq('id', order.id);
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Tracking saved');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSavingTracking(false);
    }
  };

  const richItems = (order.order_items ?? []) as RichOrderItem[];
  // For totals, exclude $0-price product headers
  const billableItems = richItems.filter((i) => i.unit_price > 0);
  const total = orderTotal(order);
  const sub = calcSubtotal(billableItems.map((i) => ({ qty: i.qty, unit_price: i.unit_price })));
  const disc = calcDiscount(sub, order.discount_type, order.discount_value);
  const tax = calcTax(sub - disc, order.tax_rate);

  const CARRIERS = ['UPS', 'FedEx', 'USPS', 'DHL', 'Other'];

  return (
    <>
      <div className="fixed inset-0 z-40 flex">
        {/* Backdrop */}
        <div className="flex-1 bg-black/30" onClick={onClose} />

        {/* Right panel — max-w-xl */}
        <div
          className="flex flex-col h-full shadow-2xl overflow-hidden"
          style={{ width: 'min(100vw, 576px)', backgroundColor: 'hsl(var(--background))' }}
        >
          {/* ── Header ── */}
          <div className="shrink-0 px-6 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h2 className="font-bold text-xl font-heading">{order.order_number}</h2>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {order.customer_name ?? '—'}
                  {order.customer_company ? ` · ${order.customer_company}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border font-medium transition-colors hover:bg-accent"
                  style={{ borderColor: 'hsl(var(--border))' }}
                  onClick={() => onEdit(order)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Status Select */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>Status:</span>
              <Select value={order.status} onValueChange={moveStatus} disabled={updating}>
                <SelectTrigger className="h-7 text-xs w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${s.color}`}>
                          {s.label}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Body (scrollable) ── */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Notify banner */}
            {notifyStatus && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border"
                style={{ background: '#FFF8EC', borderColor: 'rgba(245,166,35,.4)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Bell className="h-4 w-4 shrink-0" style={{ color: '#F5A623' }} />
                  <p className="text-xs font-semibold truncate">
                    Moved to <strong>{ORDER_STATUSES.find(s => s.value === notifyStatus)?.label}</strong>. Notify?
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    className="h-7 text-xs px-2"
                    style={{ backgroundColor: '#F5A623' }}
                    onClick={() => { setEmailStatus(notifyStatus); setEmailOpen(true); setNotifyStatus(null); }}
                  >
                    <Mail className="h-3 w-3" /> Email
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setNotifyStatus(null)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            {/* Customer info */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Customer</p>
              <div className="space-y-0.5 text-sm">
                <p className="font-semibold">{order.customer_name ?? '—'}</p>
                {order.customer_company && <p style={{ color: 'hsl(var(--muted-foreground))' }}>{order.customer_company}</p>}
                {order.customer_email && <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{order.customer_email}</p>}
                {order.customer_phone && <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{order.customer_phone}</p>}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Due Date</p>
                <p className="font-medium">{order.due_date ? formatDate(order.due_date) : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Created</p>
                <p className="font-medium">{formatDate(order.created_at)}</p>
              </div>
            </div>

            {/* Notes */}
            {order.notes && (
              <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</p>
                <p className="leading-relaxed">{order.notes}</p>
              </div>
            )}

            {/* Line Items */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Line Items{richItems.length > 0 ? ` (${richItems.length})` : ''}
              </p>
              {richItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center rounded-lg border border-dashed" style={{ borderColor: 'hsl(var(--border))' }}>
                  <ShoppingCart className="h-8 w-8 mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <p className="text-sm font-semibold">No items yet</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => onEdit(order)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit Order
                  </Button>
                </div>
              ) : (
                <ItemsAccordion items={richItems} />
              )}
            </div>

            {/* Totals card */}
            <div className="rounded-xl border p-4 space-y-2 text-sm" style={{ borderColor: 'hsl(var(--border))' }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Summary</p>
              <div className="flex justify-between" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <span>Subtotal</span>
                <span className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>{formatCurrency(sub)}</span>
              </div>
              {disc > 0 && (
                <div className="flex justify-between" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  <span>Discount ({order.discount_type === 'percent' ? `${order.discount_value}%` : 'flat'})</span>
                  <span className="font-medium text-red-500">-{formatCurrency(disc)}</span>
                </div>
              )}
              {order.tax_rate > 0 && (
                <div className="flex justify-between" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  <span>Tax ({order.tax_rate}%)</span>
                  <span className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>{formatCurrency(tax)}</span>
                </div>
              )}
              {order.deposit_amount > 0 && (
                <div className="flex justify-between" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  <span>Deposit</span>
                  <span className="font-medium text-green-600">-{formatCurrency(order.deposit_amount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-3 mt-1 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                <span className="font-bold text-base">Total</span>
                <span className="font-bold text-xl" style={{ color: 'hsl(218 91% 57%)' }}>{formatCurrency(total)}</span>
              </div>
              {order.deposit_amount > 0 && (
                <div className="flex justify-between text-sm font-semibold" style={{ color: 'hsl(218 91% 57%)' }}>
                  <span>Balance Due</span>
                  <span>{formatCurrency(Math.max(0, total - order.deposit_amount))}</span>
                </div>
              )}
            </div>

            {/* Tracking (collapsible) */}
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
                onClick={() => setTrackingOpen((v) => !v)}
              >
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <span className="text-sm font-semibold">Tracking</span>
                  {(order.tracking_number) && (
                    <span className="text-xs font-mono ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{order.tracking_number}</span>
                  )}
                </div>
                {trackingOpen
                  ? <ChevronUp className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  : <ChevronDown className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                }
              </button>
              {trackingOpen && (
                <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: 'hsl(var(--border))' }}>
                  <div className="space-y-1">
                    <Label className="text-xs">Carrier</Label>
                    <Select value={carrier || '__none__'} onValueChange={(v) => setCarrier(v === '__none__' ? '' : v)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select carrier…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Select carrier —</SelectItem>
                        {CARRIERS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tracking Number</Label>
                    <Input
                      className="h-8 text-sm font-mono"
                      placeholder="1Z999AA10123456784"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    size="sm"
                    onClick={saveTracking}
                    disabled={savingTracking}
                    style={{ backgroundColor: 'hsl(218 91% 57%)' }}
                  >
                    {savingTracking ? 'Saving…' : 'Save Tracking'}
                  </Button>
                </div>
              )}
            </div>

          </div>

          {/* ── Bottom action bar ── */}
          <div className="shrink-0 px-6 py-3 border-t flex items-center gap-2" style={{ borderColor: 'hsl(var(--border))' }}>
            <Button
              className="flex-1"
              onClick={handleCreateInvoice}
              style={{ backgroundColor: 'hsl(218 91% 57%)' }}
            >
              <FileText className="h-4 w-4" /> Create Invoice
            </Button>
            <Button
              variant="outline"
              onClick={() => onEdit(order)}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit Order
            </Button>
            <Button
              variant="outline"
              onClick={() => { setEmailStatus(order.status); setEmailOpen(true); }}
            >
              <Mail className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>{/* end panel */}
      </div>

      <EmailComposeModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        order={order}
        triggerStatus={emailStatus}
      />
    </>
  );
}

// ── Create/Edit Order Modal ───────────────────────────────────────────────────

function OrderModal({
  open,
  onClose,
  editOrder,
}: {
  open: boolean;
  onClose: () => void;
  editOrder?: OrderWithItems | null;
}) {
  const qc = useQueryClient();
  const { data: customers = [] } = useCustomers();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — customer
  const [customerMode, setCustomerMode] = useState<'select' | 'inline'>('select');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custCompany, setCustCompany] = useState('');

  // Step 2 — order details
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [taxRate, setTaxRate] = useState('');

  // Step 3 — line items
  const [lines, setLines] = useState<LineItemRow[]>([emptyLine()]);

  // Populate from edit order
  useEffect(() => {
    if (!open) return;
    if (editOrder) {
      const cId = editOrder.customer_id ?? '';
      setCustomerMode(cId ? 'select' : 'inline');
      setSelectedCustomerId(cId);
      setCustName(editOrder.customer_name ?? '');
      setCustEmail(editOrder.customer_email ?? '');
      setCustPhone(editOrder.customer_phone ?? '');
      setCustCompany(editOrder.customer_company ?? '');
      setDueDate(editOrder.due_date ?? '');
      setNotes(editOrder.notes ?? '');
      setImageUrl(editOrder.image_url ?? '');
      setDepositAmount(String(editOrder.deposit_amount ?? ''));
      setDiscountType(editOrder.discount_type ?? 'percent');
      setDiscountValue(String(editOrder.discount_value ?? ''));
      setTaxRate(String(editOrder.tax_rate ?? ''));
      setLines(
        editOrder.order_items?.length
          ? editOrder.order_items.map((oi) => ({
              description: oi.description,
              decoration_type: oi.decoration_type ?? '',
              decoration_location: oi.decoration_location ?? '',
              color: oi.color ?? '',
              size: oi.size ?? '',
              qty: oi.qty,
              unit_price: oi.unit_price,
              taxable: oi.taxable,
              image_url: oi.image_url ?? '',
            }))
          : [emptyLine()]
      );
    } else {
      setStep(1);
      setCustomerMode('select');
      setSelectedCustomerId('');
      setCustName(''); setCustEmail(''); setCustPhone(''); setCustCompany('');
      setDueDate(''); setNotes(''); setImageUrl(''); setDepositAmount('');
      setDiscountType('percent'); setDiscountValue(''); setTaxRate('');
      setLines([emptyLine()]);
    }
  }, [open, editOrder]);

  const updateLine = (i: number, key: keyof LineItemRow, val: string | boolean | number) => {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l));
  };

  // Derived totals
  const sub = calcSubtotal(lines.map((l) => ({ qty: l.qty, unit_price: l.unit_price })));
  const disc = calcDiscount(sub, discountType, parseFloat(discountValue) || 0);
  const tax = calcTax(sub - disc, parseFloat(taxRate) || 0);
  const total = sub - disc + tax;

  const resolveCustomer = () => {
    if (customerMode === 'select' && selectedCustomerId) {
      const c = customers.find((x) => x.id === selectedCustomerId);
      return {
        customer_id: c?.id ?? null,
        customer_name: c?.name ?? null,
        customer_email: c?.email ?? null,
        customer_phone: c?.phone ?? null,
        customer_company: c?.company ?? null,
      };
    }
    return {
      customer_id: null,
      customer_name: custName || null,
      customer_email: custEmail || null,
      customer_phone: custPhone || null,
      customer_company: custCompany || null,
    };
  };

  const save = async () => {
    if (!custName && customerMode === 'inline' && !selectedCustomerId) {
      toast.error('Customer name is required'); return;
    }
    setSaving(true);
    try {
      const cust = resolveCustomer();
      const orderData = {
        ...cust,
        order_number: editOrder?.order_number ?? generateOrderNumber(),
        status: editOrder?.status ?? 'inquiry' as const,
        due_date: dueDate || null,
        notes: notes || null,
        image_url: imageUrl || null,
        deposit_amount: parseFloat(depositAmount) || 0,
        discount_type: discountType,
        discount_value: parseFloat(discountValue) || 0,
        tax_rate: parseFloat(taxRate) || 0,
      };

      let orderId = editOrder?.id;
      if (editOrder) {
        const { error } = await db.from('orders').update(orderData).eq('id', editOrder.id);
        if (error) throw error;
        await db.from('order_items').delete().eq('order_id', editOrder.id);
      } else {
        const { data, error } = await db.from('orders').insert(orderData).select('id').single();
        if (error) throw error;
        orderId = data.id;
      }

      const itemRows = lines.filter((l) => l.description.trim()).map((l) => ({
        order_id: orderId!,
        item_id: null,
        variant_id: null,
        description: l.description,
        decoration_type: l.decoration_type || null,
        decoration_location: l.decoration_location || null,
        color: l.color || null,
        size: l.size || null,
        qty: l.qty,
        unit_price: l.unit_price,
        taxable: l.taxable,
        image_url: l.image_url || null,
        notes: null,
      }));
      if (itemRows.length) {
        const { error } = await db.from('order_items').insert(itemRows);
        if (error) throw error;
      }

      toast.success(editOrder ? 'Order updated' : 'Order created');
      qc.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  const stepLabels = ['Customer', 'Details', 'Line Items'];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editOrder ? `Edit ${editOrder.order_number}` : 'New Order'}</DialogTitle>
          <DialogDescription>
            {editOrder ? 'Update order information.' : 'Step through to create a new order.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {!editOrder && (
          <div className="flex items-center gap-2 px-6 pb-2">
            {stepLabels.map((label, i) => {
              const s = i + 1;
              const active = step === s;
              const done = step > s;
              return (
                <div key={s} className="flex items-center gap-2">
                  <button
                    className="flex items-center gap-2 text-sm font-medium"
                    onClick={() => s < step && setStep(s)}
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: active || done ? 'hsl(218, 91%, 57%)' : 'hsl(var(--muted))',
                        color: active || done ? 'white' : 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {done ? <Check className="h-3 w-3" /> : s}
                    </span>
                    <span style={{ color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
                      {label}
                    </span>
                  </button>
                  {i < stepLabels.length - 1 && (
                    <ChevronRight className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="px-6 pb-2 space-y-4">
          {/* STEP 1: Customer */}
          {(step === 1 || editOrder) && (
            <div className="space-y-4">
              {!editOrder && <h3 className="font-semibold">Customer Information</h3>}
              <div className="flex gap-2 mb-3">
                <button
                  className="text-sm px-3 py-1.5 rounded-md border font-medium transition-colors"
                  style={{
                    backgroundColor: customerMode === 'select' ? 'hsl(218, 91%, 57%)' : 'white',
                    color: customerMode === 'select' ? 'white' : 'hsl(var(--foreground))',
                    borderColor: 'hsl(var(--border))',
                  }}
                  onClick={() => setCustomerMode('select')}
                >
                  Existing Customer
                </button>
                <button
                  className="text-sm px-3 py-1.5 rounded-md border font-medium transition-colors"
                  style={{
                    backgroundColor: customerMode === 'inline' ? 'hsl(218, 91%, 57%)' : 'white',
                    color: customerMode === 'inline' ? 'white' : 'hsl(var(--foreground))',
                    borderColor: 'hsl(var(--border))',
                  }}
                  onClick={() => setCustomerMode('inline')}
                >
                  Enter Manually
                </button>
              </div>

              {customerMode === 'select' ? (
                <div className="space-y-1.5">
                  <Label>Select Customer</Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Search and select customer…" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.company ? ` — ${c.company}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Name <span className="text-red-500">*</span></Label>
                    <Input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Full name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Company</Label>
                    <Input value={custCompany} onChange={(e) => setCustCompany(e.target.value)} placeholder="Company" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} placeholder="email@example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="(555) 000-0000" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Details */}
          {(step === 2 || editOrder) && (
            <div className="space-y-4">
              {!editOrder && <h3 className="font-semibold">Order Details</h3>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Deposit Amount ($)</Label>
                  <Input type="number" min={0} step={0.01} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Discount Type</Label>
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'percent' | 'flat')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent (%)</SelectItem>
                      <SelectItem value="flat">Flat ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Discount Value</Label>
                  <Input type="number" min={0} step={0.01} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tax Rate (%)</Label>
                  <Input type="number" min={0} step={0.01} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Reference Image URL</Label>
                  <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" rows={2} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Line items */}
          {(step === 3 || editOrder) && (
            <div className="space-y-3">
              {!editOrder && <h3 className="font-semibold">Line Items</h3>}
              <div className="rounded-lg border overflow-x-auto" style={{ borderColor: 'hsl(var(--border))' }}>
                <table className="w-full text-sm min-w-200">
                  <thead style={{ backgroundColor: 'hsl(var(--muted))' }}>
                    <tr>
                      {['Description*', 'Type', 'Location', 'Color', 'Size', 'Qty', 'Unit Price', 'Tax', ''].map((h) => (
                        <th key={h} className="px-2 py-2 text-left text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                    {lines.map((line, i) => (
                      <tr key={i}>
                        <td className="px-2 py-2 min-w-40">
                          <Input className="h-8" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} placeholder="Item description" />
                        </td>
                        <td className="px-2 py-2 min-w-32">
                          <Select value={line.decoration_type} onValueChange={(v) => updateLine(i, 'decoration_type', v)}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="Type" /></SelectTrigger>
                            <SelectContent>
                              {DECORATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-2 min-w-30">
                          <Select value={line.decoration_location} onValueChange={(v) => updateLine(i, 'decoration_location', v)}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="Location" /></SelectTrigger>
                            <SelectContent>
                              {DECORATION_LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-2 w-20">
                          <Input className="h-8" value={line.color} onChange={(e) => updateLine(i, 'color', e.target.value)} placeholder="Black" />
                        </td>
                        <td className="px-2 py-2 w-16">
                          <Input className="h-8" value={line.size} onChange={(e) => updateLine(i, 'size', e.target.value)} placeholder="M" />
                        </td>
                        <td className="px-2 py-2 w-16">
                          <Input className="h-8" type="number" min={1} value={line.qty} onChange={(e) => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                        </td>
                        <td className="px-2 py-2 w-24">
                          <Input className="h-8" type="number" min={0} step={0.01} value={line.unit_price} onChange={(e) => updateLine(i, 'unit_price', parseFloat(e.target.value) || 0)} />
                        </td>
                        <td className="px-2 py-2 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={line.taxable}
                            onChange={(e) => updateLine(i, 'taxable', e.target.checked)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-2 py-2 w-8">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                            onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                            disabled={lines.length === 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
                <Plus className="h-3.5 w-3.5" /> Add Row
              </Button>

              {/* Live totals */}
              <div className="flex justify-end">
                <div className="space-y-1.5 text-sm w-60">
                  <div className="flex justify-between">
                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>Subtotal</span>
                    <span>{formatCurrency(sub)}</span>
                  </div>
                  {disc > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--muted-foreground))' }}>Discount</span>
                      <span className="text-red-600">-{formatCurrency(disc)}</span>
                    </div>
                  )}
                  {(parseFloat(taxRate) || 0) > 0 && (
                    <div className="flex justify-between">
                      <span style={{ color: 'hsl(var(--muted-foreground))' }}>Tax ({taxRate}%)</span>
                      <span>{formatCurrency(tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-1 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {editOrder ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <>
              {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              {step < 3 ? (
                <Button onClick={() => setStep(step + 1)}>Next →</Button>
              ) : (
                <Button onClick={save} disabled={saving}>
                  {saving ? 'Creating…' : 'Create Order'}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Kanban column ─────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  orders,
  onCardClick,
}: {
  status: (typeof ORDER_STATUSES)[number];
  orders: OrderWithItems[];
  onCardClick: (o: OrderWithItems) => void;
}) {
  return (
    <div className="flex-1 min-w-50 max-w-xs">
      <div className="flex items-center justify-between mb-3">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.color}`}>
          {status.label}
        </span>
        <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {orders.length}
        </span>
      </div>
      <div className="space-y-2">
        {orders.length === 0 ? (
          <div
            className="rounded-lg border-2 border-dashed p-4 text-center text-xs"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
          >
            No orders
          </div>
        ) : (
          orders.map((order) => {
            const total = orderTotal(order);
            return (
              <Card
                key={order.id}
                className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onCardClick(order)}
              >
                <div className="font-mono text-xs font-semibold mb-1" style={{ color: 'hsl(218, 91%, 57%)' }}>
                  {order.order_number}
                </div>
                <div className="font-medium text-sm mb-1">{order.customer_name ?? '—'}</div>
                {order.due_date && (
                  <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Due {formatDate(order.due_date)}
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {order.order_items?.length ?? 0} items
                  </span>
                  <span className="text-sm font-semibold">{formatCurrency(total)}</span>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function OrdersPageInner() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const { data: orders = [], isLoading } = useOrders();

  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [editOrder, setEditOrder] = useState<OrderWithItems | null>(null);

  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter !== 'all') list = list.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.order_number.toLowerCase().includes(q) ||
          o.customer_name?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [orders, statusFilter, search]);

  const deleteOrder = async (id: string) => {
    if (!confirm('Delete this order?')) return;
    await db.from('order_items').delete().eq('order_id', id);
    await db.from('orders').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['orders'] });
    toast.success('Order deleted');
  };

  return (
    <div className="animate-page-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">Orders</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Track and manage all print shop orders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('list')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={view === 'kanban' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('kanban')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Order
          </Button>
        </div>
      </div>

      {/* Filters (list view only) */}
      {view === 'list' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <Input className="pl-9" placeholder="Search order # or customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs px-2">All</TabsTrigger>
              {ORDER_STATUSES.map((s) => (
                <TabsTrigger key={s.value} value={s.value} className="text-xs px-2">
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Kanban view */}
      {view === 'kanban' && (
        <div className="overflow-x-auto">
          <div className="flex gap-4 min-w-max pb-4">
            {ORDER_STATUSES.map((s) => (
              <KanbanColumn
                key={s.value}
                status={s}
                orders={orders.filter((o) => o.status === s.value)}
                onCardClick={(o) => setSelectedOrder(o)}
              />
            ))}
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <Card>
          <div className="overflow-x-auto">
            {isLoading ? (
              <div>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 border-b last:border-b-0" style={{ borderColor: 'hsl(var(--border))' }}>
                    <div className="skeleton-shimmer h-4 w-28" />
                    <div className="skeleton-shimmer h-4 w-36 flex-1" />
                    <div className="skeleton-shimmer h-5 w-20 rounded-full" />
                    <div className="skeleton-shimmer h-4 w-16" />
                    <div className="skeleton-shimmer h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ShoppingCart className="mb-3 h-10 w-10" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <p className="font-medium">
                  {search || statusFilter !== 'all' ? 'No orders match your filters' : 'No orders yet'}
                </p>
                <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {search || statusFilter !== 'all' ? 'Try adjusting the search or status filter.' : 'Create your first order to start tracking production.'}
                </p>
                {!search && statusFilter === 'all' && (
                  <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" /> New Order
                  </Button>
                )}
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                    {['Order #', 'Customer', 'Status', 'Items', 'Total', 'Due Date', 'Actions'].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr
                      key={order.id}
                      className="transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid hsl(var(--border))' }}
                      onClick={() => setSelectedOrder(order)}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'hsl(var(--accent))')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-semibold" style={{ color: 'hsl(218, 91%, 57%)' }}>
                          {order.order_number}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium">{order.customer_name ?? '—'}</div>
                        {order.customer_company && (
                          <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{order.customer_company}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-6 py-4 text-sm">{order.order_items?.length ?? 0}</td>
                      <td className="px-6 py-4 text-sm font-semibold">{formatCurrency(orderTotal(order))}</td>
                      <td className="px-6 py-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {order.due_date ? formatDate(order.due_date) : '—'}
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => { setEditOrder(order); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700"
                            onClick={() => deleteOrder(order.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {/* Modals / panels */}
      <OrderCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      {editOrder && (
        <OrderCreateModal
          open
          onClose={() => setEditOrder(null)}
          editOrder={editOrder}
        />
      )}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onEdit={(o) => { setSelectedOrder(null); setEditOrder(o); }}
        />
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="animate-page-in p-6"><div className="skeleton-shimmer h-8 w-48 mb-4" /><div className="skeleton-shimmer h-64 w-full rounded-lg" /></div>}>
      <OrdersPageInner />
    </Suspense>
  );
}
