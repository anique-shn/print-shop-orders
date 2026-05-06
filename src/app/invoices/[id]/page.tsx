'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Download, Send, CheckCircle, AlertCircle,
  LayoutTemplate, Columns2, AlignLeft, Minimize2,
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase, db } from '@/lib/supabase';
import { INVOICE_STATUSES } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { InvoicePreview } from '@/components/invoices/InvoicePreview';
import type { Invoice, InvoiceItem, CompanySettings } from '@/types/database';

type InvoiceWithItems = Invoice & { invoice_items?: InvoiceItem[] };
type LayoutType = 'classic' | 'modern' | 'minimal' | 'compact';

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
  const el = document.getElementById('invoice-live-preview');
  if (!el) return;
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
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

// ── Status Badge ──────────────────────────────────────────────────────────────

function InvStatusBadge({ status }: { status: string }) {
  const def = INVOICE_STATUSES.find((s) => s.value === status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${def?.color ?? ''}`}>
      {def?.label ?? status}
    </span>
  );
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

  const items = (invoice.invoice_items ?? []).map((i) => ({
    description: i.description,
    qty: i.qty,
    rate: i.rate,
    taxable: i.taxable,
  }));

  const layoutButtons: { key: LayoutType; label: string; icon: React.ElementType }[] = [
    { key: 'classic', label: 'Classic', icon: LayoutTemplate },
    { key: 'modern',  label: 'Modern',  icon: Columns2 },
    { key: 'minimal', label: 'Minimal', icon: AlignLeft },
    { key: 'compact', label: 'Compact', icon: Minimize2 },
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
        id="invoice-live-preview"
        className="mx-auto max-w-4xl shadow-lg rounded-xl overflow-hidden"
        style={{ border: '1px solid hsl(var(--border))' }}
      >
        <InvoicePreview
          layout={layout}
          company={company ?? {}}
          invoice={invoice}
          items={items}
        />
      </div>
    </div>
  );
}
