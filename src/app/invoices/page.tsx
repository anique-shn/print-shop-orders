'use client';

import { useState, useMemo, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Search, Pencil, Trash2, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import {
  formatCurrency, formatDate,
  INVOICE_STATUSES, calcSubtotal, calcDiscount, calcTax,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import type { Invoice, InvoiceItem } from '@/types/database';

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceWithItems = Invoice & { invoice_items?: InvoiceItem[] };

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

// ── Page Inner ────────────────────────────────────────────────────────────────

function InvoicesPageInner() {
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
                      {inv.order_id ? inv.order_id.slice(0, 8) : '—'}
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

      {/* Modals */}
      <CreateInvoiceModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editInvoice && (
        <CreateInvoiceModal open onClose={() => setEditInvoice(null)} editInvoice={editInvoice} />
      )}
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="animate-page-in p-6"><div className="skeleton-shimmer h-8 w-40 mb-4" /><div className="skeleton-shimmer h-64 w-full rounded-lg" /></div>}>
      <InvoicesPageInner />
    </Suspense>
  );
}
