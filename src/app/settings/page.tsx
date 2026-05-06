'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Building2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { PAYMENT_TERMS } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { CompanySettings } from '@/types/database';

function useSettings() {
  return useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();
      return data as CompanySettings | null;
    },
  });
}

interface FormState {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  tax_number: string;
  default_tax_rate: string;
  default_payment_terms: string;
  invoice_notes: string;
  invoice_terms: string;
}

const toForm = (s: CompanySettings | null): FormState => ({
  name: s?.name ?? '',
  address: s?.address ?? '',
  city: s?.city ?? '',
  state: s?.state ?? '',
  zip: s?.zip ?? '',
  phone: s?.phone ?? '',
  email: s?.email ?? '',
  website: s?.website ?? '',
  logo_url: s?.logo_url ?? '',
  tax_number: s?.tax_number ?? '',
  default_tax_rate: String(s?.default_tax_rate ?? ''),
  default_payment_terms: s?.default_payment_terms ?? 'net30',
  invoice_notes: s?.invoice_notes ?? '',
  invoice_terms: s?.invoice_terms ?? '',
});

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-semibold font-heading">{title}</h2>
      <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{description}</p>
    </div>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading, isError } = useSettings();
  const [form, setForm] = useState<FormState>(toForm(null));
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (settings !== undefined) {
      setForm(toForm(settings));
      setIsDirty(false);
    }
  }, [settings]);

  const set = (key: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setIsDirty(true);
  };

  const setSelect = (key: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setIsDirty(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        logo_url: form.logo_url || null,
        tax_number: form.tax_number || null,
        default_tax_rate: parseFloat(form.default_tax_rate) || 0,
        default_payment_terms: form.default_payment_terms as CompanySettings['default_payment_terms'],
        invoice_notes: form.invoice_notes || null,
        invoice_terms: form.invoice_terms || null,
        updated_at: new Date().toISOString(),
      };

      if (settings?.id) {
        const { error } = await db.from('company_settings').update(payload).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('company_settings').insert(payload);
        if (error) throw error;
      }

      toast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['company-settings'] });
      setIsDirty(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-page-in max-w-3xl space-y-6">
        <div className="skeleton-shimmer h-8 w-40" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border p-6 space-y-4" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="skeleton-shimmer h-5 w-32" />
            <div className="grid grid-cols-2 gap-4">
              <div className="skeleton-shimmer h-9 w-full rounded-md" />
              <div className="skeleton-shimmer h-9 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 max-w-lg">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Failed to load settings. Check your Supabase connection.
      </div>
    );
  }

  return (
    <div className="animate-page-in max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">Settings</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Configure your print shop details used on invoices and quotes.
          </p>
        </div>
        <Button onClick={save} disabled={saving || !isDirty}>
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : isDirty ? 'Save Changes' : 'Saved'}
        </Button>
      </div>

      {/* Company info */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" style={{ color: 'hsl(218, 91%, 57%)' }} />
            <CardTitle className="text-sm">Company Information</CardTitle>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            This appears on the header of all invoices.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Company Name <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={set('name')} placeholder="Shines Print Co." />
          </div>

          {/* Logo */}
          <div className="space-y-1.5">
            <Label>Logo URL</Label>
            <Input value={form.logo_url} onChange={set('logo_url')} placeholder="https://yoursite.com/logo.png" />
            {form.logo_url && (
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={form.logo_url}
                  alt="Logo preview"
                  className="h-12 object-contain rounded border p-1"
                  style={{ borderColor: 'hsl(var(--border))' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Logo preview</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Street Address</Label>
            <Input value={form.address} onChange={set('address')} placeholder="123 Print Lane" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={set('city')} placeholder="Los Angeles" />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input value={form.state} onChange={set('state')} placeholder="CA" maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label>ZIP</Label>
              <Input value={form.zip} onChange={set('zip')} placeholder="90001" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={set('email')} placeholder="hello@printshop.com" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Website</Label>
              <Input value={form.website} onChange={set('website')} placeholder="https://printshop.com" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tax / EIN Number</Label>
            <Input value={form.tax_number} onChange={set('tax_number')} placeholder="12-3456789" />
          </div>
        </CardContent>
      </Card>

      {/* Invoice defaults */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Invoice Defaults</CardTitle>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Default values applied when creating new invoices.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Default Tax Rate (%)</Label>
              <Input
                type="number" min={0} max={100} step={0.01}
                value={form.default_tax_rate}
                onChange={set('default_tax_rate')}
                placeholder="8.25"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default Payment Terms</Label>
              <Select value={form.default_payment_terms} onValueChange={setSelect('default_payment_terms')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Default Invoice Notes</Label>
            <Textarea
              value={form.invoice_notes}
              onChange={set('invoice_notes')}
              placeholder="Thank you for choosing us! We appreciate your business."
              rows={3}
            />
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Shown in the Notes section of every invoice.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Default Invoice Terms</Label>
            <Textarea
              value={form.invoice_terms}
              onChange={set('invoice_terms')}
              placeholder="Payment is due within 30 days of invoice date. Late payments may incur a 1.5% monthly fee."
              rows={3}
            />
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Shown in the Terms & Conditions section of every invoice.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save footer */}
      <div
        className="sticky bottom-0 -mx-8 px-8 py-4 flex items-center justify-between border-t"
        style={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
      >
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {isDirty ? 'You have unsaved changes.' : 'All changes are saved.'}
        </p>
        <Button onClick={save} disabled={saving || !isDirty}>
          <Save className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
