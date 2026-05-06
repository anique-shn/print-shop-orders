'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Search, Plus, Trash2, ChevronDown, Package, ShoppingCart,
  Layers, Tag, Settings, Scissors, Ticket, Droplets, Shirt,
  Printer, Paintbrush, Palette, Wrench, Zap, Star, Circle,
  Hash, Box, Truck, Award, Grid3x3, Pen, Flame, Sparkles, Diamond,
  ChevronUp, Pencil,
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
  ServiceGroupWithItems, ServiceItemWithTiers, ServiceItemTier, Product,
} from '@/types/database';

// ── Icon Map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Layers, Tag, Settings, Package, Scissors, Ticket, Droplets, Shirt,
  Printer, Paintbrush, Palette, Wrench, Zap, Star, Circle,
  Hash, Box, Truck, Award, Grid3x3, Pen, Flame, Sparkles, Diamond,
};

function IconRenderer({ name, size = 16, color }: { name: string | null; size?: number; color?: string }) {
  if (!name) return <Package style={{ width: size, height: size, color: color ?? 'currentColor' }} />;
  const Comp = ICON_MAP[name] ?? Package;
  return <Comp style={{ width: size, height: size, color: color ?? 'currentColor' }} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectPrice(tiers: ServiceItemTier[], qty: number): number | null {
  const tier = tiers.find(
    (t) => qty >= t.min_qty && (t.max_qty === null || qty <= t.max_qty)
  );
  return tier?.price_per_unit ?? null;
}

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

// ── Line Item Types ───────────────────────────────────────────────────────────

interface ProductLineItem {
  tempId: string;
  lineType: 'product';
  productId: string | null;
  description: string;
  qty: number;
  unit_price: number;
  color: string;
  size: string;
  imageUrl: string;
  notes: string;
  taxable: boolean;
}

interface ServiceLineItem {
  tempId: string;
  lineType: 'service';
  parentTempId: string | null;
  serviceItemId: string;
  description: string;
  location: string;
  qty: number;
  unit_price: number;
  pricing_type: 'moq' | 'flat';
  tiers: ServiceItemTier[];
  icon: string | null;
  color: string | null;
  taxable: boolean;
}

interface FeeLineItem {
  tempId: string;
  lineType: 'fee';
  description: string;
  qty: number;
  unit_price: number;
  taxable: boolean;
}

type LineItem = ProductLineItem | ServiceLineItem | FeeLineItem;

type OrderWithItems = Order & { order_items?: OrderItem[] };

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

function useProducts() {
  return useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').order('sort_order');
      return (data ?? []) as Product[];
    },
  });
}

// ── Add Product Drawer ────────────────────────────────────────────────────────

interface AddProductDrawerProps {
  products: Product[];
  onAdd: (item: ProductLineItem) => void;
  onClose: () => void;
}

