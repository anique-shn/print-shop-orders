'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Search, Plus, Trash2, ChevronDown, ShoppingCart,
  Layers, Tag, Settings, Package, Scissors, Ticket, Droplets, Shirt,
  Printer, Paintbrush, Palette, Wrench, Zap, Star, Circle,
  Hash, Box, Truck, Award, Grid3x3,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import {
  formatCurrency, generateOrderNumber, calcSubtotal, calcDiscount, calcTax,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type {
  Order, OrderItem, Customer,
  ServiceGroupWithItems, ServiceItemWithTiers, ServiceItemTier,
} from '@/types/database';

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderWithItems = Order & { order_items?: OrderItem[] };

interface CartItem {
  tempId: string;
  serviceItemId: string | null;
  name: string;
  description: string;
  location: string;
  qty: number;
  unit_price: number;
  pricing_type: 'moq' | 'flat';
  tiers: ServiceItemTier[];
  icon: string | null;
  color: string | null;
}

// ── Icon Map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Layers, Tag, Settings, Package, Scissors, Ticket, Droplets, Shirt,
  Printer, Paintbrush, Palette, Wrench, Zap, Star, Circle,
  Hash, Box, Truck, Award, Grid3x3,
};

function IconRenderer({ name, size = 16, color }: { name: string | null; size?: number; color?: string }) {
  if (!name) return <Package style={{ width: size, height: size, color: color ?? 'currentColor' }} />;
  const Comp = ICON_MAP[name] ?? Package;
  return <Comp style={{ width: size, height: size, color: color ?? 'currentColor' }} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPriceForQty(tiers: ServiceItemTier[], qty: number): number {
  if (!tiers.length) return 0;
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  let best = sorted[0];
  for (const tier of sorted) {
    if (qty >= tier.min_qty) best = tier;
  }
  return best.price_per_unit;
}

function genTempId() {
  return `tmp_${Math.random().toString(36).slice(2)}`;
}

// ── Data Hooks ────────────────────────────────────────────────────────────────

function useServiceGroups() {
  return useQuery<ServiceGroupWithItems[]>({
    queryKey: ['service-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_groups')
        .select('*, items:service_items(*, tiers:service_item_tiers(*))')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as ServiceGroupWithItems[];
    },
  });
}

function useCustomers() {
  return useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').order('name');
      return (data ?? []) as Customer[];
    },
  });
}

// ── Qty + Price Popover (inline, not an actual Popover) ───────────────────────

interface AddItemFormProps {
  item: ServiceItemWithTiers;
  groupColor: string;
  groupIcon: string;
  onAdd: (entry: CartItem) => void;
  onCancel: () => void;
}

