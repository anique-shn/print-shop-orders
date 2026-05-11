'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Plus, Search, List, LayoutGrid, X,
  Pencil, Trash2, ShoppingCart, FileText, Mail,
  Bell, Truck, Copy, ExternalLink, ChevronDown, ChevronUp,
  Shirt, Briefcase, ShoppingBag, RefreshCw, Hammer, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase, db } from '@/lib/supabase';
import {
  formatCurrency, formatDate, generateInvoiceNumber,
  ORDER_STATUSES, ORDER_EMAIL_TEMPLATES,
  calcSubtotal, calcDiscount, calcTax,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Order, OrderItem, OrderItemDecoration, OrderItemFinishing, CompanySettings } from '@/types/database';
import { OrderCreateModal } from './OrderCreateModal';
import { OrderPDFDocument } from '@/components/orders/OrderPDFDocument';

// ── Types ─────────────────────────────────────────────────────────────────────

type RichItem = OrderItem & {
  order_item_decorations?: OrderItemDecoration[];
  order_item_finishing?: OrderItemFinishing[];
};
type OrderWithItems = Order & { order_items?: RichItem[] };

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
        .select('*, order_items(*, order_item_decorations(*), order_item_finishing(*))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderWithItems[];
    },
  });
}

// ── Create Invoice from Order ─────────────────────────────────────────────────

