'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Search, Pencil, Trash2, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import {
  formatCurrency, formatDate, generateInvoiceNumber,
  INVOICE_STATUSES, PAYMENT_TERMS, calcSubtotal, calcDiscount, calcTax,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Invoice, InvoiceItem, Customer, Order, OrderItem } from '@/types/database';

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceWithItems = Invoice & { invoice_items?: InvoiceItem[] };
type OrderWithItems = Order & { order_items?: OrderItem[] };

interface InvLineRow {
  description: string;
  qty: number;
  rate: number;
  taxable: boolean;
}

const emptyInvLine = (): InvLineRow => ({ description: '', qty: 1, rate: 0, taxable: false });

// ── Helpers ───────────────────────────────────────────────────────────────────

function InvStatusBadge({ status }: { status: string }) {
  const def = INVOICE_STATUSES.find((s) => s.value === status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${def?.color ?? ''}`}>
      {def?.label ?? status}
    </span>
  );
}

function invoiceTotal(inv: InvoiceWithItems): number {
  const items = inv.invoice_items ?? [];
  const sub = calcSubtotal(items.map((i) => ({ qty: i.qty, unit_price: i.rate })));
  const disc = calcDiscount(sub, inv.discount_type, inv.discount_value);
  const tax = calcTax(sub - disc, inv.tax_rate);
  return sub - disc + tax;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useInvoices() {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvoiceWithItems[];
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

function useOrders() {
  return useQuery({
    queryKey: ['orders-for-invoice'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
      return (data ?? []) as OrderWithItems[];
    },
  });
}

// ── Create Invoice Modal ──────────────────────────────────────────────────────

function InvoiceModal({
  open,
  onClose,
  editInvoice,
}: {
  open: boolean;
  onClose: () => void;
  editInvoice?: InvoiceWithItems | null;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: customers = [] } = useCustomers();
  const { data: orders = [] } = useOrders();

  const [saving, setSaving] = useState(false);
  const [customerMode, setCustomerMode] = useState<'select' | 'inline'>('select');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custCompany, setCustCompany] = useState('');
  const [custAddress, setCustAddress] = useState('');

  const [importOrderId, setImportOrderId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('net30');
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<InvLineRow[]>([emptyInvLine()]);

  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().split('T')[0];
    if (editInvoice) {
      setCustomerMode(editInvoice.customer_id ? 'select' : 'inline');
      setSelectedCustomerId(editInvoice.customer_id ?? '');
      setCustName(editInvoice.customer_name ?? '');
      setCustEmail(editInvoice.customer_email ?? '');
      setCustCompany(editInvoice.customer_company ?? '');
      setCustAddress(editInvoice.customer_address ?? '');
      setIssueDate(editInvoice.issue_date ?? today);
      setDueDate(editInvoice.due_date ?? '');
      setPaymentTerms(editInvoice.payment_terms ?? 'net30');
      setDiscountType(editInvoice.discount_type ?? 'percent');
      setDiscountValue(String(editInvoice.discount_value ?? ''));
      setTaxRate(String(editInvoice.tax_rate ?? ''));
      setNotes(editInvoice.notes ?? '');
      setTerms(editInvoice.terms ?? '');
      setLines(
        editInvoice.invoice_items?.length
          ? editInvoice.invoice_items.map((i) => ({ description: i.description, qty: i.qty, rate: i.rate, taxable: i.taxable }))
          : [emptyInvLine()]
      );
    } else {
      setCustomerMode('select');
      setSelectedCustomerId(''); setCustName(''); setCustEmail('');
      setCustCompany(''); setCustAddress('');
      setImportOrderId('');
      setIssueDate(today); setDueDate(''); setPaymentTerms('net30');
      setDiscountType('percent'); setDiscountValue(''); setTaxRate('');
      setNotes(''); setTerms('');
      setLines([emptyInvLine()]);
    }
  }, [open, editInvoice]);

  const handleImportOrder = (orderId: string) => {
    setImportOrderId(orderId);
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    // Prefill customer
    if (order.customer_id) {
      setCustomerMode('select');
      setSelectedCustomerId(order.customer_id);
    } else {
      setCustomerMode('inline');
      setCustName(order.customer_name ?? '');
      setCustEmail(order.customer_email ?? '');
      setCustCompany(order.customer_company ?? '');
    }
    // Prefill discount/tax
    setDiscountType(order.discount_type);
    setDiscountValue(String(order.discount_value));
    setTaxRate(String(order.tax_rate));
    // Prefill lines
    if (order.order_items?.length) {
      setLines(order.order_items.map((oi) => ({
        description: oi.description,
        qty: oi.qty,
        rate: oi.unit_price,
        taxable: oi.taxable,
      })));
    }
  };

  const updateLine = (i: number, key: keyof InvLineRow, val: string | number | boolean) => {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l));
  };

  const sub = calcSubtotal(lines.map((l) => ({ qty: l.qty, unit_price: l.rate })));
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
        customer_company: c?.company ?? null,
        customer_address: [c?.address, c?.city, c?.state, c?.zip].filter(Boolean).join(', ') || null,
      };
    }
    return {
      customer_id: null,
      customer_name: custName || null,
      customer_email: custEmail || null,
      customer_company: custCompany || null,
      customer_address: custAddress || null,
    };
  };

  const save = async () => {
    if (!lines.some((l) => l.description.trim())) {
      toast.error('Add at least one line item'); return;
    }
    setSaving(true);
    try {
      const cust = resolveCustomer();
      const invNum = editInvoice?.invoice_number ?? generateInvoiceNumber();
      const invData = {
        invoice_number: invNum,
        order_id: importOrderId || editInvoice?.order_id || null,
        ...cust,
        status: editInvoice?.status ?? 'draft' as const,
        issue_date: issueDate,
        due_date: dueDate || null,
        payment_terms: paymentTerms as Invoice['payment_terms'],
        discount_type: discountType,
        discount_value: parseFloat(discountValue) || 0,
        tax_rate: parseFloat(taxRate) || 0,
        notes: notes || null,
        terms: terms || null,
        sent_at: editInvoice?.sent_at ?? null,
        paid_at: editInvoice?.paid_at ?? null,
      };

      let invId = editInvoice?.id;
      if (editInvoice) {
        const { error } = await db.from('invoices').update(invData).eq('id', editInvoice.id);
        if (error) throw error;
        await db.from('invoice_items').delete().eq('invoice_id', editInvoice.id);
      } else {
        const { data, error } = await db.from('invoices').insert(invData).select('id').single();
        if (error) throw error;
        invId = data.id;
      }

      const itemRows = lines.filter((l) => l.description.trim()).map((l) => ({
        invoice_id: invId!,
        description: l.description,
        qty: l.qty,
        rate: l.rate,
        taxable: l.taxable,
      }));
      if (itemRows.length) {
        const { error } = await db.from('invoice_items').insert(itemRows);
        if (error) throw error;
      }

      toast.success(editInvoice ? 'Invoice updated' : `Invoice ${invNum} created`);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
      if (!editInvoice && invId) router.push(`/invoices/${invId}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editInvoice ? `Edit ${editInvoice.invoice_number}` : 'New Invoice'}</DialogTitle>
          <DialogDescription>
            {editInvoice ? 'Update invoice details.' : 'Create a new invoice for a customer.'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2 space-y-5">
          {/* Import from order */}
          {!editInvoice && (
            <div className="rounded-lg border p-4" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted))' }}>
              <Label className="mb-2 block">Import from Order (optional)</Label>
              <Select value={importOrderId} onValueChange={handleImportOrder}>
                <SelectTrigger><SelectValue placeholder="Select an order to import line items…" /></SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_number} — {o.customer_name ?? 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Customer */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Customer</h3>
            <div className="flex gap-2 mb-3">
              {(['select', 'inline'] as const).map((mode) => (
                <button
                  key={mode}
                  className="text-sm px-3 py-1.5 rounded-md border font-medium transition-colors"
                  style={{
                    backgroundColor: customerMode === mode ? 'hsl(218, 91%, 57%)' : 'white',
                    color: customerMode === mode ? 'white' : 'hsl(var(--foreground))',
                    borderColor: 'hsl(var(--border))',
                  }}
                  onClick={() => setCustomerMode(mode)}
                >
                  {mode === 'select' ? 'Existing Customer' : 'Enter Manually'}
                </button>
              ))}
            </div>
            {customerMode === 'select' ? (
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer…" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.company ? ` — ${c.company}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
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
                  <Label>Address</Label>
                  <Input value={custAddress} onChange={(e) => setCustAddress(e.target.value)} placeholder="123 Main St, City, ST 00000" />
                </div>
              </div>
            )}
          </div>

          {/* Invoice details */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Issue Date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Line Items</h3>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: 'hsl(var(--muted))' }}>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Description</th>
                    <th className="px-3 py-2 text-left text-xs font-medium w-20" style={{ color: 'hsl(var(--muted-foreground))' }}>Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-medium w-28" style={{ color: 'hsl(var(--muted-foreground))' }}>Rate</th>
                    <th className="px-3 py-2 text-left text-xs font-medium w-28" style={{ color: 'hsl(var(--muted-foreground))' }}>Amount</th>
                    <th className="px-3 py-2 text-left text-xs font-medium w-12" style={{ color: 'hsl(var(--muted-foreground))' }}>Tax</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <Input className="h-8" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} placeholder="Service or product description" />
                      </td>
                      <td className="px-3 py-2">
                        <Input className="h-8" type="number" min={1} value={line.qty} onChange={(e) => updateLine(i, 'qty', parseInt(e.target.value) || 1)} />
                      </td>
                      <td className="px-3 py-2">
                        <Input className="h-8" type="number" min={0} step={0.01} value={line.rate} onChange={(e) => updateLine(i, 'rate', parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-3 py-2 text-sm font-medium">{formatCurrency(line.qty * line.rate)}</td>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={line.taxable} onChange={(e) => updateLine(i, 'taxable', e.target.checked)} className="rounded" />
                      </td>
                      <td className="px-3 py-2">
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
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, emptyInvLine()])}>
              <Plus className="h-3.5 w-3.5" /> Add Line
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

          {/* Notes & Terms */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thank you for your business…" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Terms</Label>
              <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment is due within 30 days…" rows={3} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editInvoice ? 'Save Changes' : 'Create Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: invoices = [], isLoading } = useInvoices();

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');
  const [editInvoice, setEditInvoice] = useState<InvoiceWithItems | null>(null);

  const filtered = useMemo(() => {
    let list = invoices;
    if (statusFilter !== 'all') list = list.filter((i) => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.invoice_number.toLowerCase().includes(q) ||
          i.customer_name?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [invoices, statusFilter, search]);

  const updateStatus = async (id: string, status: Invoice['status']) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };
    if (status === 'paid') updates.paid_at = now;
    if (status === 'sent') updates.sent_at = now;
    await db.from('invoices').update(updates).eq('id', id);
    qc.invalidateQueries({ queryKey: ['invoices'] });
    toast.success(`Invoice marked as ${status}`);
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm('Delete this invoice?')) return;
    await db.from('invoice_items').delete().eq('invoice_id', id);
    await db.from('invoices').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['invoices'] });
    toast.success('Invoice deleted');
  };

  return (
    <div className="animate-page-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">Invoices</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Create, send, and track your invoices.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Invoice
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <Input className="pl-9" placeholder="Search invoice # or customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-2">All</TabsTrigger>
            {INVOICE_STATUSES.map((s) => (
              <TabsTrigger key={s.value} value={s.value} className="text-xs px-2">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="skeleton-shimmer h-4 w-28" />
                  <div className="skeleton-shimmer h-4 w-36 flex-1" />
                  <div className="skeleton-shimmer h-5 w-16 rounded-full" />
                  <div className="skeleton-shimmer h-4 w-20" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="mb-3 h-10 w-10" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="font-medium">
                {search || statusFilter !== 'all' ? 'No invoices match your filters' : 'No invoices yet'}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first invoice or generate one from an order.'}
              </p>
              {!search && statusFilter === 'all' && (
                <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> New Invoice
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  {['Invoice #', 'Customer', 'Order #', 'Status', 'Amount', 'Due Date', 'Actions'].map((h) => (
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
                {filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    className="transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid hsl(var(--border))' }}
                    onClick={() => router.push(`/invoices/${inv.id}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'hsl(var(--accent))')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-semibold" style={{ color: 'hsl(218, 91%, 57%)' }}>
                        {inv.invoice_number}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium">{inv.customer_name ?? '—'}</div>
                      {inv.customer_company && (
                        <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{inv.customer_company}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {inv.order_id ? '—' : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <InvStatusBadge status={inv.status} />
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold">{formatCurrency(invoiceTotal(inv))}</td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {inv.due_date ? formatDate(inv.due_date) : '—'}
                    </td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          title="Open invoice"
                          onClick={() => router.push(`/invoices/${inv.id}`)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => setEditInvoice(inv)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {inv.status === 'draft' && (
                          <Button
                            variant="ghost" size="sm" className="h-8 px-2 text-xs"
                            style={{ color: 'hsl(218, 91%, 57%)' }}
                            onClick={() => updateStatus(inv.id, 'sent')}
                          >
                            Mark Sent
                          </Button>
                        )}
                        {(inv.status === 'sent' || inv.status === 'overdue') && (
                          <Button
                            variant="ghost" size="sm" className="h-8 px-2 text-xs"
                            style={{ color: 'hsl(152, 74%, 28%)' }}
                            onClick={() => updateStatus(inv.id, 'paid')}
                          >
                            Mark Paid
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => deleteInvoice(inv.id)}
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

      <InvoiceModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editInvoice && (
        <InvoiceModal open onClose={() => setEditInvoice(null)} editInvoice={editInvoice} />
      )}
    </div>
  );
}
