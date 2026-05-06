'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Download, Send, CheckCircle, AlertCircle,
  LayoutTemplate, Columns2, AlignLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase, db } from '@/lib/supabase';
import {
  formatCurrency, formatDate, PAYMENT_TERMS,
  calcSubtotal, calcDiscount, calcTax, INVOICE_STATUSES,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Invoice, InvoiceItem, CompanySettings } from '@/types/database';

type InvoiceWithItems = Invoice & { invoice_items?: InvoiceItem[] };
type LayoutType = 'classic' | 'modern' | 'minimal';

// ── Data hooks ────────────────────────────────────────────────────────────────

function useInvoice(id: string) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as InvoiceWithItems;
    },
  });
}

function useCompanySettings() {
  return useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('*').limit(1).single();
      return data as CompanySettings | null;
    },
  });
}

// ── PDF Download ──────────────────────────────────────────────────────────────

async function downloadPDF(invoiceNumber: string) {
  const el = document.getElementById('invoice-preview');
  if (!el) return;
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Invoice-${invoiceNumber}.pdf`);
    toast.success('PDF downloaded');
  } catch {
    toast.error('Failed to generate PDF');
  }
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function InvStatusBadge({ status }: { status: string }) {
  const def = INVOICE_STATUSES.find((s) => s.value === status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${def?.color ?? ''}`}>
      {def?.label ?? status}
    </span>
  );
}

// ── Layout 1: Classic ─────────────────────────────────────────────────────────