function AddProductDrawer({ products, onAdd, onClose }: AddProductDrawerProps) {
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const selectProduct = (p: Product) => {
    setSelectedProduct(p);
    setDescription(p.name);
    setUnitPrice(p.base_price ? String(p.base_price) : '');
    setImageUrl(p.image_url ?? '');
  };

  const handleAdd = () => {
    onAdd({
      tempId: genTempId(),
      lineType: 'product',
      productId: selectedProduct?.id ?? null,
      description: description || selectedProduct?.name || 'Product',
      qty,
      unit_price: parseFloat(unitPrice) || 0,
      color,
      size,
      imageUrl,
      notes,
      taxable: false,
    });
    onClose();
  };

  return (
    <div
      className="absolute top-0 right-0 h-full w-90 bg-white border-l flex flex-col z-10"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
        <h3 className="font-semibold text-sm">Add Product</h3>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Product list */}
        {!selectedProduct && (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
            {filtered.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: 'hsl(var(--muted-foreground))' }}>No products found</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2.5 border-b last:border-b-0"
                  style={{ borderColor: 'hsl(var(--border))' }}
                  onClick={() => selectProduct(p)}
                >
                  <div
                    className="h-8 w-8 rounded-md shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: 'hsl(var(--muted))' }}
                  >
                    {p.image_url
                      ? <img src={p.image_url} alt="" className="h-8 w-8 rounded-md object-cover" />
                      : <Package className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    {p.category && <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{p.category}</p>}
                  </div>
                  {p.base_price != null && (
                    <span className="text-xs font-semibold shrink-0" style={{ color: 'hsl(218 91% 57%)' }}>
                      {formatCurrency(p.base_price)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {/* Selected product form */}
        {selectedProduct && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: 'hsl(218 91% 57% / 0.3)', backgroundColor: 'hsl(218 91% 57% / 0.05)' }}>
              <Package className="h-4 w-4 shrink-0" style={{ color: 'hsl(218 91% 57%)' }} />
              <span className="text-sm font-medium truncate">{selectedProduct.name}</span>
              <button type="button" onClick={() => setSelectedProduct(null)} className="ml-auto shrink-0">
                <X className="h-3.5 w-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input className="h-8 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">How many pieces?</Label>
              <Input
                type="number" min={1} className="h-10 text-lg font-bold"
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Unit Price ($)</Label>
                <Input className="h-8 text-sm" type="number" min={0} step={0.01} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Color</Label>
                <Input className="h-8 text-sm" value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. Black" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Size</Label>
                <Input className="h-8 text-sm" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. L / XL" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Image URL</Label>
                <Input className="h-8 text-sm" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal notes…" />
            </div>

            {qty > 0 && (parseFloat(unitPrice) || 0) > 0 && (
              <div
                className="rounded-lg px-3 py-2 text-sm flex items-center justify-between"
                style={{ backgroundColor: 'hsl(218 91% 57% / 0.08)', color: 'hsl(218 91% 57%)' }}
              >
                <span>Line Total</span>
                <span className="font-bold">{formatCurrency(qty * (parseFloat(unitPrice) || 0))}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedProduct && (
        <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
          <Button className="w-full" onClick={handleAdd}>
            <Plus className="h-4 w-4" /> Add to Order
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Add Service / Fee Drawer ──────────────────────────────────────────────────

interface AddServiceDrawerProps {
  serviceGroups: ServiceGroupWithItems[];
  productLines: ProductLineItem[];
  onAdd: (item: ServiceLineItem | FeeLineItem) => void;
  onClose: () => void;
}

function AddServiceDrawer({ serviceGroups, productLines, onAdd, onClose }: AddServiceDrawerProps) {
  const [mode, setMode] = useState<'service' | 'fee'>('service');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(serviceGroups[0]?.id ?? '');
  const [selectedItem, setSelectedItem] = useState<ServiceItemWithTiers | null>(null);
  const [linkToTempId, setLinkToTempId] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');

  // Fee fields
  const [feeDescription, setFeeDescription] = useState('');
  const [feeQty, setFeeQty] = useState(1);
  const [feePrice, setFeePrice] = useState('');

  const activeGroup = serviceGroups.find((g) => g.id === selectedGroupId) ?? serviceGroups[0];

  const selectServiceItem = (item: ServiceItemWithTiers) => {
    setSelectedItem(item);
    setDescription(item.name);
    // Inherit qty from linked product
    if (linkToTempId) {
      const linked = productLines.find((p) => p.tempId === linkToTempId);
      if (linked) setQty(linked.qty);
    } else if (item.pricing_type === 'moq' && item.tiers.length) {
      setQty(Math.min(...item.tiers.map((t) => t.min_qty)));
    } else {
      setQty(1);
    }
  };

  const unitPrice = selectedItem
    ? selectedItem.pricing_type === 'flat'
      ? (selectedItem.flat_price ?? 0)
      : getPriceForQty(selectedItem.tiers, qty)
    : 0;

  const activeTier = selectedItem?.pricing_type === 'moq'
    ? [...(selectedItem?.tiers ?? [])].sort((a, b) => a.min_qty - b.min_qty).reduce<ServiceItemTier | null>((best, t) => {
        if (qty >= t.min_qty) return t;
        return best;
      }, null)
    : null;

  const detectedPrice = selectedItem?.pricing_type === 'moq'
    ? detectPrice(selectedItem.tiers, qty)
    : null;

  const handleAddService = () => {
    if (!selectedItem) return;
    onAdd({
      tempId: genTempId(),
      lineType: 'service',
      parentTempId: linkToTempId || null,
      serviceItemId: selectedItem.id,
      description,
      location,
      qty,
      unit_price: unitPrice,
      pricing_type: selectedItem.pricing_type,
      tiers: selectedItem.tiers,
      icon: selectedItem.icon ?? null,
      color: selectedItem.color ?? null,
      taxable: false,
    });
    onClose();
  };

  const handleAddFee = () => {
    if (!feeDescription.trim()) { toast.error('Fee description is required'); return; }
    onAdd({
      tempId: genTempId(),
      lineType: 'fee',
      description: feeDescription,
      qty: feeQty,
      unit_price: parseFloat(feePrice) || 0,
      taxable: false,
    });
    onClose();
  };

  return (
    <div
      className="absolute top-0 right-0 h-full w-95 bg-white border-l flex flex-col z-10"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-sm px-3 py-1 rounded-md font-medium transition-colors"
            style={{
              backgroundColor: mode === 'service' ? 'hsl(218 91% 57%)' : 'transparent',
              color: mode === 'service' ? 'white' : 'hsl(var(--foreground))',
            }}
            onClick={() => setMode('service')}
          >
            Service
          </button>
          <button
            type="button"
            className="text-sm px-3 py-1 rounded-md font-medium transition-colors"
            style={{
              backgroundColor: mode === 'fee' ? 'hsl(38 92% 50%)' : 'transparent',
              color: mode === 'fee' ? 'white' : 'hsl(var(--foreground))',
            }}
            onClick={() => setMode('fee')}
          >
            Fee
          </button>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {mode === 'service' && (
          <>
            {/* Link to product */}
            {productLines.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Link to product (optional)</Label>
                <Select value={linkToTempId} onValueChange={(v) => {
                  setLinkToTempId(v);
                  if (v) {
                    const linked = productLines.find((p) => p.tempId === v);
                    if (linked && selectedItem) setQty(linked.qty);
                  }
                }}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="None (standalone)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (standalone)</SelectItem>
                    {productLines.map((p) => (
                      <SelectItem key={p.tempId} value={p.tempId}>
                        {p.description} × {p.qty.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Group tabs */}
            <div className="flex gap-1.5 flex-wrap">
              {serviceGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="text-xs px-2.5 py-1 rounded-full border font-medium transition-colors"
                  style={{
                    backgroundColor: selectedGroupId === g.id ? g.color : 'transparent',
                    borderColor: selectedGroupId === g.id ? g.color : 'hsl(var(--border))',
                    color: selectedGroupId === g.id ? 'white' : 'hsl(var(--foreground))',
                  }}
                  onClick={() => { setSelectedGroupId(g.id); setSelectedItem(null); }}
                >
                  {g.name}
                </button>
              ))}
            </div>

            {/* Items list */}
            {!selectedItem && (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                {(activeGroup?.items ?? []).length === 0 ? (
                  <p className="text-xs text-center py-6" style={{ color: 'hsl(var(--muted-foreground))' }}>No items in this group</p>
                ) : (
                  (activeGroup?.items ?? []).map((item) => {
                    const effColor = item.color ?? activeGroup?.color ?? '#2E7CF6';
                    const priceLabel = item.pricing_type === 'flat'
                      ? (item.flat_price != null ? formatCurrency(item.flat_price) : '—')
                      : item.tiers.length
                        ? `from ${formatCurrency(Math.min(...item.tiers.map((t) => t.price_per_unit)))}`
                        : 'No pricing';

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-accent transition-colors border-b last:border-b-0"
                        style={{ borderColor: 'hsl(var(--border))' }}
                        onClick={() => selectServiceItem(item)}
                      >
                        <div
                          className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${effColor}20` }}
                        >
                          <IconRenderer name={item.icon ?? activeGroup?.icon ?? null} size={14} color={effColor} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {item.pricing_type === 'moq' ? 'MOQ' : 'Flat'} · {priceLabel}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* Selected item config */}
            {selectedItem && (
              <div className="space-y-3">
                <div
                  className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer"
                  style={{ borderColor: 'hsl(218 91% 57% / 0.3)', backgroundColor: 'hsl(218 91% 57% / 0.05)' }}
                  onClick={() => setSelectedItem(null)}
                >
                  <IconRenderer
                    name={selectedItem.icon ?? activeGroup?.icon ?? null}
                    size={14}
                    color={selectedItem.color ?? activeGroup?.color ?? '#2E7CF6'}
                  />
                  <span className="text-sm font-medium truncate flex-1">{selectedItem.name}</span>
                  <X className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Quantity</Label>
                  <Input
                    type="number"
                    min={selectedItem.pricing_type === 'moq' && selectedItem.tiers.length ? Math.min(...selectedItem.tiers.map((t) => t.min_qty)) : 1}
                    className="h-10 text-lg font-bold"
                    value={qty}
                    onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                  />
                </div>

                {/* Price display */}
                {selectedItem.pricing_type === 'moq' ? (
                  <div
                    className="rounded-lg px-3 py-2.5 text-sm"
                    style={{
                      backgroundColor: detectedPrice !== null ? 'hsl(218 91% 57% / 0.08)' : 'hsl(var(--muted))',
                      color: detectedPrice !== null ? 'hsl(218 91% 57%)' : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {detectedPrice !== null ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span>Price</span>
                          <span className="font-bold text-base">{formatCurrency(detectedPrice)}/unit</span>
                        </div>
                        {activeTier && (
                          <div className="text-xs mt-1 opacity-70">
                            Tier: {activeTier.min_qty.toLocaleString()}
                            {activeTier.max_qty ? `–${activeTier.max_qty.toLocaleString()}` : '+'} units
                          </div>
                        )}
                      </>
                    ) : (
                      <span>Qty below minimum tier</span>
                    )}
                  </div>
                ) : (
                  <div
                    className="rounded-lg px-3 py-2.5 text-sm flex items-center justify-between"
                    style={{ backgroundColor: 'hsl(218 91% 57% / 0.08)', color: 'hsl(218 91% 57%)' }}
                  >
                    <span>Flat Rate</span>
                    <span className="font-bold">{selectedItem.flat_price != null ? formatCurrency(selectedItem.flat_price) : '—'}/unit</span>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input className="h-8 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Location</Label>
                  <Input className="h-8 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Left Chest" />
                </div>

                <div className="flex items-center justify-between text-sm font-medium pt-1">
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>Line Total</span>
                  <span className="font-bold">{formatCurrency(unitPrice * qty)}</span>
                </div>
              </div>
            )}
          </>
        )}

        {mode === 'fee' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Fee Description <span className="text-red-500">*</span></Label>
              <Input className="h-9" value={feeDescription} onChange={(e) => setFeeDescription(e.target.value)} placeholder="e.g. Screen Setup × 4 colors" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Quantity</Label>
                <Input type="number" min={1} className="h-8 text-sm" value={feeQty} onChange={(e) => setFeeQty(parseInt(e.target.value) || 1)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price Each ($)</Label>
                <Input type="number" min={0} step={0.01} className="h-8 text-sm" value={feePrice} onChange={(e) => setFeePrice(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            {feeQty > 0 && (parseFloat(feePrice) || 0) > 0 && (
              <div
                className="rounded-lg px-3 py-2 text-sm flex items-center justify-between"
                style={{ backgroundColor: 'hsl(38 92% 50% / 0.08)', color: 'hsl(38 92% 35%)' }}
              >
                <span>Total</span>
                <span className="font-bold">{formatCurrency(feeQty * (parseFloat(feePrice) || 0))}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
        {mode === 'service' ? (
          <Button className="w-full" onClick={handleAddService} disabled={!selectedItem}>
            <Plus className="h-4 w-4" /> Add Service
          </Button>
        ) : (
          <Button
            className="w-full"
            style={{ backgroundColor: 'hsl(38 92% 50%)' }}
            onClick={handleAddFee}
          >
            <Plus className="h-4 w-4" /> Add Fee
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Order Canvas ──────────────────────────────────────────────────────────────

interface OrderCanvasProps {
  items: LineItem[];
  serviceGroups: ServiceGroupWithItems[];
  onRemove: (tempId: string) => void;
  onUpdateQty: (tempId: string, qty: number) => void;
}

function OrderCanvas({ items, serviceGroups, onRemove, onUpdateQty }: OrderCanvasProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-20 text-center">
        <ShoppingCart className="h-12 w-12 mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
        <p className="font-semibold text-base">Start by adding a product or service</p>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Use the buttons above to build your order.
        </p>
      </div>
    );
  }

  const productItems = items.filter((i): i is ProductLineItem => i.lineType === 'product');
  const standaloneServices = items.filter(
    (i): i is ServiceLineItem => i.lineType === 'service' && !i.parentTempId
  );
  const feeItems = items.filter((i): i is FeeLineItem => i.lineType === 'fee');

  const renderServiceOrFee = (item: ServiceLineItem | FeeLineItem, indent = false) => {
    const isService = item.lineType === 'service';
    const svcItem = isService ? item as ServiceLineItem : null;
    const group = svcItem
      ? serviceGroups.find((g) => g.items.some((i) => i.id === svcItem.serviceItemId))
      : null;
    const effColor = svcItem?.color ?? group?.color ?? '#2E7CF6';
    const feeColor = '#F59E0B';

    const currentUnitPrice = isService && svcItem
      ? (svcItem.pricing_type === 'moq' ? getPriceForQty(svcItem.tiers, svcItem.qty) : svcItem.unit_price)
      : (item as FeeLineItem).unit_price;

    return (
      <div
        key={item.tempId}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm ${indent ? 'ml-6' : ''}`}
        style={{
          borderColor: isService ? `${effColor}30` : `${feeColor}40`,
          backgroundColor: isService ? `${effColor}06` : `${feeColor}06`,
        }}
      >
        <div
          className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: isService ? `${effColor}20` : `${feeColor}20` }}
        >
          {isService && svcItem ? (
            <IconRenderer name={svcItem.icon ?? group?.icon ?? null} size={13} color={effColor} />
          ) : (
            <Wrench className="h-3.5 w-3.5" style={{ color: feeColor }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-xs">{item.description}</p>
          {isService && svcItem?.location && (
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{svcItem.location}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Input
            type="number"
            min={1}
            className="h-6 w-14 text-xs text-center px-1"
            value={item.qty}
            onChange={(e) => onUpdateQty(item.tempId, parseInt(e.target.value) || 1)}
          />
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>×</span>
          <span className="text-xs font-medium w-14 text-right">{formatCurrency(currentUnitPrice)}</span>
        </div>
        <span className="text-xs font-bold w-16 text-right shrink-0">
          {formatCurrency(item.qty * currentUnitPrice)}
        </span>
        <Button
          variant="ghost" size="icon" className="h-5 w-5 text-red-400 hover:text-red-600 shrink-0"
          onClick={() => onRemove(item.tempId)}
          type="button"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {productItems.map((product) => {
        const children = items.filter(
          (i): i is ServiceLineItem => i.lineType === 'service' && i.parentTempId === product.tempId
        );
        return (
          <div key={product.tempId} className="space-y-1.5">
            {/* Product row */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-white"
              style={{ borderLeft: '3px solid hsl(218 91% 57%)', borderColor: 'hsl(var(--border))', borderLeftColor: 'hsl(218 91% 57%)' }}
            >
              <div
                className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'hsl(218 91% 57% / 0.1)' }}
              >
                <Package className="h-4 w-4" style={{ color: 'hsl(218 91% 57%)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{product.description}</p>
                {(product.color || product.size) && (
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {[product.color, product.size].filter(Boolean).join(' / ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Input
                  type="number"
                  min={1}
                  className="h-7 w-16 text-sm text-center px-1"
                  value={product.qty}
                  onChange={(e) => onUpdateQty(product.tempId, parseInt(e.target.value) || 1)}
                />
                <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>×</span>
                <span className="text-sm font-medium w-16 text-right">{formatCurrency(product.unit_price)}</span>
              </div>
              <span className="text-sm font-bold w-18 text-right shrink-0">
                {formatCurrency(product.qty * product.unit_price)}
              </span>
              <Button
                variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600 shrink-0"
                onClick={() => onRemove(product.tempId)}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Child services */}
            {children.map((child) => renderServiceOrFee(child, true))}
          </div>
        );
      })}

      {/* Standalone services */}
      {standaloneServices.map((item) => renderServiceOrFee(item, false))}

      {/* Fees */}
      {feeItems.map((item) => renderServiceOrFee(item, false))}
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
  const { data: products = [] } = useProducts();

  const orderNumber = useMemo(() => editOrder?.order_number ?? generateOrderNumber(), [editOrder]);

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
  const [depositAmount, setDepositAmount] = useState('');

  // Pricing (collapsible)
  const [pricingOpen, setPricingOpen] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [taxRate, setTaxRate] = useState('');

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Right-panel drawers
  const [drawer, setDrawer] = useState<'product' | 'service' | null>(null);

  const [saving, setSaving] = useState(false);

  const productLines = lineItems.filter((i): i is ProductLineItem => i.lineType === 'product');

  // Reset on open
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
      setDepositAmount(String(editOrder.deposit_amount ?? ''));
      setDiscountType(editOrder.discount_type ?? 'percent');
      setDiscountValue(String(editOrder.discount_value ?? ''));
      setTaxRate(String(editOrder.tax_rate ?? ''));
      setLineItems(
        (editOrder.order_items ?? []).map((oi) => ({
          tempId: genTempId(),
          lineType: 'service' as const,
          parentTempId: null,
          serviceItemId: oi.item_id ?? '',
          description: oi.description,
          location: oi.decoration_location ?? '',
          qty: oi.qty,
          unit_price: oi.unit_price,
          pricing_type: 'flat' as const,
          tiers: [],
          icon: null,
          color: null,
          taxable: oi.taxable,
        }))
      );
    } else {
      setCustomerMode('select');
      setSelectedCustomerId('');
      setCustName(''); setCustEmail(''); setCustPhone(''); setCustCompany('');
      setDueDate(''); setNotes(''); setRefNumber('');
      setDepositAmount(''); setDiscountType('percent'); setDiscountValue(''); setTaxRate('');
      setLineItems([]);
      setDrawer(null);
    }
  }, [open, editOrder]);

  // Totals
  const allLineAmounts = lineItems.map((item) => {
    if (item.lineType === 'service' && item.pricing_type === 'moq') {
      return { qty: item.qty, unit_price: getPriceForQty(item.tiers, item.qty) };
    }
    return { qty: item.qty, unit_price: item.unit_price };
  });
  const sub = calcSubtotal(allLineAmounts);
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

  const filteredCustomers = custSearch.trim()
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
        c.company?.toLowerCase().includes(custSearch.toLowerCase())
      )
    : customers;

  const addLineItem = (item: LineItem) => {
    setLineItems((prev) => [...prev, item]);
    toast.success(`${item.description} added`);
  };

  const removeLineItem = (tempId: string) => {
    setLineItems((prev) => prev.filter((i) => i.tempId !== tempId && (i.lineType !== 'service' || i.parentTempId !== tempId)));
  };

  const updateQty = (tempId: string, qty: number) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId) return item;
        if (item.lineType === 'service' && item.pricing_type === 'moq') {
          return { ...item, qty, unit_price: getPriceForQty(item.tiers, qty) };
        }
        return { ...item, qty };
      })
    );
  };

  const save = async () => {
    const cust = resolveCustomer();
    if (!cust.customer_name && !cust.customer_id) {
      toast.error('Customer name is required'); return;
    }
    if (lineItems.length === 0) {
      toast.error('Add at least one item to the order'); return;
    }
    setSaving(true);
    try {
      const orderData = {
        ...cust,
        order_number: orderNumber,
        status: editOrder?.status ?? 'new' as const,
        due_date: dueDate || null,
        notes: notes || null,
        image_url: null,
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

      // Insert product rows first to get their IDs for parent references
      const tempIdToDbId: Record<string, string> = {};

      const productLineItems = lineItems.filter((i) => i.lineType === 'product');
      for (const item of productLineItems) {
        const productItem = item as ProductLineItem;
        const { data, error } = await db.from('order_items').insert({
          order_id: orderId!,
          line_type: 'product',
          product_id: productItem.productId,
          service_item_id: null,
          parent_order_item_id: null,
          description: productItem.description,
          qty: productItem.qty,
          unit_price: productItem.unit_price,
          taxable: productItem.taxable,
          decoration_type: null,
          decoration_location: null,
          color: productItem.color || null,
          size: productItem.size || null,
          image_url: productItem.imageUrl || null,
          notes: productItem.notes || null,
        }).select('id').single();
        if (error) throw error;
        tempIdToDbId[item.tempId] = data.id;
      }

      // Insert service and fee rows
      const serviceAndFeeItems = lineItems.filter((i) => i.lineType !== 'product');
      for (const item of serviceAndFeeItems) {
        if (item.lineType === 'service') {
          const svcItem = item as ServiceLineItem;
          const parentDbId = svcItem.parentTempId ? (tempIdToDbId[svcItem.parentTempId] ?? null) : null;
          const { error } = await db.from('order_items').insert({
            order_id: orderId!,
            line_type: 'service',
            product_id: null,
            service_item_id: svcItem.serviceItemId,
            parent_order_item_id: parentDbId,
            description: svcItem.description,
            qty: svcItem.qty,
            unit_price: svcItem.pricing_type === 'moq' ? getPriceForQty(svcItem.tiers, svcItem.qty) : svcItem.unit_price,
            taxable: svcItem.taxable,
            decoration_type: null,
            decoration_location: svcItem.location || null,
            color: null,
            size: null,
            image_url: null,
            notes: null,
          });
          if (error) throw error;
        } else if (item.lineType === 'fee') {
          const feeItem = item as FeeLineItem;
          const { error } = await db.from('order_items').insert({
            order_id: orderId!,
            line_type: 'fee',
            product_id: null,
            service_item_id: null,
            parent_order_item_id: null,
            description: feeItem.description,
            qty: feeItem.qty,
            unit_price: feeItem.unit_price,
            taxable: feeItem.taxable,
            decoration_type: null,
            decoration_location: null,
            color: null,
            size: null,
            image_url: null,
            notes: null,
          });
          if (error) throw error;
        }
      }

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

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-6 shrink-0 border-b"
        style={{ height: 56, borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-5 w-5" style={{ color: 'hsl(218 91% 57%)' }} />
          <h1 className="font-bold text-lg font-heading">
            {editOrder ? `Edit Order` : 'New Order'}
          </h1>
          <span
            className="font-mono text-sm px-2 py-0.5 rounded"
            style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
          >
            {orderNumber}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} style={{ backgroundColor: 'hsl(218 91% 57%)' }}>
            {saving ? 'Saving…' : editOrder ? 'Save Changes' : 'Create Order'}
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
        {/* ── LEFT PANEL (420px) ── */}
        <div
          className="flex flex-col shrink-0 border-r overflow-y-auto"
          style={{ width: 420, borderColor: 'hsl(var(--border))' }}
        >
          {/* Section 1 — Customer */}
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
                  {mode === 'select' ? 'Existing ▼' : 'New +'}
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
                <div className="max-h-44 overflow-y-auto rounded-md border" style={{ borderColor: 'hsl(var(--border))' }}>
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

          {/* Section 2 — Order Details */}
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
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea className="text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" rows={3} />
              </div>
            </div>
          </section>

          {/* Section 3 — Pricing (collapsible) */}
          <section className="border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <button
              type="button"
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-accent transition-colors"
              onClick={() => setPricingOpen(!pricingOpen)}
            >
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Pricing</h3>
              {pricingOpen ? <ChevronUp className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />}
            </button>
            {pricingOpen && (
              <div className="px-5 pb-4 space-y-3">
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
            )}
          </section>

          {/* Section 4 — Summary (sticky bottom) */}
          <div className="mt-auto sticky bottom-0 bg-white border-t" style={{ borderColor: 'hsl(var(--border))' }}>
            <div
              className="mx-4 my-4 rounded-xl p-4 space-y-2 text-sm"
              style={{ backgroundColor: 'hsl(205 98% 13%)', color: 'white' }}
            >
              <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">
                Order Summary · {lineItems.length} item{lineItems.length !== 1 ? 's' : ''}
              </p>
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
                  <span>{formatCurrency(tax)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 mt-1 border-t border-white/20">
                <span className="font-bold text-base">Total</span>
                <span className="font-bold text-xl">{formatCurrency(total)}</span>
              </div>
              {/* Deposit */}
              <div className="pt-2 border-t border-white/10">
                <Label className="text-xs opacity-60 mb-1 block">Deposit Amount ($)</Label>
                <Input
                  type="number" min={0} step={0.01}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-8 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/30"
                />
                {parseFloat(depositAmount) > 0 && (
                  <div className="flex justify-between text-xs mt-1.5 opacity-70">
                    <span>Balance due</span>
                    <span>{formatCurrency(Math.max(0, total - (parseFloat(depositAmount) || 0)))}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL (flex-1) ── */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Action buttons */}
          <div className="flex items-center gap-3 px-6 py-3.5 border-b shrink-0" style={{ borderColor: 'hsl(var(--border))' }}>
            <Button
              size="sm"
              onClick={() => setDrawer(drawer === 'product' ? null : 'product')}
              style={{ backgroundColor: 'hsl(218 91% 57%)' }}
            >
              <Package className="h-3.5 w-3.5" /> Add Product
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDrawer(drawer === 'service' ? null : 'service')}
            >
              <Plus className="h-3.5 w-3.5" /> Add Service / Fee
            </Button>
            {drawer && (
              <button
                type="button"
                className="ml-auto text-xs px-2 py-1 rounded border"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                onClick={() => setDrawer(null)}
              >
                <X className="h-3 w-3 inline mr-1" />Close panel
              </button>
            )}
          </div>

          {/* Order canvas */}
          <div className={`flex-1 overflow-y-auto px-6 py-4 transition-all ${drawer ? 'mr-90' : ''}`}>
            <OrderCanvas
              items={lineItems}
              serviceGroups={serviceGroups}
              onRemove={removeLineItem}
              onUpdateQty={updateQty}
            />
          </div>

          {/* Slide-in drawers */}
          {drawer === 'product' && (
            <AddProductDrawer
              products={products}
              onAdd={(item) => { addLineItem(item); setDrawer(null); }}
              onClose={() => setDrawer(null)}
            />
          )}
          {drawer === 'service' && (
            <AddServiceDrawer
              serviceGroups={serviceGroups}
              productLines={productLines}
              onAdd={(item) => { addLineItem(item); setDrawer(null); }}
              onClose={() => setDrawer(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