function buildGarmentInvoiceDescription(item: RichItem): string {
  return item.description || 'Garment';
}

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
      // For garment lines: create one rolled-up invoice item
      // For setup fees and others: create as-is
      const invItems = order.order_items
        .filter((oi) => oi.unit_price > 0 || oi.line_type === 'garment')
        .map((oi) => ({
          invoice_id: inv.id,
          description: oi.line_type === 'garment'
            ? buildGarmentInvoiceDescription(oi)
            : oi.description,
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

type RichOrderItem = RichItem & {
  product_id?: string | null;
  service_item_id?: string | null;
  parent_order_item_id?: string | null;
};

// ── Garment Detail Card (internal view) ───────────────────────────────────────

function GarmentDetailCard({ item }: { item: RichOrderItem }) {
  const [expanded, setExpanded] = useState(true);
  const sizeMatrix = (item.size_matrix ?? {}) as Record<string, number>;
  const decos = item.order_item_decorations ?? [];
  const finishing = item.order_item_finishing ?? [];
  const decoTotal = decos.reduce((s, d) => s + d.unit_price, 0);
  const finishTotal = finishing.reduce((s, f) => s + f.unit_price, 0);
  const blankPrice = item.blank_cost != null && item.markup_pct != null
    ? item.blank_cost * (1 + item.markup_pct)
    : null;
  const sizeEntries = Object.entries(sizeMatrix).filter(([, qty]) => qty > 0);

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderLeft: '3px solid hsl(218 91% 57%)', borderColor: 'hsl(var(--border))', borderLeftColor: 'hsl(218 91% 57%)' }}
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{item.description}</p>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {item.qty} pcs
            {sizeEntries.length > 0 && ' · ' + sizeEntries.map(([s, q]) => `${s}(${q})`).join(' ')}
          </p>
        </div>
        <div className="text-right shrink-0 mr-2">
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {item.qty} × {formatCurrency(item.unit_price)}
          </p>
          <p className="text-sm font-bold">{formatCurrency(item.qty * item.unit_price)}</p>
          {item.price_overridden && (
            <p className="text-xs text-amber-600 font-medium">Override</p>
          )}
        </div>
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
          : <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />}
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: 'hsl(var(--border))' }}>
          {/* Size breakdown */}
          {sizeEntries.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Size Breakdown
              </p>
              <div className="flex gap-2 flex-wrap">
                {sizeEntries.map(([size, qty]) => (
                  <div
                    key={size}
                    className="flex flex-col items-center px-2.5 py-1 rounded-md text-xs"
                    style={{ backgroundColor: 'hsl(218 91% 57% / 0.08)', color: 'hsl(218 91% 57%)' }}
                  >
                    <span className="font-bold">{qty}</span>
                    <span>{size}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decorations */}
          {decos.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Decorations
              </p>
              <div className="space-y-1">
                {decos.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {d.location} · {d.decoration_type === 'screen_print'
                        ? `${d.colors}-color screen print`
                        : `Embroidery (${(d.stitch_count ?? 0).toLocaleString()} sts)`}
                    </span>
                    <span style={{ color: 'hsl(218 91% 57%)' }}>{formatCurrency(d.unit_price)}/pc</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Finishing */}
          {finishing.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Finishing
              </p>
              <div className="space-y-1">
                {finishing.map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-xs">
                    <span className="font-medium">{f.service_name}</span>
                    <span style={{ color: 'hsl(218 91% 57%)' }}>{formatCurrency(f.unit_price)}/pc</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Internal price breakdown */}
          {(blankPrice != null || decoTotal > 0 || finishTotal > 0) && (
            <div className="rounded-md p-2 text-xs space-y-0.5" style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
              <p className="font-semibold uppercase tracking-wider mb-1">Price Breakdown</p>
              {blankPrice != null && (
                <div className="flex justify-between">
                  <span>Blank ({Math.round((item.markup_pct ?? 0) * 100)}% markup)</span>
                  <span>{formatCurrency(blankPrice)}/pc</span>
                </div>
              )}
              {decoTotal > 0 && (
                <div className="flex justify-between">
                  <span>Decoration</span>
                  <span>{formatCurrency(decoTotal)}/pc</span>
                </div>
              )}
              {finishTotal > 0 && (
                <div className="flex justify-between">
                  <span>Finishing</span>
                  <span>{formatCurrency(finishTotal)}/pc</span>
                </div>
              )}
              {item.price_overridden && item.override_reason && (
                <p className="text-amber-600 pt-1">Override: {item.override_reason}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

  // New production template line types
  const garmentItems = items.filter((i) => i.line_type === 'garment');
  const setupFeeItems = items.filter((i) => i.line_type === 'setup_fee');

  // Legacy line types (backward compat)
  const productItems = items.filter((i) => i.line_type === 'product');
  const standaloneServices = items.filter(
    (i) => (i.line_type === 'service' || !i.line_type) && !i.parent_order_item_id
  );
  const feeItems = items.filter((i) => i.line_type === 'fee');

  // If order has new garment lines, use new rendering
  if (garmentItems.length > 0 || setupFeeItems.length > 0) {
    return (
      <div className="space-y-2">
        {garmentItems.map((item) => (
          <GarmentDetailCard key={item.id} item={item} />
        ))}
        {setupFeeItems.length > 0 && (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(38 92% 50% / 0.3)', backgroundColor: 'hsl(38 92% 50% / 0.03)' }}>
            {setupFeeItems.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center justify-between px-4 py-2.5 text-sm ${idx < setupFeeItems.length - 1 ? 'border-b' : ''}`}
                style={{ borderColor: 'hsl(38 92% 50% / 0.3)' }}
              >
                <span className="font-medium">{item.description}</span>
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {item.qty} × {formatCurrency(item.unit_price)}
                  </p>
                  <p className="font-semibold">{formatCurrency(item.qty * item.unit_price)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

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
  const [pdfOpen, setPdfOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();

  const { data: company } = useQuery<CompanySettings | null>({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('*').limit(1).single();
      return (data ?? null) as CompanySettings | null;
    },
  });

  const handleDownloadPDF = async () => {
    setDownloading(true);
    // Small delay to ensure PDF DOM is rendered
    await new Promise((r) => setTimeout(r, 120));
    const el = document.getElementById('order-pdf-document');
    if (!el) { setDownloading(false); return; }
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      // If content is taller than one page, add extra pages
      const pageH = pdf.internal.pageSize.getHeight();
      if (pdfH <= pageH) {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
      } else {
        let y = 0;
        while (y < pdfH) {
          if (y > 0) pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, -y, pdfW, pdfH);
          y += pageH;
        }
      }
      pdf.save(`WorkOrder-${order.order_number}.pdf`);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setDownloading(false);
    }
  };

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
                  onClick={() => setPdfOpen((v) => !v)}
                >
                  <Download className="h-3.5 w-3.5" /> PDF
                </button>
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

      {/* PDF Preview Modal */}
      {pdfOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setPdfOpen(false)}>
          <div
            className="flex flex-col rounded-xl shadow-2xl overflow-hidden"
            style={{ maxHeight: '90vh', maxWidth: '860px', width: '100%', backgroundColor: 'white' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal toolbar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <p className="font-semibold text-sm">Work Order PDF — {order.order_number}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleDownloadPDF} disabled={downloading} style={{ backgroundColor: '#05253D' }}>
                  <Download className="h-3.5 w-3.5" />
                  {downloading ? 'Generating…' : 'Download PDF'}
                </Button>
                <button
                  type="button"
                  className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent"
                  onClick={() => setPdfOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Scrollable preview */}
            <div className="flex-1 overflow-auto p-4" style={{ backgroundColor: '#94a3b8' }}>
              <div className="mx-auto shadow-xl" style={{ width: 794 }}>
                <OrderPDFDocument order={order} company={company ?? {}} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
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

// ── Template Selector ─────────────────────────────────────────────────────────

const JOB_TEMPLATES = [
  {
    id: 'production_multi_sku',
    label: 'Production Job',
    subtitle: 'Multi-SKU',
    description: 'Apparel, screen printing, embroidery, decorated goods. Size matrix + decoration + finishing.',
    icon: Shirt,
    color: 'hsl(218 91% 57%)',
    available: true,
  },
  {
    id: 'service',
    label: 'Service Job',
    subtitle: 'Coming Soon',
    description: 'Consulting, design, agency services. Flat-fee or hourly line items.',
    icon: Briefcase,
    color: 'hsl(var(--muted-foreground))',
    available: false,
  },
  {
    id: 'retail',
    label: 'Retail Sale',
    subtitle: 'Coming Soon',
    description: 'Inventory-based product sales. Pulls from stock, tracks units.',
    icon: ShoppingBag,
    color: 'hsl(var(--muted-foreground))',
    available: false,
  },
  {
    id: 'subscription',
    label: 'Subscription',
    subtitle: 'Coming Soon',
    description: 'Recurring retainers, memberships, SaaS-style billing.',
    icon: RefreshCw,
    color: 'hsl(var(--muted-foreground))',
    available: false,
  },
  {
    id: 'project',
    label: 'Project',
    subtitle: 'Coming Soon',
    description: 'Construction, long-cycle custom builds, milestone billing.',
    icon: Hammer,
    color: 'hsl(var(--muted-foreground))',
    available: false,
  },
] as const;

function TemplateSelectorModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (templateId: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          width: 'min(100vw - 2rem, 640px)',
          backgroundColor: 'hsl(var(--background))',
        }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
          <div>
            <h2 className="font-bold text-lg font-heading">New Order</h2>
            <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Select a template to define the order structure and pricing model.
            </p>
          </div>
          <button type="button" className="p-1.5 rounded-lg hover:bg-accent" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Template cards */}
        <div className="p-4 space-y-2 overflow-y-auto">
          {JOB_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="w-full text-left rounded-xl border p-4 transition-all"
              style={{
                borderColor: tpl.available ? 'hsl(var(--border))' : 'hsl(var(--border))',
                opacity: tpl.available ? 1 : 0.5,
                cursor: tpl.available ? 'pointer' : 'not-allowed',
                backgroundColor: tpl.available ? 'transparent' : 'hsl(var(--muted)/0.3)',
              }}
              onMouseEnter={(e) => { if (tpl.available) (e.currentTarget as HTMLButtonElement).style.borderColor = tpl.color; }}
              onMouseLeave={(e) => { if (tpl.available) (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(var(--border))'; }}
              onClick={() => tpl.available && onSelect(tpl.id)}
              disabled={!tpl.available}
            >
              <div className="flex items-center gap-4">
                <div
                  className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: tpl.available ? `${tpl.color}1A` : 'hsl(var(--muted))' }}
                >
                  <tpl.icon className="h-5 w-5" style={{ color: tpl.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{tpl.label}</p>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: tpl.available ? 'hsl(218 91% 57% / 0.1)' : 'hsl(var(--muted))',
                        color: tpl.available ? 'hsl(218 91% 57%)' : 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {tpl.available ? 'Active' : tpl.subtitle}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {tpl.description}
                  </p>
                </div>
                {tpl.available && (
                  <div
                    className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'hsl(218 91% 57%)', color: 'white' }}
                  >
                    <Plus className="h-4 w-4" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OrdersPageInner() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const { data: orders = [], isLoading } = useOrders();

  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [templateOpen, setTemplateOpen] = useState(searchParams.get('new') === '1');
  const [createOpen, setCreateOpen] = useState(false);
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
            Track and manage all production orders.
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
          <Button onClick={() => setTemplateOpen(true)}>
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
                  <Button className="mt-4" size="sm" onClick={() => setTemplateOpen(true)}>
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

      {/* Template selector → then create modal */}
      <TemplateSelectorModal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSelect={() => { setTemplateOpen(false); setCreateOpen(true); }}
      />
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
