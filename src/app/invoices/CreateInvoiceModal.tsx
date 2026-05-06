'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  X, Plus, Trash2, Search, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase, db } from '@/lib/supabase';
import {
  formatCurrency, generateInvoiceNumber, PAYMENT_TERMS,
  calcSubtotal, calcDiscount, calcTax,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { InvoicePreview } from '@/components/invoices/InvoicePreview';
import type {
  Customer, Order, OrderItem, Invoice, InvoiceItem,
  CompanySettings, ServiceGroupWithItems,
} from '@/types/database';

type InvoiceWithItems = Invoice & { invoice_items?: InvoiceItem[] };
type OrderWithItems = Order & { order_items?: OrderItem[] };

interface InvLineRow {
  description: string;
  qty: number;
  rate: number;
  taxable: boolean;
}

const emptyLine = (): InvLineRow => ({ description: '', qty: 1, rate: 0, taxable: false });

// ── Data hooks ────────────────────────────────────────────────────────────────

function useCustomers() {
  return useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').order('name');
      return (data ?? []) as Customer[];
    },
  });
}

function useOrders() {
  return useQuery<OrderWithItems[]>({
    queryKey: ['orders-for-invoice'],
    queryFn: async () => {
      const { data } = await supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
      return (data ?? []) as OrderWithItems[];
    },
  });
}

function useCompanySettings() {
  return useQuery<CompanySettings | null>({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();
      return data as CompanySettings | null;
    },
  });
}

function useServiceGroups() {
  return useQuery<ServiceGroupWithItems[]>({
    queryKey: ['service-groups'],
    queryFn: async () => {
      const { data } = await supabase
        .from('service_groups')
        .select('*, items:service_items(*, tiers:service_item_tiers(*))')
        .order('sort_order');
      return (data ?? []) as ServiceGroupWithItems[];
    },
  });
}

// ── PDF helper ────────────────────────────────────────────────────────────────

async function downloadPDF(invoiceNumber: string) {
  const el = document.getElementById('invoice-live-preview');
  if (!el) return;
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: 794,
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = (canvas.height * pdfW) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    pdf.save(`Invoice-${invoiceNumber}.pdf`);
    toast.success('PDF downloaded');
  } catch {
    toast.error('Failed to generate PDF');
  }
}

// ── Browse Services Popover ───────────────────────────────────────────────────

interface BrowseServicesProps {
  groups: ServiceGroupWithItems[];
  onAdd: (line: InvLineRow) => void;
  onClose: () => void;
}

