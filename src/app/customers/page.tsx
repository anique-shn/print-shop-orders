'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import type { Customer } from '@/types/database';

// ── Data hook ─────────────────────────────────────────────────────────────────

function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });
}

// ── Customer Modal ────────────────────────────────────────────────────────────

interface CustomerFormState {
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
}

const emptyForm = (): CustomerFormState => ({
  name: '', company: '', email: '', phone: '',
  address: '', city: '', state: '', zip: '', notes: '',
});

function fromCustomer(c: Customer): CustomerFormState {
  return {
    name: c.name ?? '',
    company: c.company ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    zip: c.zip ?? '',
    notes: c.notes ?? '',
  };
}

function CustomerModal({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CustomerFormState>(customer ? fromCustomer(customer) : emptyForm());
  const [saving, setSaving] = useState(false);

  const set = (key: keyof CustomerFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        company: form.company || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        notes: form.notes || null,
      };
      if (customer) {
        const { error } = await db.from('customers').update(payload).eq('id', customer.id);
        if (error) throw error;
        toast.success('Customer updated');
      } else {
        const { error } = await db.from('customers').insert(payload);
        if (error) throw error;
        toast.success('Customer created');
      }
      qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else setForm(customer ? fromCustomer(customer) : emptyForm());
      }}
    >
      <DialogContent className="max-w-lg w-full">
        <DialogHeader>
          <DialogTitle>{customer ? 'Edit Customer' : 'New Customer'}</DialogTitle>
          <DialogDescription>
            {customer ? 'Update customer contact details.' : 'Add a new customer to your database.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Full Name <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={set('name')} placeholder="Jane Smith" />
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input value={form.company} onChange={set('company')} placeholder="Acme Corp" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={set('email')} placeholder="jane@acme.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Address</Label>
              <Input value={form.address} onChange={set('address')} placeholder="123 Main St" />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={set('city')} placeholder="New York" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input value={form.state} onChange={set('state')} placeholder="NY" />
              </div>
              <div className="space-y-1.5">
                <Label>ZIP</Label>
                <Input value={form.zip} onChange={set('zip')} placeholder="10001" />
              </div>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={set('notes')} placeholder="Internal notes about this customer…" rows={2} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : customer ? 'Save Changes' : 'Create Customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const qc = useQueryClient();
  const { data: customers = [], isLoading } = useCustomers();

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q),
    );
  }, [customers, search]);

  const deleteCustomer = async (id: string) => {
    if (!confirm('Delete this customer? This will not delete associated orders or invoices.')) return;
    await db.from('customers').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['customers'] });
    toast.success('Customer deleted');
  };

  return (
    <div className="animate-page-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">Customers</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Manage your customer database.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
        <Input
          className="pl-9"
          placeholder="Search by name, company, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 border-b last:border-b-0" style={{ borderColor: 'hsl(var(--border))' }}>
                  <div className="skeleton-shimmer h-8 w-8 rounded-full" />
                  <div className="skeleton-shimmer h-4 w-36 flex-1" />
                  <div className="skeleton-shimmer h-4 w-40" />
                  <div className="skeleton-shimmer h-4 w-28" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="mb-3 h-10 w-10" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="font-medium">
                {search ? 'No customers match your search' : 'No customers yet'}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {search ? 'Try a different search term.' : 'Add your first customer to get started.'}
              </p>
              {!search && (
                <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> New Customer
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  {['Name', 'Company', 'Email', 'Phone', 'Actions'].map((h) => (
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
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid hsl(var(--border))' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'hsl(var(--accent))')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white shrink-0"
                          style={{ backgroundColor: 'hsl(218, 91%, 57%)' }}
                        >
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{c.name}</div>
                          {c.city && c.state && (
                            <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {c.city}, {c.state}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">{c.company ?? '—'}</td>
                    <td className="px-6 py-4">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="text-sm hover:underline"
                          style={{ color: 'hsl(218, 91%, 57%)' }}
                        >
                          {c.email}
                        </a>
                      ) : (
                        <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {c.phone ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => setEditCustomer(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => deleteCustomer(c.id)}
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

      <CustomerModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editCustomer && (
        <CustomerModal open onClose={() => setEditCustomer(null)} customer={editCustomer} />
      )}
    </div>
  );
}