function AddItemForm({ item, groupColor, groupIcon, onAdd, onCancel }: AddItemFormProps) {
  const effectiveColor = item.color ?? groupColor;
  const [qty, setQty] = useState(item.pricing_type === 'moq' && item.tiers.length
    ? Math.min(...item.tiers.map((t) => t.min_qty))
    : 1
  );
  const [description, setDescription] = useState(item.name);
  const [location, setLocation] = useState('');

  const unitPrice = item.pricing_type === 'flat'
    ? (item.flat_price ?? 0)
    : getPriceForQty(item.tiers, qty);

  const lineTotal = unitPrice * qty;

  const moqMin = item.pricing_type === 'moq' && item.tiers.length
    ? Math.min(...item.tiers.map((t) => t.min_qty))
    : 1;

  const activeTier = item.pricing_type === 'moq'
    ? [...item.tiers].sort((a, b) => a.min_qty - b.min_qty).reduce((best, t) => qty >= t.min_qty ? t : best, item.tiers[0])
    : null;

  return (
    <div
      className="mt-2 rounded-lg border p-3 space-y-3"
      style={{ borderColor: effectiveColor + '40', backgroundColor: effectiveColor + '08' }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Quantity {item.pricing_type === 'moq' && <span style={{ color: 'hsl(var(--muted-foreground))' }}>(min {moqMin})</span>}</Label>
          <Input
            type="number"
            min={moqMin}
            value={qty}
            onChange={(e) => setQty(parseInt(e.target.value) || moqMin)}
            className="h-7 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Location</Label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Left Chest"
            className="h-7 text-sm"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-7 text-sm"
        />
      </div>

      {/* MOQ tier info */}
      {item.pricing_type === 'moq' && activeTier && (
        <div className="text-xs rounded px-2 py-1.5" style={{ backgroundColor: effectiveColor + '18', color: effectiveColor }}>
          Tier: {activeTier.min_qty.toLocaleString()}
          {activeTier.max_qty ? `–${activeTier.max_qty.toLocaleString()}` : '+'} units
          @ {formatCurrency(activeTier.price_per_unit)}/ea
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="text-sm">
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>Total: </span>
          <span className="font-bold">{formatCurrency(lineTotal)}</span>
          <span className="text-xs ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>({formatCurrency(unitPrice)}/ea)</span>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={onCancel} type="button">Cancel</Button>
          <Button
            size="sm"
            type="button"
            onClick={() => {
              onAdd({
                tempId: genTempId(),
                serviceItemId: item.id,
                name: item.name,
                description,
                location,
                qty,
                unit_price: unitPrice,
                pricing_type: item.pricing_type,
                tiers: item.tiers,
                icon: item.icon ?? null,
                color: item.color ?? null,
              });
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add to Order
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface OrderCreateModalProps {
  open: boolean;
  onClose: () => void;
  editOrder?: OrderWithItems;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrderCreateModal({ open, onClose, editOrder }: OrderCreateModalProps) {
  const qc = useQueryClient();
  const { data: customers = [] } = useCustomers();
  const { data: serviceGroups = [] } = useServiceGroups();

  // Customer
  const [customerMode, setCustomerMode] = useState<'select' | 'inline'>('select');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custCompany, setCustCompany] = useState('');
  const [custSearch, setCustSearch] = useState('');

  // Order Details
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [taxRate, setTaxRate] = useState('');

  // Service selector
  const [search, setSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  const [saving, setSaving] = useState(false);

  // Auto-select first group
  useEffect(() => {
    if (serviceGroups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(serviceGroups[0].id);
    }
  }, [serviceGroups, selectedGroupId]);

  // Populate from editOrder
  useEffect(() => {
    if (!open) return;
    if (editOrder) {
      setCustomerMode(editOrder.customer_id ? 'select' : 'inline');
      setSelectedCustomerId(editOrder.customer_id ?? '');
      setCustName(editOrder.customer_name ?? '');
      setCustEmail(editOrder.customer_email ?? '');
      setCustPhone(editOrder.customer_phone ?? '');
      setCustCompany(editOrder.customer_company ?? '');
      setDueDate(editOrder.due_date ?? '');
      setNotes(editOrder.notes ?? '');
      setRefNumber('');
      setImageUrl(editOrder.image_url ?? '');
      setDepositAmount(String(editOrder.deposit_amount ?? ''));
      setDiscountType(editOrder.discount_type ?? 'percent');
      setDiscountValue(String(editOrder.discount_value ?? ''));
      setTaxRate(String(editOrder.tax_rate ?? ''));
      setCart(
        (editOrder.order_items ?? []).map((oi) => ({
          tempId: genTempId(),
          serviceItemId: oi.item_id ?? null,
          name: oi.description,
          description: oi.description,
          location: oi.decoration_location ?? '',
          qty: oi.qty,
          unit_price: oi.unit_price,
          pricing_type: 'flat',
          tiers: [],
          icon: null,
          color: null,
        }))
      );
    } else {
      setCustomerMode('select');
      setSelectedCustomerId('');
      setCustName(''); setCustEmail(''); setCustPhone(''); setCustCompany('');
      setDueDate(''); setNotes(''); setRefNumber(''); setImageUrl('');
      setDepositAmount(''); setDiscountType('percent'); setDiscountValue(''); setTaxRate('');
      setCart([]);
    }
  }, [open, editOrder]);

  // Totals
  const sub = calcSubtotal(cart.map((c) => ({ qty: c.qty, unit_price: c.unit_price })));
  const disc = calcDiscount(sub, discountType, parseFloat(discountValue) || 0);
  const tax = calcTax(sub - disc, parseFloat(taxRate) || 0);
  const total = sub - disc + tax;

  // Filtered items for right panel
  const filteredItems = useMemo(() => {
    if (!search.trim()) {
      const group = serviceGroups.find((g) => g.id === selectedGroupId);
      return group ? group.items : [];
    }
    const q = search.toLowerCase();
    const all = serviceGroups.flatMap((g) => g.items);
    return all.filter((i) => i.name.toLowerCase().includes(q));
  }, [serviceGroups, selectedGroupId, search]);

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
    const cust = resolveCustomer();
    if (!cust.customer_name && !cust.customer_id) {
      toast.error('Customer name is required'); return;
    }
    if (cart.length === 0) {
      toast.error('Add at least one item to the order'); return;
    }
    setSaving(true);
    try {
      const orderData = {
        ...cust,
        order_number: editOrder?.order_number ?? generateOrderNumber(),
        status: editOrder?.status ?? 'new' as const,
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

      const itemRows = cart.map((c) => ({
        order_id: orderId!,
        item_id: c.serviceItemId,
        variant_id: null,
        description: c.description,
        decoration_type: null,
        decoration_location: c.location || null,
        color: null,
        size: null,
        qty: c.qty,
        unit_price: c.unit_price,
        taxable: false,
        image_url: null,
        notes: null,
      }));

      const { error: iiErr } = await db.from('order_items').insert(itemRows);
      if (iiErr) throw iiErr;

      toast.success(editOrder ? 'Order updated' : 'Order created');
      qc.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const filteredCustomers = custSearch.trim()
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
        c.company?.toLowerCase().includes(custSearch.toLowerCase()) ||
        c.email?.toLowerCase().includes(custSearch.toLowerCase())
      )
    : customers;

  const selectedGroupForDisplay = search.trim()
    ? null
    : serviceGroups.find((g) => g.id === selectedGroupId) ?? null;

  const findGroupForItem = (item: ServiceItemWithTiers) =>
    serviceGroups.find((g) => g.items.some((i) => i.id === item.id)) ?? serviceGroups[0];

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 py-3.5 border-b shrink-0"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-5 w-5" style={{ color: 'hsl(218 91% 57%)' }} />
          <h1 className="font-bold text-lg font-heading">
            {editOrder ? `Edit ${editOrder.order_number}` : 'New Order'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editOrder ? 'Save Changes' : 'Create Order'}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 p-1.5 rounded-md hover:bg-[hsl(var(--accent))] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT PANEL (40%) ── */}
        <div
          className="flex flex-col w-[40%] border-r overflow-y-auto"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          {/* Customer Section */}
          <section className="px-5 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Customer</h3>
            <div className="flex gap-1.5 mb-3">
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
                  {mode === 'select' ? 'Existing Customer' : 'New Customer'}
                </button>
              ))}
            </div>

            {customerMode === 'select' ? (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <Input
                    className="pl-8 h-8 text-sm"
                    placeholder="Search customers…"
                    value={custSearch}
                    onChange={(e) => setCustSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border" style={{ borderColor: 'hsl(var(--border))' }}>
                  {filteredCustomers.length === 0 ? (
                    <p className="text-xs text-center py-4" style={{ color: 'hsl(var(--muted-foreground))' }}>No customers found</p>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[hsl(var(--accent))] transition-colors flex items-center gap-2 border-b last:border-b-0"
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
                  <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
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
                  <Label className="text-xs">Phone</Label>
                  <Input className="h-8 text-sm" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="(555) 000-0000" />
                </div>
              </div>
            )}
          </section>

          {/* Order Details Section */}
          <section className="px-5 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Order Details</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input className="h-8 text-sm" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reference / PO #</Label>
                <Input className="h-8 text-sm" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder="PO-1234" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Deposit Amount ($)</Label>
                <Input className="h-8 text-sm" type="number" min={0} step={0.01} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Artwork Image URL</Label>
                <Input className="h-8 text-sm" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Order Notes</Label>
                <Textarea className="text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" rows={3} />
              </div>
            </div>
          </section>

          {/* Pricing Section */}
          <section className="px-5 py-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>Pricing</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">Discount Type</Label>
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'percent' | 'flat')}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="flat">Flat ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Discount Value</Label>
                <Input className="h-8 text-sm" type="number" min={0} step={0.01} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="0" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Tax Rate (%)</Label>
                <Input className="h-8 text-sm" type="number" min={0} step={0.01} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0.00" />
              </div>
            </div>
          </section>

          {/* Order Summary (sticky bottom) */}
          <div className="mt-auto sticky bottom-0 bg-white border-t" style={{ borderColor: 'hsl(var(--border))' }}>
            <div
              className="mx-4 my-4 rounded-xl p-4 space-y-2 text-sm"
              style={{ backgroundColor: 'hsl(205 98% 13%)', color: 'white' }}
            >
              <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Order Summary</p>
              <div className="flex justify-between">
                <span className="opacity-70">Subtotal</span>
                <span className="font-medium">{formatCurrency(sub)}</span>
              </div>
              {disc > 0 && (
                <div className="flex justify-between">
                  <span className="opacity-70">Discount</span>
                  <span className="text-red-300">-{formatCurrency(disc)}</span>
                </div>
              )}
              {(parseFloat(taxRate) || 0) > 0 && (
                <div className="flex justify-between">
                  <span className="opacity-70">Tax ({taxRate}%)</span>
                  <span className="font-medium">{formatCurrency(tax)}</span>
                </div>
              )}
              {parseFloat(depositAmount) > 0 && (
                <div className="flex justify-between">
                  <span className="opacity-70">Deposit</span>
                  <span className="text-green-300">-{formatCurrency(parseFloat(depositAmount))}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 mt-1 border-t border-white/20">
                <span className="font-bold text-base">Total</span>
                <span className="font-bold text-xl">{formatCurrency(total)}</span>
              </div>
              <p className="text-xs opacity-50 text-center pt-1">{cart.length} item{cart.length !== 1 ? 's' : ''} in order</p>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL (60%) ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="px-5 pt-4 pb-3 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <Input
                className="pl-9"
                placeholder="Search services…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Group Pills */}
          {!search.trim() && (
            <div
              className="flex gap-2 px-5 py-3 border-b overflow-x-auto shrink-0"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              {serviceGroups.map((group) => {
                const isActive = selectedGroupId === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors shrink-0"
                    style={{
                      backgroundColor: isActive ? group.color : 'transparent',
                      borderColor: isActive ? group.color : 'hsl(var(--border))',
                      color: isActive ? 'white' : 'hsl(var(--foreground))',
                    }}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.7)' : group.color }}
                    />
                    {group.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {search.trim() && (
              <p className="text-xs mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} for "{search}"
              </p>
            )}
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Layers className="h-10 w-10 mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <p className="font-medium">{search ? 'No services match your search' : 'No services in this group'}</p>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {search ? 'Try a different search term.' : 'Add items to this group in the Services catalog.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => {
                  const group = search.trim() ? findGroupForItem(item) : selectedGroupForDisplay ?? serviceGroups[0];
                  const effectiveColor = item.color ?? group?.color ?? '#2E7CF6';
                  const effectiveIcon = item.icon ?? group?.icon ?? 'Package';
                  const isAdding = addingItemId === item.id;

                  const pricePreview = item.pricing_type === 'flat'
                    ? item.flat_price != null ? formatCurrency(item.flat_price) : '—'
                    : item.tiers.length
                      ? `from ${formatCurrency(Math.max(...item.tiers.map((t) => t.price_per_unit)))}`
                      : 'No pricing';

                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors hover:border-[hsl(218_91%_57%/0.4)] hover:bg-[hsl(218_91%_57%/0.03)]"
                        style={{ borderColor: isAdding ? effectiveColor + '60' : 'hsl(var(--border))' }}
                        onClick={() => setAddingItemId(isAdding ? null : item.id)}
                      >
                        <div
                          className="flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
                          style={{ backgroundColor: effectiveColor + '20' }}
                        >
                          <IconRenderer name={effectiveIcon} size={16} color={effectiveColor} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          {item.description && (
                            <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.description}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold" style={{ color: 'hsl(218 91% 57%)' }}>{pricePreview}</p>
                          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {item.pricing_type === 'moq' ? 'MOQ Tiered' : 'Flat Rate'}
                          </p>
                        </div>
                        <ChevronDown
                          className="h-4 w-4 shrink-0 transition-transform"
                          style={{
                            color: 'hsl(var(--muted-foreground))',
                            transform: isAdding ? 'rotate(180deg)' : 'rotate(0)',
                          }}
                        />
                      </button>

                      {isAdding && (
                        <AddItemForm
                          item={item}
                          groupColor={group?.color ?? '#2E7CF6'}
                          groupIcon={group?.icon ?? 'Package'}
                          onAdd={(entry) => {
                            setCart((prev) => [...prev, entry]);
                            setAddingItemId(null);
                            toast.success(`${item.name} added to order`);
                          }}
                          onCancel={() => setAddingItemId(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart */}
          {cart.length > 0 && (
            <div
              className="border-t shrink-0"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Order Items ({cart.length})
                </h3>
                <span className="text-sm font-semibold" style={{ color: 'hsl(218 91% 57%)' }}>
                  {formatCurrency(sub)}
                </span>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {cart.map((entry) => {
                  const effectiveColor = entry.color ?? '#2E7CF6';
                  const currentUnitPrice = entry.pricing_type === 'moq'
                    ? getPriceForQty(entry.tiers, entry.qty)
                    : entry.unit_price;

                  return (
                    <div
                      key={entry.tempId}
                      className="flex items-center gap-3 px-5 py-2.5 border-b last:border-b-0 hover:bg-[hsl(var(--accent))] transition-colors"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      <div
                        className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: effectiveColor + '20' }}
                      >
                        <IconRenderer name={entry.icon} size={13} color={effectiveColor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.name}</p>
                        {entry.location && (
                          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{entry.location}</p>
                        )}
                      </div>
                      {/* Qty input */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          type="number"
                          min={1}
                          className="h-6 w-14 text-xs text-center px-1"
                          value={entry.qty}
                          onChange={(e) => {
                            const newQty = parseInt(e.target.value) || 1;
                            const newPrice = entry.pricing_type === 'moq'
                              ? getPriceForQty(entry.tiers, newQty)
                              : entry.unit_price;
                            setCart((prev) =>
                              prev.map((c) =>
                                c.tempId === entry.tempId
                                  ? { ...c, qty: newQty, unit_price: newPrice }
                                  : c
                              )
                            );
                          }}
                        />
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>×</span>
                        <span className="text-xs font-medium w-16 text-right">{formatCurrency(currentUnitPrice)}</span>
                      </div>
                      <span className="text-sm font-semibold w-20 text-right shrink-0">
                        {formatCurrency(entry.qty * currentUnitPrice)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-500 hover:text-red-700 shrink-0"
                        onClick={() => setCart((prev) => prev.filter((c) => c.tempId !== entry.tempId))}
                        type="button"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