function BrowseServicesPanel({ groups, onAdd, onClose }: BrowseServicesProps) {
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id ?? '');
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  return (
    <div
      className="absolute right-0 top-8 z-20 bg-white border rounded-xl shadow-lg overflow-hidden"
      style={{ width: 340, borderColor: 'hsl(var(--border))' }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
        <span className="text-xs font-semibold">Browse Services</span>
        <button type="button" onClick={onClose} className="p-0.5 rounded hover:bg-accent">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Group pills */}
      <div className="flex gap-1.5 px-3 py-2 overflow-x-auto border-b" style={{ borderColor: 'hsl(var(--border))' }}>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className="text-xs px-2.5 py-1 rounded-full border whitespace-nowrap font-medium transition-colors shrink-0"
            style={{
              backgroundColor: activeGroupId === g.id ? g.color : 'transparent',
              borderColor: activeGroupId === g.id ? g.color : 'hsl(var(--border))',
              color: activeGroupId === g.id ? 'white' : 'hsl(var(--foreground))',
            }}
            onClick={() => setActiveGroupId(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>
      {/* Items */}
      <div className="max-h-52 overflow-y-auto">
        {(activeGroup?.items ?? []).map((item) => {
          const price = item.pricing_type === 'flat'
            ? (item.flat_price ?? 0)
            : item.tiers.length
              ? Math.min(...item.tiers.map((t) => t.price_per_unit))
              : 0;
          return (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-accent text-sm border-b last:border-b-0 transition-colors"
              style={{ borderColor: 'hsl(var(--border))' }}
              onClick={() => {
                onAdd({ description: item.name, qty: 1, rate: price, taxable: false });
                onClose();
              }}
            >
              <span className="font-medium">{item.name}</span>
              <span className="text-xs ml-2 shrink-0" style={{ color: 'hsl(218 91% 57%)' }}>
                {item.pricing_type === 'flat' ? formatCurrency(price) : `from ${formatCurrency(price)}`}
              </span>
            </button>
          );
        })}
        {(activeGroup?.items ?? []).length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: 'hsl(var(--muted-foreground))' }}>No items in this group</p>
        )}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CreateInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  editInvoice?: InvoiceWithItems | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateInvoiceModal({ open, onClose, editInvoice }: CreateInvoiceModalProps) {
  const qc = useQueryClient();
  const router = useRouter();

  const { data: customers = [] } = useCustomers();
  const { data: orders = [] } = useOrders();
  const { data: company } = useCompanySettings();
  const { data: serviceGroups = [] } = useServiceGroups();

  const [layout, setLayout] = useState<'classic' | 'modern' | 'minimal' | 'compact'>('classic');
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [browseServicesOpen, setBrowseServicesOpen] = useState(false);

  // Customer
  const [customerMode, setCustomerMode] = useState<'select' | 'inline'>('select');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custCompany, setCustCompany] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custSearch, setCustSearch] = useState('');

  // Invoice fields
  const [invoiceNumber] = useState(() => editInvoice?.invoice_number ?? generateInvoiceNumber());
  const [importOrderId, setImportOrderId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('net30');
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [lines, setLines] = useState<InvLineRow[]>([emptyLine()]);

  // Populate from editInvoice or defaults
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
          : [emptyLine()]
      );
    } else {
      setCustomerMode('select');
      setSelectedCustomerId(''); setCustName(''); setCustEmail('');
      setCustCompany(''); setCustAddress('');
      setImportOrderId('');
      setIssueDate(today); setDueDate('');
      setPaymentTerms(company?.default_payment_terms ?? 'net30');
      setDiscountType('percent'); setDiscountValue('');
      setTaxRate(String(company?.default_tax_rate ?? ''));
      setNotes(company?.invoice_notes ?? '');
      setTerms(company?.invoice_terms ?? '');
      setLines([emptyLine()]);
    }
  }, [open, editInvoice, company]);

  const handleImportOrder = (orderId: string) => {
    setImportOrderId(orderId);
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    if (order.customer_id) {
      setCustomerMode('select');
      setSelectedCustomerId(order.customer_id);
    } else {
      setCustomerMode('inline');
      setCustName(order.customer_name ?? '');
      setCustEmail(order.customer_email ?? '');
      setCustCompany(order.customer_company ?? '');
    }
    setDiscountType(order.discount_type);
    setDiscountValue(String(order.discount_value));
    setTaxRate(String(order.tax_rate));
    if (order.order_items?.length) {
      setLines(order.order_items.map((oi) => ({
        description: oi.description,
        qty: oi.qty,
        rate: oi.unit_price,
        taxable: oi.taxable,
      })));
    }
    toast.success(`Imported ${order.order_items?.length ?? 0} items from ${order.order_number}`);
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

  const filteredCustomers = custSearch.trim()
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
        c.company?.toLowerCase().includes(custSearch.toLowerCase())
      )
    : customers;

  const save = async (status?: Invoice['status']) => {
    if (!lines.some((l) => l.description.trim())) {
      toast.error('Add at least one line item'); return;
    }
    setSaving(true);
    try {
      const cust = resolveCustomer();
      const invNum = editInvoice?.invoice_number ?? invoiceNumber;
      const invData = {
        invoice_number: invNum,
        order_id: importOrderId || editInvoice?.order_id || null,
        ...cust,
        status: status ?? editInvoice?.status ?? 'draft' as const,
        issue_date: issueDate,
        due_date: dueDate || null,
        payment_terms: paymentTerms as Invoice['payment_terms'],
        discount_type: discountType,
        discount_value: parseFloat(discountValue) || 0,
        tax_rate: parseFloat(taxRate) || 0,
        notes: notes || null,
        terms: terms || null,
        sent_at: status === 'sent' ? new Date().toISOString() : (editInvoice?.sent_at ?? null),
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

  const handleDownload = async () => {
    setDownloading(true);
    await downloadPDF(invoiceNumber);
    setDownloading(false);
  };

  // Live preview data derived from state
  const previewInvoice = {
    invoice_number: invoiceNumber,
    issue_date: issueDate || new Date().toISOString().split('T')[0],
    due_date: dueDate || null,
    payment_terms: paymentTerms,
    status: editInvoice?.status ?? 'draft',
    customer_name: (() => {
      if (customerMode === 'select' && selectedCustomerId) {
        return customers.find((c) => c.id === selectedCustomerId)?.name ?? null;
      }
      return custName || null;
    })(),
    customer_email: (() => {
      if (customerMode === 'select' && selectedCustomerId) {
        return customers.find((c) => c.id === selectedCustomerId)?.email ?? null;
      }
      return custEmail || null;
    })(),
    customer_company: (() => {
      if (customerMode === 'select' && selectedCustomerId) {
        return customers.find((c) => c.id === selectedCustomerId)?.company ?? null;
      }
      return custCompany || null;
    })(),
    customer_address: (() => {
      if (customerMode === 'select' && selectedCustomerId) {
        const c = customers.find((x) => x.id === selectedCustomerId);
        return [c?.address, c?.city, c?.state, c?.zip].filter(Boolean).join(', ') || null;
      }
      return custAddress || null;
    })(),
    notes: notes || null,
    terms: terms || null,
    discount_type: discountType,
    discount_value: parseFloat(discountValue) || 0,
    tax_rate: parseFloat(taxRate) || 0,
  };

  const previewItems = lines.filter((l) => l.description.trim());

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-6 shrink-0 border-b bg-white"
        style={{ height: 56, borderColor: 'hsl(var(--border))' }}
      >
        {/* Left: title */}
        <h1 className="font-bold text-lg font-heading">
          {editInvoice ? `Edit ${editInvoice.invoice_number}` : 'New Invoice'}
        </h1>

        {/* Center: layout selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Layout:</span>
          <Select value={layout} onValueChange={(v) => setLayout(v as typeof layout)}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="classic">Classic</SelectItem>
              <SelectItem value="modern">Modern</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="compact">Compact</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? 'Generating…' : 'Download PDF'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => save('draft')}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save as Draft'}
          </Button>
          <Button
            size="sm"
            onClick={() => save('sent')}
            disabled={saving}
            style={{ backgroundColor: 'hsl(218 91% 57%)' }}
          >
            Create &amp; Send
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 p-1.5 rounded-md hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT PANEL (480px) ── */}
        <div
          className="shrink-0 border-r overflow-y-auto bg-white px-6 py-5 space-y-6"
          style={{ width: 480, borderColor: 'hsl(var(--border))' }}
        >
          {/* Customer section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Customer</h3>
            <div className="flex gap-1.5">
              {(['select', 'inline'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-md border font-medium transition-colors"
                  style={{
                    backgroundColor: customerMode === mode ? 'hsl(218 91% 57%)' : 'white',
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
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <Input className="pl-8 h-8 text-sm" placeholder="Search customers…" value={custSearch} onChange={(e) => setCustSearch(e.target.value)} />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-md border" style={{ borderColor: 'hsl(var(--border))' }}>
                  {filteredCustomers.length === 0 ? (
                    <p className="text-xs text-center py-4" style={{ color: 'hsl(var(--muted-foreground))' }}>No customers found</p>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2 border-b last:border-b-0"
                        style={{
                          borderColor: 'hsl(var(--border))',
                          backgroundColor: selectedCustomerId === c.id ? 'hsl(218 91% 57% / 0.08)' : undefined,
                        }}
                        onClick={() => setSelectedCustomerId(c.id)}
                      >
                        <div
                          className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: 'hsl(218 91% 57%)' }}
                        >
                          {c.name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          {c.company && <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{c.company}</p>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input className="h-8 text-sm" value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Company</Label>
                  <Input className="h-8 text-sm" value={custCompany} onChange={(e) => setCustCompany(e.target.value)} placeholder="Company" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input className="h-8 text-sm" type="email" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} placeholder="email@example.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address</Label>
                  <Input className="h-8 text-sm" value={custAddress} onChange={(e) => setCustAddress(e.target.value)} placeholder="123 Main St, City, ST" />
                </div>
              </div>
            )}
          </div>

          {/* Invoice details */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Invoice Details</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">Invoice #</Label>
                <Input className="h-8 text-sm font-mono" value={invoiceNumber} readOnly style={{ backgroundColor: 'hsl(var(--muted))' }} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment Terms</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Issue Date</Label>
                <Input className="h-8 text-sm" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input className="h-8 text-sm" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Import from order */}
          {!editInvoice && (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Import from Order</Label>
              <Select value={importOrderId} onValueChange={handleImportOrder}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select an order to import line items…" />
                </SelectTrigger>
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

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Line Items</h3>
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setBrowseServicesOpen((v) => !v)}
                >
                  Browse Services
                </Button>
                {browseServicesOpen && serviceGroups.length > 0 && (
                  <BrowseServicesPanel
                    groups={serviceGroups}
                    onAdd={(line) => setLines((prev) => [...prev, line])}
                    onClose={() => setBrowseServicesOpen(false)}
                  />
                )}
              </div>
            </div>

            {/* Table */}
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: 'hsl(var(--muted))' }}>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Description</th>
                    <th className="px-3 py-2 text-left text-xs font-medium w-14" style={{ color: 'hsl(var(--muted-foreground))' }}>Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-medium w-24" style={{ color: 'hsl(var(--muted-foreground))' }}>Rate</th>
                    <th className="px-3 py-2 text-left text-xs font-medium w-8" style={{ color: 'hsl(var(--muted-foreground))' }}>Tax</th>
                    <th className="px-3 py-2 text-right text-xs font-medium w-20" style={{ color: 'hsl(var(--muted-foreground))' }}>Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs"
                          value={line.description}
                          onChange={(e) => updateLine(i, 'description', e.target.value)}
                          placeholder="Description"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs w-12"
                          type="number" min={1}
                          value={line.qty}
                          onChange={(e) => updateLine(i, 'qty', parseInt(e.target.value) || 1)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-7 text-xs"
                          type="number" min={0} step={0.01}
                          value={line.rate}
                          onChange={(e) => updateLine(i, 'rate', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={line.taxable}
                          onChange={(e) => updateLine(i, 'taxable', e.target.checked)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-medium">
                        {formatCurrency(line.qty * line.rate)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600"
                          onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
                          disabled={lines.length === 1}
                          type="button"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              variant="outline" size="sm"
              onClick={() => setLines([...lines, emptyLine()])}
            >
              <Plus className="h-3.5 w-3.5" /> Add Line Item
            </Button>

            {/* Live totals */}
            <div className="flex justify-end pt-1">
              <div className="w-56 space-y-1.5 text-sm">
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

          {/* Discount + Tax */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Pricing</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">Discount</Label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded border font-medium"
                    style={{
                      backgroundColor: discountType === 'percent' ? 'hsl(218 91% 57%)' : 'white',
                      color: discountType === 'percent' ? 'white' : 'hsl(var(--foreground))',
                      borderColor: 'hsl(var(--border))',
                    }}
                    onClick={() => setDiscountType('percent')}
                  >%</button>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded border font-medium"
                    style={{
                      backgroundColor: discountType === 'flat' ? 'hsl(218 91% 57%)' : 'white',
                      color: discountType === 'flat' ? 'white' : 'hsl(var(--foreground))',
                      borderColor: 'hsl(var(--border))',
                    }}
                    onClick={() => setDiscountType('flat')}
                  >$</button>
                  <Input
                    className="h-8 text-sm flex-1"
                    type="number" min={0} step={0.01}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tax Rate (%)</Label>
                <Input className="h-8 text-sm" type="number" min={0} step={0.01} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0.00" />
              </div>
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes &amp; Terms</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thank you for your business…" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Terms</Label>
              <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment is due within 30 days…" rows={3} />
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL (flex-1, preview) ── */}
        <div
          className="flex-1 overflow-y-auto px-8 py-6"
          style={{ backgroundColor: 'hsl(var(--muted))' }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Preview — {layout.charAt(0).toUpperCase() + layout.slice(1)}
            </span>
          </div>
          <div className="flex justify-center">
            <InvoicePreview
              layout={layout}
              company={company ?? {}}
              invoice={previewInvoice}
              items={previewItems}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