function ClassicLayout({
  invoice, items, company, sub, disc, tax, total, payTermLabel,
}: LayoutProps) {
  return (
    <div className="bg-white min-h-265">
      {/* Header band */}
      <div className="px-10 py-8" style={{ backgroundColor: '#05253D' }}>
        <div className="flex items-start justify-between">
          <div>
            {company?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt="Logo" className="h-10 mb-3 object-contain" />
            )}
            <h1 className="text-2xl font-bold text-white">{company?.name ?? 'Your Print Shop'}</h1>
            {company?.address && (
              <p className="text-white/60 text-sm mt-1">
                {company.address}
                {company.city ? `, ${company.city}` : ''}
                {company.state ? `, ${company.state}` : ''}
                {company.zip ? ` ${company.zip}` : ''}
              </p>
            )}
            {company?.phone && <p className="text-white/60 text-sm">{company.phone}</p>}
            {company?.email && <p className="text-white/60 text-sm">{company.email}</p>}
          </div>
          <div className="text-right">
            <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-1">Invoice</p>
            <p className="text-white font-mono text-3xl font-bold">{invoice.invoice_number}</p>
            <div
              className="mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}
            >
              {INVOICE_STATUSES.find((s) => s.value === invoice.status)?.label ?? invoice.status}
            </div>
          </div>
        </div>
      </div>

      {/* Meta band */}
      <div className="px-10 py-4 grid grid-cols-4 gap-6" style={{ backgroundColor: '#F1F5F9' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Issue Date</p>
          <p className="font-semibold text-sm">{formatDate(invoice.issue_date)}</p>
        </div>
        {invoice.due_date && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Due Date</p>
            <p className="font-semibold text-sm">{formatDate(invoice.due_date)}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Payment Terms</p>
          <p className="font-semibold text-sm">{payTermLabel}</p>
        </div>
        {company?.tax_number && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Tax ID</p>
            <p className="font-semibold text-sm">{company.tax_number}</p>
          </div>
        )}
      </div>

      {/* Bill from / Bill to */}
      <div className="px-10 py-6 grid grid-cols-2 gap-10 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Bill From</p>
          <p className="font-semibold">{company?.name ?? '—'}</p>
          {company?.address && <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{company.address}</p>}
          {(company?.city || company?.state) && (
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {[company.city, company.state, company.zip].filter(Boolean).join(', ')}
            </p>
          )}
          {company?.email && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{company.email}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Bill To</p>
          <p className="font-semibold">{invoice.customer_name ?? '—'}</p>
          {invoice.customer_company && <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_company}</p>}
          {invoice.customer_email && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_email}</p>}
          {invoice.customer_address && <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_address}</p>}
        </div>
      </div>

      {/* Line items */}
      <div className="px-10 py-6">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: '#05253D' }}>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Description</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white w-16">Qty</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white w-28">Rate</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr
                key={item.id}
                style={{ backgroundColor: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid hsl(var(--border))' }}
              >
                <td className="px-4 py-3 font-medium">{item.description}</td>
                <td className="px-4 py-3 text-center">{item.qty}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.rate)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.qty * item.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="px-10 pb-6 flex justify-end">
        <div className="w-72 space-y-2 text-sm">
          <div className="flex justify-between">
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>Subtotal</span>
            <span className="font-medium">{formatCurrency(sub)}</span>
          </div>
          {disc > 0 && (
            <div className="flex justify-between">
              <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                Discount ({invoice.discount_type === 'percent' ? `${invoice.discount_value}%` : 'flat'})
              </span>
              <span className="text-red-600 font-medium">-{formatCurrency(disc)}</span>
            </div>
          )}
          {invoice.tax_rate > 0 && (
            <div className="flex justify-between">
              <span style={{ color: 'hsl(var(--muted-foreground))' }}>Tax ({invoice.tax_rate}%)</span>
              <span className="font-medium">{formatCurrency(tax)}</span>
            </div>
          )}
          <div
            className="flex justify-between items-center pt-3 border-t"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <span className="font-bold text-base">Total Due</span>
            <span className="font-bold text-xl" style={{ color: '#2E7CF6' }}>{formatCurrency(total)}</span>
          </div>
          {invoice.status === 'paid' && invoice.paid_at && (
            <div className="flex justify-between text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'hsl(152 74% 42% / 0.1)', color: 'hsl(152 74% 28%)' }}>
              <span className="font-semibold">Paid</span>
              <span>{formatDate(invoice.paid_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Notes & Terms */}
      {(invoice.notes || invoice.terms) && (
        <div className="px-10 pb-6 grid grid-cols-2 gap-6 border-t pt-6" style={{ borderColor: 'hsl(var(--border))' }}>
          {invoice.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</p>
              <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
          {invoice.terms && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Terms & Conditions</p>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.terms}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-10 py-4 border-t text-center text-xs" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
        {company?.website && <p className="mb-1">{company.website}</p>}
        <p>Thank you for your business — {company?.email ?? 'contact us for questions'}</p>
      </div>
    </div>
  );
}

// ── Layout 2: Modern ──────────────────────────────────────────────────────────

function ModernLayout({
  invoice, items, company, sub, disc, tax, total, payTermLabel,
}: LayoutProps) {
  return (
    <div className="bg-white min-h-265 flex">
      {/* Left blue strip */}
      <div className="w-10 shrink-0" style={{ backgroundColor: '#2E7CF6' }} />

      {/* Main content */}
      <div className="flex-1 px-10 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            {company?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt="Logo" className="h-8 mb-2 object-contain" />
            )}
            <h1 className="text-xl font-bold" style={{ color: '#05253D' }}>{company?.name ?? 'Your Print Shop'}</h1>
            {company?.email && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{company.email}</p>}
            {company?.website && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{company.website}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold font-mono" style={{ color: '#2E7CF6' }}>{invoice.invoice_number}</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Issued {formatDate(invoice.issue_date)}</p>
            {invoice.due_date && (
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Due {formatDate(invoice.due_date)}</p>
            )}
            <div className="mt-2">
              <InvStatusBadge status={invoice.status} />
            </div>
          </div>
        </div>

        {/* Bill To card */}
        <div className="rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))', backgroundColor: '#F8FAFC' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Bill To</p>
          <p className="font-bold text-base">{invoice.customer_name ?? '—'}</p>
          {invoice.customer_company && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_company}</p>}
          {invoice.customer_email && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_email}</p>}
          {invoice.customer_address && <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_address}</p>}
        </div>

        {/* Meta strip */}
        <div className="flex gap-6 text-sm flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Terms</p>
            <p className="font-semibold">{payTermLabel}</p>
          </div>
          {company?.tax_number && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Tax ID</p>
              <p className="font-semibold">{company.tax_number}</p>
            </div>
          )}
        </div>

        {/* Line items — card rows */}
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_3rem_6rem_6rem] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
            <span>Description</span><span className="text-center">Qty</span><span className="text-right">Rate</span><span className="text-right">Amount</span>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_3rem_6rem_6rem] gap-3 items-center px-4 py-3 rounded-lg border text-sm"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <span className="font-medium">{item.description}</span>
              <span className="text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.qty}</span>
              <span className="text-right" style={{ color: 'hsl(var(--muted-foreground))' }}>{formatCurrency(item.rate)}</span>
              <span className="text-right font-semibold">{formatCurrency(item.qty * item.rate)}</span>
            </div>
          ))}
        </div>

        {/* Totals highlight box */}
        <div className="flex justify-end">
          <div className="w-72 rounded-xl overflow-hidden" style={{ backgroundColor: '#05253D' }}>
            <div className="px-5 py-4 space-y-2 text-sm">
              <div className="flex justify-between text-white/70">
                <span>Subtotal</span><span>{formatCurrency(sub)}</span>
              </div>
              {disc > 0 && (
                <div className="flex justify-between text-white/70">
                  <span>Discount</span><span className="text-red-300">-{formatCurrency(disc)}</span>
                </div>
              )}
              {invoice.tax_rate > 0 && (
                <div className="flex justify-between text-white/70">
                  <span>Tax ({invoice.tax_rate}%)</span><span>{formatCurrency(tax)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-3 border-t border-white/20 mt-1">
                <span className="font-bold text-white text-base">Total Due</span>
                <span className="font-bold text-white text-2xl">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 text-xs border-t" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
          <p>Thank you for your business. {company?.email ? `Questions? ${company.email}` : ''}</p>
        </div>
      </div>
    </div>
  );
}

// ── Layout 3: Minimal ─────────────────────────────────────────────────────────

function MinimalLayout({
  invoice, items, company, sub, disc, tax, total, payTermLabel,
}: LayoutProps) {
  return (
    <div className="bg-white min-h-265 px-14 py-12">
      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <p className="font-bold text-lg">{company?.name ?? 'Your Print Shop'}</p>
          {company?.address && (
            <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {company.address}{company.city ? `, ${company.city}` : ''}{company.state ? `, ${company.state}` : ''}
            </p>
          )}
          {company?.email && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{company.email}</p>}
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-2xl">{invoice.invoice_number}</p>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>Invoice</p>
        </div>
      </div>

      {/* Bill to + dates */}
      <div className="grid grid-cols-3 gap-8 mb-10 pb-8 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Bill To</p>
          <p className="font-semibold">{invoice.customer_name ?? '—'}</p>
          {invoice.customer_company && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_company}</p>}
          {invoice.customer_email && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_email}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Issue Date</p>
          <p className="font-semibold">{formatDate(invoice.issue_date)}</p>
          {invoice.due_date && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider mt-3 mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Due Date</p>
              <p className="font-semibold">{formatDate(invoice.due_date)}</p>
            </>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Payment Terms</p>
          <p className="font-semibold">{payTermLabel}</p>
        </div>
      </div>

      {/* Line items */}
      <table className="w-full text-sm mb-8">
        <thead>
          <tr style={{ borderBottom: '2px solid hsl(var(--foreground))' }}>
            <th className="pb-3 text-left font-semibold text-xs uppercase tracking-wider">Description</th>
            <th className="pb-3 text-center font-semibold text-xs uppercase tracking-wider w-16">Qty</th>
            <th className="pb-3 text-right font-semibold text-xs uppercase tracking-wider w-28">Rate</th>
            <th className="pb-3 text-right font-semibold text-xs uppercase tracking-wider w-28">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
              <td className="py-3 font-medium">{item.description}</td>
              <td className="py-3 text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.qty}</td>
              <td className="py-3 text-right" style={{ color: 'hsl(var(--muted-foreground))' }}>{formatCurrency(item.rate)}</td>
              <td className="py-3 text-right font-semibold">{formatCurrency(item.qty * item.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-10">
        <div className="w-64 space-y-2 text-sm">
          <div className="flex justify-between">
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>Subtotal</span>
            <span>{formatCurrency(sub)}</span>
          </div>
          {disc > 0 && (
            <div className="flex justify-between">
              <span style={{ color: 'hsl(var(--muted-foreground))' }}>Discount</span>
              <span>-{formatCurrency(disc)}</span>
            </div>
          )}
          {invoice.tax_rate > 0 && (
            <div className="flex justify-between">
              <span style={{ color: 'hsl(var(--muted-foreground))' }}>Tax ({invoice.tax_rate}%)</span>
              <span>{formatCurrency(tax)}</span>
            </div>
          )}
          <div
            className="flex justify-between font-bold text-base pt-3"
            style={{ borderTop: '2px solid hsl(var(--foreground))' }}
          >
            <span>Total Due</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {(invoice.notes || invoice.terms) && (
        <div className="grid grid-cols-2 gap-6 border-t pt-6 text-sm" style={{ borderColor: 'hsl(var(--border))' }}>
          {invoice.notes && (
            <div>
              <p className="font-semibold mb-1">Notes</p>
              <p className="whitespace-pre-wrap" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.notes}</p>
            </div>
          )}
          {invoice.terms && (
            <div>
              <p className="font-semibold mb-1">Terms & Conditions</p>
              <p className="whitespace-pre-wrap" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.terms}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Layout Props ──────────────────────────────────────────────────────────────

interface LayoutProps {
  invoice: InvoiceWithItems;
  items: InvoiceItem[];
  company: CompanySettings | null | undefined;
  sub: number;
  disc: number;
  tax: number;
  total: number;
  payTermLabel: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: invoice, isLoading, isError } = useInvoice(id);
  const { data: company } = useCompanySettings();
  const [layout, setLayout] = useState<LayoutType>('classic');
  const [downloading, setDownloading] = useState(false);

  const updateStatus = async (status: Invoice['status']) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };
    if (status === 'paid') updates.paid_at = now;
    if (status === 'sent') updates.sent_at = now;
    const { error } = await db.from('invoices').update(updates).eq('id', id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['invoice', id] });
    qc.invalidateQueries({ queryKey: ['invoices'] });
    toast.success(`Invoice marked as ${status}`);
  };

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
    await downloadPDF(invoice.invoice_number);
    setDownloading(false);
  };

  if (isLoading) {
    return (
      <div className="animate-page-in max-w-4xl mx-auto space-y-4 py-8">
        <div className="skeleton-shimmer h-8 w-48 mb-6" />
        <div className="skeleton-shimmer h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-red-500" />
        <p className="font-semibold text-lg">Invoice not found</p>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          The invoice may have been deleted or the ID is invalid.
        </p>
        <Button className="mt-4" onClick={() => router.push('/invoices')}>
          <ArrowLeft className="h-4 w-4" /> Back to Invoices
        </Button>
      </div>
    );
  }

  const items = invoice.invoice_items ?? [];
  const sub = calcSubtotal(items.map((i) => ({ qty: i.qty, unit_price: i.rate })));
  const disc = calcDiscount(sub, invoice.discount_type, invoice.discount_value);
  const tax = calcTax(sub - disc, invoice.tax_rate);
  const total = sub - disc + tax;
  const payTermLabel = PAYMENT_TERMS.find((t) => t.value === invoice.payment_terms)?.label ?? invoice.payment_terms;

  const layoutProps: LayoutProps = { invoice, items, company, sub, disc, tax, total, payTermLabel };

  const layoutButtons: { key: LayoutType; label: string; icon: React.ElementType }[] = [
    { key: 'classic', label: 'Classic', icon: LayoutTemplate },
    { key: 'modern',  label: 'Modern',  icon: Columns2 },
    { key: 'minimal', label: 'Minimal', icon: AlignLeft },
  ];

  return (
    <div className="animate-page-in">
      {/* Actions Bar */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => router.push('/invoices')}>
          <ArrowLeft className="h-4 w-4" /> Back to Invoices
        </Button>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Layout switcher */}
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
            {layoutButtons.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: layout === key ? '#05253D' : 'transparent',
                  color: layout === key ? 'white' : 'hsl(var(--muted-foreground))',
                }}
                onClick={() => setLayout(key)}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <InvStatusBadge status={invoice.status} />

          {invoice.status === 'draft' && (
            <Button size="sm" variant="outline" onClick={() => updateStatus('sent')}>
              <Send className="h-3.5 w-3.5" /> Mark as Sent
            </Button>
          )}
          {(invoice.status === 'sent' || invoice.status === 'overdue') && (
            <Button size="sm" onClick={() => updateStatus('paid')} style={{ backgroundColor: 'hsl(152 74% 38%)' }}>
              <CheckCircle className="h-3.5 w-3.5" /> Mark as Paid
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? 'Generating…' : 'Download PDF'}
          </Button>
        </div>
      </div>

      {/* Invoice Preview */}
      <div
        id="invoice-preview"
        className="mx-auto max-w-4xl shadow-lg rounded-xl overflow-hidden"
        style={{ border: '1px solid hsl(var(--border))' }}
      >
        {layout === 'classic' && <ClassicLayout {...layoutProps} />}
        {layout === 'modern'  && <ModernLayout  {...layoutProps} />}
        {layout === 'minimal' && <MinimalLayout  {...layoutProps} />}
      </div>
    </div>
  );
}
