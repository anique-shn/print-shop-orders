'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Printer, ArrowLeft, CheckCircle, Send, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { formatCurrency, formatDate, PAYMENT_TERMS, calcSubtotal, calcDiscount, calcTax, INVOICE_STATUSES } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Invoice, InvoiceItem, CompanySettings } from '@/types/database';

type InvoiceWithItems = Invoice & { invoice_items?: InvoiceItem[] };

function InvStatusBadge({ status }: { status: string }) {
  const def = INVOICE_STATUSES.find((s) => s.value === status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${def?.color ?? ''}`}>
      {def?.label ?? status}
    </span>
  );
}

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

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: invoice, isLoading, isError } = useInvoice(id);
  const { data: company } = useCompanySettings();

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

  if (isLoading) {
    return (
      <div className="animate-page-in max-w-3xl mx-auto space-y-4 py-8">
        <div className="skeleton-shimmer h-8 w-48 mb-6" />
        <div className="skeleton-shimmer h-64 w-full rounded-xl" />
        <div className="skeleton-shimmer h-48 w-full rounded-xl" />
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

  return (
    <div className="animate-page-in">
      {/* Toolbar — hidden when printing */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => router.push('/invoices')}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <InvStatusBadge status={invoice.status} />
          {invoice.status === 'draft' && (
            <Button size="sm" variant="outline" onClick={() => updateStatus('sent')}>
              <Send className="h-3.5 w-3.5" /> Mark as Sent
            </Button>
          )}
          {(invoice.status === 'sent' || invoice.status === 'overdue') && (
            <Button size="sm" onClick={() => updateStatus('paid')} style={{ backgroundColor: 'hsl(152, 74%, 38%)' }}>
              <CheckCircle className="h-3.5 w-3.5" /> Mark as Paid
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* Invoice document — centered card */}
      <div
        className="mx-auto max-w-3xl bg-white rounded-2xl shadow-lg print:shadow-none print:rounded-none"
        style={{ border: '1px solid hsl(var(--border))' }}
      >
        {/* Header band */}
        <div
          className="rounded-t-2xl print:rounded-none px-10 py-8"
          style={{ background: 'linear-gradient(135deg, hsl(205, 98%, 13%) 0%, hsl(218, 91%, 57%) 100%)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              {company?.logo_url && (
                <img src={company.logo_url} alt="Logo" className="h-10 object-contain mb-3" />
              )}
              <h1 className="text-2xl font-bold text-white font-heading">
                {company?.name ?? 'Your Print Shop'}
              </h1>
              {company?.address && (
                <p className="text-white/70 text-sm mt-1">
                  {company.address}{company.city ? `, ${company.city}` : ''}{company.state ? `, ${company.state}` : ''}{company.zip ? ` ${company.zip}` : ''}
                </p>
              )}
              {company?.phone && <p className="text-white/70 text-sm">{company.phone}</p>}
              {company?.email && <p className="text-white/70 text-sm">{company.email}</p>}
            </div>
            <div className="text-right">
              <div className="text-white/60 text-sm font-medium uppercase tracking-widest mb-1">Invoice</div>
              <div className="text-white font-mono text-2xl font-bold">{invoice.invoice_number}</div>
              <div
                className="mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}
              >
                {INVOICE_STATUSES.find((s) => s.value === invoice.status)?.label ?? invoice.status}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-10 py-8 space-y-8">
          {/* Meta row */}
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Bill To</p>
              <p className="font-semibold">{invoice.customer_name ?? '—'}</p>
              {invoice.customer_company && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_company}</p>}
              {invoice.customer_email && <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_email}</p>}
              {invoice.customer_address && <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{invoice.customer_address}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Invoice Date</p>
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
              {company?.tax_number && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider mt-3 mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Tax ID</p>
                  <p className="font-semibold">{company.tax_number}</p>
                </>
              )}
            </div>
          </div>

          {/* Line items table */}
          <div>
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'hsl(var(--border))' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'hsl(var(--muted))' }}>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Description</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider w-16" style={{ color: 'hsl(var(--muted-foreground))' }}>Qty</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider w-28" style={{ color: 'hsl(var(--muted-foreground))' }}>Rate</th>
                    <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider w-28" style={{ color: 'hsl(var(--muted-foreground))' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr
                      key={item.id}
                      style={{
                        borderTop: '1px solid hsl(var(--border))',
                        backgroundColor: i % 2 === 0 ? 'white' : 'hsl(var(--muted) / 0.3)',
                      }}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium">{item.description}</span>
                        {item.taxable && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                            Taxable
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{item.qty}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.rate)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.qty * item.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>Subtotal</span>
                <span className="font-medium">{formatCurrency(sub)}</span>
              </div>
              {disc > 0 && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Discount ({invoice.discount_type === 'percent' ? `${invoice.discount_value}%` : 'flat'})
                  </span>
                  <span className="font-medium text-red-600">-{formatCurrency(disc)}</span>
                </div>
              )}
              {invoice.tax_rate > 0 && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>Tax ({invoice.tax_rate}%)</span>
                  <span className="font-medium">{formatCurrency(tax)}</span>
                </div>
              )}
              <div
                className="flex justify-between items-center pt-3 mt-2 border-t"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <span className="font-bold text-base">Total Due</span>
                <span
                  className="font-bold text-xl"
                  style={{ color: 'hsl(218, 91%, 57%)' }}
                >
                  {formatCurrency(total)}
                </span>
              </div>
              {invoice.status === 'paid' && invoice.paid_at && (
                <div
                  className="flex justify-between text-sm rounded-lg px-3 py-2"
                  style={{ backgroundColor: 'hsl(152, 74%, 42% / 0.1)', color: 'hsl(152, 74%, 28%)' }}
                >
                  <span className="font-semibold">Paid</span>
                  <span>{formatDate(invoice.paid_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes & Terms */}
          {(invoice.notes || invoice.terms) && (
            <div className="grid grid-cols-2 gap-6 pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              {invoice.notes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Notes</p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'hsl(var(--foreground))' }}>{invoice.notes}</p>
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
          <div
            className="pt-6 border-t text-center text-xs"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
          >
            {company?.website && (
              <p className="mb-1">{company.website}</p>
            )}
            <p>Thank you for your business. Questions? Contact us at {company?.email ?? 'your@email.com'}</p>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
