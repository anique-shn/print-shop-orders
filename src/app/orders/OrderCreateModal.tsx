'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Plus, Trash2, Search, ChevronDown, ChevronUp,
  Shirt, Pencil, Check, AlertCircle,
  Printer, Scissors, Zap, Paintbrush, Tag, Star, Layers, Circle, Stamp, Brush,
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
  Garment, FinishingService, DecorationGroup, DecorationMatrixRow,
} from '@/types/database';

// ── Constants ─────────────────────────────────────────────────────────────────

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

const DECORATION_LOCATIONS = [
  'Front', 'Back', 'Left Chest', 'Right Chest', 'Left Sleeve',
  'Right Sleeve', 'Center Chest', 'Hood', 'Custom',
];

const SETUP_FEE_PRESETS = [
  { label: 'Screen Charges', unit: 'per screen' },
  { label: 'Digitizing Fee', unit: 'per logo' },
  { label: 'Rush Fee', unit: 'flat' },
  { label: 'Art / Separation Fee', unit: 'flat' },
];

const ICON_MAP: Record<string, React.ElementType> = {
  Printer, Scissors, Zap, Paintbrush, Tag, Star, Layers, Circle, Stamp, Brush, Shirt,
};

// ── Line Item Types ────────────────────────────────────────────────────────────

interface DecorationItem {
  tempId: string;
  groupId: string;
  groupName: string;
  groupColLabels: string[];
  colIndex: number;   // 0-based column index in the group matrix
  location: string;
  unitPrice: number;
}

interface FinishingItem {
  tempId: string;
  serviceId: string | null;
  serviceName: string;
  unitPrice: number;
}

interface GarmentLine {
  tempId: string;
  garmentId: string | null;
  description: string;
  brand: string;
  styleNumber: string;
  color: string;
  sizes: Record<string, number>;
  blankCost: number;
  markupPct: number;
  decorations: DecorationItem[];
  finishing: FinishingItem[];
  priceOverridden: boolean;
  overriddenPrice: number;
  overrideReason: string;
  notes: string;
  sizeUnitPrices: Record<string, number>; // per-size complete sell price overrides
}

interface SetupFeeItem {
  tempId: string;
  description: string;
  qty: number;
  unitPrice: number;
}

type OrderWithItems = Order & { order_items?: (OrderItem & { order_item_decorations?: import('@/types/database').OrderItemDecoration[]; order_item_finishing?: import('@/types/database').OrderItemFinishing[] })[] };

// ── Pricing Helpers ───────────────────────────────────────────────────────────

function lookupDecorationPrice(
  matrix: DecorationMatrixRow[],
  groupId: string,
  qty: number,
  colIndex: number,
): number {
  const groupRows = matrix.filter((r) => r.group_id === groupId);
  const row = groupRows.find((r) => qty >= r.qty_min && (r.qty_max == null || qty <= r.qty_max));
  if (!row) return 0;
  return (row.prices[colIndex] as number) ?? 0;
}

function totalQty(sizes: Record<string, number>): number {
  return Object.values(sizes).reduce((s, n) => s + (n || 0), 0);
}

function blankPricePerPiece(blankCost: number, markupPct: number): number {
  return blankCost * (1 + markupPct);
}

function effectiveUnitPrice(line: GarmentLine): number {
  if (line.priceOverridden) return line.overriddenPrice;
  const blank = blankPricePerPiece(line.blankCost, line.markupPct);
  const deco = line.decorations.reduce((s, d) => s + d.unitPrice, 0);
  const finish = line.finishing.reduce((s, f) => s + f.unitPrice, 0);
  return blank + deco + finish;
}

function genTempId() {
  return `tmp_${Math.random().toString(36).slice(2)}`;
}

function emptyGarmentLine(): GarmentLine {
  return {
    tempId: genTempId(),
    garmentId: null,
    description: '',
    brand: '',
    styleNumber: '',
    color: '',
    sizes: { XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0, '4XL': 0, '5XL': 0 },
    blankCost: 0,
    markupPct: 0.40,
    decorations: [],
    finishing: [],
    priceOverridden: false,
    overriddenPrice: 0,
    overrideReason: '',
    notes: '',
    sizeUnitPrices: {},
  };
}

// Returns the effective sell price for a specific size (uses per-size override if set)
function effectiveUnitPriceForSize(line: GarmentLine, size: string): number {
  const override = line.sizeUnitPrices[size];
  if (override !== undefined && override > 0) return override;
  return effectiveUnitPrice(line);
}

// Groups active sizes by their effective price for invoice line splitting
function groupSizesByPrice(line: GarmentLine): { price: number; sizes: string[]; qty: number; sizeMatrix: Record<string, number> }[] {
  const allSizes = [...new Set([...STANDARD_SIZES, ...Object.keys(line.sizeUnitPrices)])];
  const groups = new Map<number, { sizes: string[]; qty: number; sizeMatrix: Record<string, number> }>();
  for (const size of allSizes) {
    const qty = line.sizes[size] || 0;
    if (!qty) continue;
    const price = Math.round(effectiveUnitPriceForSize(line, size) * 100) / 100;
    if (!groups.has(price)) groups.set(price, { sizes: [], qty: 0, sizeMatrix: {} });
    const g = groups.get(price)!;
    g.sizes.push(size);
    g.qty += qty;
    g.sizeMatrix[size] = qty;
  }
  return Array.from(groups.entries()).map(([price, data]) => ({ price, ...data }));
}

// Total revenue for a garment line, accounting for per-size pricing
function garmentLineSubtotal(line: GarmentLine): number {
  if (Object.keys(line.sizeUnitPrices).length === 0) {
    return totalQty(line.sizes) * effectiveUnitPrice(line);
  }
  const allSizes = [...new Set([...STANDARD_SIZES, ...Object.keys(line.sizeUnitPrices)])];
  return allSizes.reduce((sum, size) => {
    const qty = line.sizes[size] || 0;
    if (!qty) return sum;
    return sum + qty * effectiveUnitPriceForSize(line, size);
  }, 0);
}

// Per-group decoration pricing helpers
function decoUnitPriceForQty(d: DecorationItem, decoMatrix: DecorationMatrixRow[], qty: number): number {
  if (!d.groupId || qty <= 0) return d.unitPrice;
  const p = lookupDecorationPrice(decoMatrix, d.groupId, qty, d.colIndex);
  return p > 0 ? p : d.unitPrice;
}

interface GroupBreakdown {
  price: number;
  sizes: string[];
  qty: number;
  sizeMatrix: Record<string, number>;
  decoPerPc: number;
  finishPerPc: number;
  totalPerPc: number;
  groupTotal: number;
}

function computeLineBreakdown(
  line: GarmentLine,
  decoMatrix: DecorationMatrixRow[],
): { groups: GroupBreakdown[]; total: number; hasSizeOverrides: boolean } {
  const hasSizeOverrides = Object.keys(line.sizeUnitPrices).length > 0;
  const finishPerPc = line.finishing.reduce((s, f) => s + f.unitPrice, 0);

  if (hasSizeOverrides) {
    const groups = groupSizesByPrice(line);
    const detailed: GroupBreakdown[] = groups.map((g) => {
      const decoPerPc = line.decorations.reduce((s, d) => s + decoUnitPriceForQty(d, decoMatrix, g.qty), 0);
      const totalPerPc = g.price + decoPerPc + finishPerPc;
      return { ...g, decoPerPc, finishPerPc, totalPerPc, groupTotal: g.qty * totalPerPc };
    });
    return { groups: detailed, total: detailed.reduce((s, g) => s + g.groupTotal, 0), hasSizeOverrides: true };
  } else {
    const qty = totalQty(line.sizes);
    const unitPrice = effectiveUnitPrice(line);
    const activeSizes = Object.entries(line.sizes).filter(([, v]) => v > 0).map(([s]) => s);
    const group: GroupBreakdown = {
      price: unitPrice, sizes: activeSizes, qty,
      sizeMatrix: line.sizes, decoPerPc: 0, finishPerPc: 0,
      totalPerPc: unitPrice, groupTotal: qty * unitPrice,
    };
    return { groups: qty > 0 ? [group] : [], total: qty * unitPrice, hasSizeOverrides: false };
  }
}

// ── Data Hooks ────────────────────────────────────────────────────────────────

function useGarments() {
  return useQuery<Garment[]>({
    queryKey: ['garments'],
    queryFn: async () => {
      const { data } = await supabase
        .from('garments')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      return (data ?? []) as Garment[];
    },
  });
}

function useDecorationGroups() {
  return useQuery<DecorationGroup[]>({
    queryKey: ['decoration_groups'],
    queryFn: async () => {
      const { data } = await supabase
        .from('decoration_groups')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      return (data ?? []) as DecorationGroup[];
    },
  });
}

function useDecorationMatrix() {
  return useQuery<DecorationMatrixRow[]>({
    queryKey: ['decoration_matrix'],
    queryFn: async () => {
      const { data } = await supabase
        .from('decoration_matrix')
        .select('*')
        .order('qty_min');
      return (data ?? []) as DecorationMatrixRow[];
    },
  });
}

function useFinishingServices() {
  return useQuery<FinishingService[]>({
    queryKey: ['finishing_services'],
    queryFn: async () => {
      const { data } = await supabase
        .from('finishing_services')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      return (data ?? []) as FinishingService[];
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

// ── Garment Catalog Picker ────────────────────────────────────────────────────

function GarmentCatalogPicker({
  garments,
  onSelect,
  onClose,
}: {
  garments: Garment[];
  onSelect: (g: Garment) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return garments;
    const q = search.toLowerCase();
    return garments.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.brand.toLowerCase().includes(q) ||
        g.color?.toLowerCase().includes(q) ||
        g.style_number?.toLowerCase().includes(q),
    );
  }, [garments, search]);

  const grouped = useMemo(() => {
    const map: Record<string, Garment[]> = {};
    filtered.forEach((g) => {
      const cat = g.category ?? 'Other';
      (map[cat] = map[cat] ?? []).push(g);
    });
    return map;
  }, [filtered]);

  return (
    <div
      className="border rounded-xl overflow-hidden shadow-lg"
      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
        <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
        <input
          autoFocus
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Search garments…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={onClose} className="p-0.5 rounded hover:bg-accent">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <p className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))', backgroundColor: 'hsl(var(--muted)/0.4)' }}>
              {cat}
            </p>
            {items.map((g) => (
              <button
                key={g.id}
                type="button"
                className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-accent transition-colors border-b last:border-b-0"
                style={{ borderColor: 'hsl(var(--border))' }}
                onClick={() => onSelect(g)}
              >
                <div
                  className="h-7 w-7 rounded-md shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: 'hsl(218 91% 57% / 0.1)' }}
                >
                  <Shirt className="h-3.5 w-3.5" style={{ color: 'hsl(218 91% 57%)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{g.name}</p>
                  <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {[g.color, g.style_number].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {(() => {
                  const prices = Object.values(g.size_upcharges as Record<string, number> ?? {}).filter(v => v > 0);
                  const mn = prices.length ? Math.min(...prices) : 0;
                  const mx = prices.length ? Math.max(...prices) : 0;
                  return (
                    <span className="text-xs font-semibold shrink-0" style={{ color: 'hsl(218 91% 57%)' }}>
                      {prices.length > 0 ? `$${mn.toFixed(0)}${mx !== mn ? `–$${mx.toFixed(0)}` : ''}/pc` : 'No price set'}
                    </span>
                  );
                })()}
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
            No garments found
          </p>
        )}
        <button
          type="button"
          className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-accent border-t font-medium"
          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(218 91% 57%)' }}
          onClick={() => onClose()}
        >
          <Plus className="h-3.5 w-3.5" /> Enter manually
        </button>
      </div>
    </div>
  );
}

// ── Decoration Add Form ───────────────────────────────────────────────────────

function DecorationAddForm({
  totalQtyVal,
  decoGroups,
  decoMatrix,
  onAdd,
  onCancel,
}: {
  totalQtyVal: number;
  decoGroups: DecorationGroup[];
  decoMatrix: DecorationMatrixRow[];
  onAdd: (d: DecorationItem) => void;
  onCancel: () => void;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState(decoGroups[0]?.id ?? '');
  const [location, setLocation] = useState('Front');
  const [customLocation, setCustomLocation] = useState('');
  const [colIndex, setColIndex] = useState(0);
  const [price, setPrice] = useState(0);
  const [priceManual, setPriceManual] = useState(false);

  const selectedGroup = decoGroups.find((g) => g.id === selectedGroupId);

  // Reset colIndex when group changes
  useEffect(() => {
    setColIndex(0);
    setPriceManual(false);
  }, [selectedGroupId]);

  // When qty is known, look up the exact tier. When qty=0, fall back to the
  // first (lowest) tier so the user sees a real price from the matrix immediately.
  const autoPrice = useMemo(() => {
    if (!selectedGroupId) return 0;
    const lookupQty = totalQtyVal > 0
      ? totalQtyVal
      : decoMatrix
          .filter((r) => r.group_id === selectedGroupId)
          .sort((a, b) => a.qty_min - b.qty_min)[0]?.qty_min ?? 0;
    if (lookupQty <= 0) return 0;
    return lookupDecorationPrice(decoMatrix, selectedGroupId, lookupQty, colIndex);
  }, [selectedGroupId, totalQtyVal, colIndex, decoMatrix]);

  const autoPriceIsPreview = totalQtyVal === 0 && autoPrice > 0;

  useEffect(() => {
    if (!priceManual) setPrice(autoPrice);
  }, [autoPrice, priceManual]);

  const finalLocation = location === 'Custom' ? customLocation : location;

  const handleAdd = () => {
    if (!selectedGroup) { toast.error('Select a decoration type'); return; }
    if (!finalLocation) { toast.error('Enter a location'); return; }
    onAdd({
      tempId: genTempId(),
      groupId: selectedGroup.id,
      groupName: selectedGroup.name,
      groupColLabels: selectedGroup.col_labels,
      colIndex,
      location: finalLocation,
      unitPrice: price,
    });
  };

  if (decoGroups.length === 0) {
    return (
      <div
        className="rounded-lg border p-4 text-center text-sm"
        style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
      >
        <AlertCircle className="h-4 w-4 mx-auto mb-1.5" />
        No decoration types found. Add them in Catalog → Decorations.
        <div className="mt-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border p-3 space-y-3"
      style={{ borderColor: 'hsl(218 91% 57% / 0.3)', backgroundColor: 'hsl(218 91% 57% / 0.03)' }}
    >
      {/* Decoration type picker */}
      <div className="space-y-1.5">
        <Label className="text-xs">Decoration Type</Label>
        <div className="flex flex-wrap gap-1.5">
          {decoGroups.map((g) => {
            const IconComp = ICON_MAP[g.icon] ?? Layers;
            const isSelected = g.id === selectedGroupId;
            return (
              <button
                key={g.id}
                type="button"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                style={{
                  borderColor: isSelected ? g.color : 'hsl(var(--border))',
                  backgroundColor: isSelected ? `${g.color}18` : 'transparent',
                  color: isSelected ? g.color : 'hsl(var(--foreground))',
                }}
                onClick={() => setSelectedGroupId(g.id)}
              >
                <IconComp className="h-3.5 w-3.5 shrink-0" />
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Location */}
        <div className="space-y-1">
          <Label className="text-xs">Location</Label>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DECORATION_LOCATIONS.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {location === 'Custom' && (
            <Input
              className="h-7 text-xs mt-1"
              placeholder="Custom location…"
              value={customLocation}
              onChange={(e) => setCustomLocation(e.target.value)}
            />
          )}
        </div>

        {/* Column selector (e.g. colors, stitch count) */}
        {selectedGroup && (
          <div className="space-y-1">
            <Label className="text-xs">
              {selectedGroup.col_labels[0]?.match(/color/i) ? 'Colors' :
               selectedGroup.col_labels[0]?.match(/stitch/i) ? 'Stitch Count' : 'Option'}
            </Label>
            <div className="flex flex-wrap gap-1">
              {selectedGroup.col_labels.slice(0, selectedGroup.col_count).map((label, i) => (
                <button
                  key={i}
                  type="button"
                  className="h-7 px-2 rounded text-xs font-semibold border transition-colors"
                  style={{
                    borderColor: colIndex === i ? selectedGroup.color : 'hsl(var(--border))',
                    backgroundColor: colIndex === i ? selectedGroup.color : 'transparent',
                    color: colIndex === i ? 'white' : 'inherit',
                  }}
                  onClick={() => { setColIndex(i); setPriceManual(false); }}
                  title={label}
                >
                  {/* Show abbreviated label */}
                  {label.match(/^\d/) ? label.split(' ')[0] : String(i + 1)}
                </button>
              ))}
            </div>
            {selectedGroup && (
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {selectedGroup.col_labels[colIndex]}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Price */}
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          Price / pc
          {!priceManual && autoPrice > 0 && !autoPriceIsPreview && (
            <span className="text-xs font-normal" style={{ color: 'hsl(218 91% 57%)' }}>
              (auto · {totalQtyVal} pcs)
            </span>
          )}
          {!priceManual && autoPriceIsPreview && (
            <span className="text-xs font-normal" style={{ color: '#F59E0B' }}>
              (preview — updates with qty)
            </span>
          )}
          {!priceManual && autoPrice === 0 && (
            <span className="text-xs font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {decoMatrix.some((r) => r.group_id === selectedGroupId)
                ? '(no tier for this qty — enter manually)'
                : '(no matrix data — enter manually)'}
            </span>
          )}
        </Label>
        <div className="flex gap-1">
          <Input
            className="h-8 text-xs"
            type="number"
            min="0"
            step="0.01"
            value={price || ''}
            placeholder="0.00"
            onChange={(e) => { setPrice(parseFloat(e.target.value) || 0); setPriceManual(true); }}
          />
          {priceManual && autoPrice > 0 && (
            <button
              type="button"
              className="h-8 px-2 text-xs rounded border hover:bg-accent"
              style={{ borderColor: 'hsl(var(--border))' }}
              title="Reset to auto"
              onClick={() => { setPrice(autoPrice); setPriceManual(false); }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleAdd} style={{ backgroundColor: 'hsl(218 91% 57%)' }}>
          <Plus className="h-3 w-3" /> Add
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Size Matrix Input ─────────────────────────────────────────────────────────

function SizeMatrixInput({
  sizes,
  onChange,
  sizeUnitPrices = {},
  onPriceChange,
}: {
  sizes: Record<string, number>;
  onChange: (sizes: Record<string, number>) => void;
  sizeUnitPrices?: Record<string, number>;
  onPriceChange?: (size: string, price: number) => void;
}) {
  const catalogSizes = Object.keys(sizeUnitPrices);
  const displaySizes = [...new Set([...STANDARD_SIZES, ...catalogSizes])];
  const total = totalQty(sizes);

  return (
    <div className="overflow-x-auto -mx-1">
      <div className="flex gap-1.5 items-end px-1" style={{ minWidth: 'max-content' }}>
        {displaySizes.map((size) => {
          const qty = sizes[size] || 0;
          const price = sizeUnitPrices[size] ?? 0;
          const hasPrice = price > 0;
          const hasQty = qty > 0;
          return (
            <div key={size} className="flex flex-col items-center gap-0.5" style={{ width: 52 }}>
              <span
                className="text-[11px] font-bold uppercase tracking-wide"
                style={{ color: hasQty ? 'hsl(218 91% 57%)' : 'hsl(var(--muted-foreground))' }}
              >
                {size}
              </span>
              {/* Qty input */}
              <input
                type="text"
                inputMode="numeric"
                className="h-9 rounded-md border text-center text-sm font-semibold outline-none transition-all focus:ring-1 focus:ring-blue-400 w-full"
                style={{
                  borderColor: hasQty ? 'hsl(218 91% 57% / 0.5)' : 'hsl(var(--border))',
                  backgroundColor: hasQty ? 'hsl(218 91% 57% / 0.06)' : 'transparent',
                  color: hasQty ? 'hsl(218 91% 57%)' : 'inherit',
                }}
                value={qty || ''}
                placeholder="0"
                onChange={(e) => {
                  if (/^\d*$/.test(e.target.value))
                    onChange({ ...sizes, [size]: parseInt(e.target.value) || 0 });
                }}
              />
              {/* Price input per size */}
              <div className="relative w-full">
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-bold pointer-events-none" style={{ color: 'hsl(var(--muted-foreground))' }}>$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="h-6 w-full rounded border text-center text-[11px] font-semibold outline-none transition-all focus:ring-1 focus:ring-blue-400 pl-3 pr-0.5"
                  style={{
                    borderColor: hasPrice ? 'hsl(218 91% 57% / 0.4)' : 'hsl(var(--border))',
                    backgroundColor: hasPrice ? 'hsl(218 91% 57% / 0.05)' : 'hsl(var(--muted) / 0.4)',
                    color: hasPrice ? 'hsl(218 91% 57%)' : 'hsl(var(--muted-foreground))',
                  }}
                  value={price || ''}
                  placeholder="—"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    onPriceChange?.(size, val);
                  }}
                />
              </div>
            </div>
          );
        })}
        <div
          className="flex flex-col items-center gap-0.5 ml-1 pl-2 border-l shrink-0"
          style={{ borderColor: 'hsl(var(--border))', width: 46 }}
        >
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Total
          </span>
          <div
            className="h-9 flex items-center justify-center w-full rounded-md"
            style={{ backgroundColor: total > 0 ? 'hsl(218 91% 57% / 0.1)' : 'hsl(var(--muted))' }}
          >
            <span
              className="font-bold text-sm"
              style={{ color: total > 0 ? 'hsl(218 91% 57%)' : 'hsl(var(--muted-foreground))' }}
            >
              {total || '0'}
            </span>
          </div>
          {/* spacer to align with price row */}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}

// ── Garment Line Card ─────────────────────────────────────────────

function GarmentLineCard({
  line,
  garments,
  decoGroups,
  decoMatrix,
  finishingServices,
  onChange,
  onRemove,
}: {
  line: GarmentLine;
  garments: Garment[];
  decoGroups: DecorationGroup[];
  decoMatrix: DecorationMatrixRow[];
  finishingServices: FinishingService[];
  onChange: (updated: GarmentLine) => void;
  onRemove: () => void;
}) {
  const [showPicker, setShowPicker] = useState(!line.description);
  const [showDecoForm, setShowDecoForm] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const qty = totalQty(line.sizes);
  const breakdown = computeLineBreakdown(line, decoMatrix);
  const hasSizeOverrides = Object.keys(line.sizeUnitPrices).length > 0;
  const unitPriceFlat = effectiveUnitPrice(line);

  const update = (patch: Partial<GarmentLine>) => onChange({ ...line, ...patch });

  const selectGarment = (g: Garment) => {
    const catalogPrices = (g.size_upcharges as Record<string, number> | null) ?? {};
    const sizeUnitPrices = Object.fromEntries(Object.entries(catalogPrices).filter(([, v]) => v > 0));
    const newSizes = { ...line.sizes };
    for (const s of Object.keys(sizeUnitPrices)) {
      if (!(s in newSizes)) newSizes[s] = 0;
    }
    update({
      garmentId: g.id,
      description: g.name + (g.color ? ` — ${g.color}` : ''),
      brand: g.brand,
      styleNumber: g.style_number ?? '',
      color: g.color ?? '',
      blankCost: g.base_cost,
      markupPct: g.markup_value,
      sizeUnitPrices,
      sizes: newSizes,
    });
    setShowPicker(false);
  };

  const removeDecoration = (tempId: string) =>
    update({ decorations: line.decorations.filter((d) => d.tempId !== tempId) });
  const removeFinishing = (tempId: string) =>
    update({ finishing: line.finishing.filter((f) => f.tempId !== tempId) });
  const addFinishing = (svc: FinishingService) => {
    if (line.finishing.some((f) => f.serviceId === svc.id)) return;
    update({
      finishing: [...line.finishing, { tempId: genTempId(), serviceId: svc.id, serviceName: svc.name, unitPrice: svc.unit_price }],
    });
  };

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))', borderLeft: '3px solid hsl(218 91% 57%)' }}>

      {/* ── Card Header ── */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: 'hsl(218 91% 57% / 0.03)' }}>
        <button type="button" className="p-0.5 rounded hover:bg-accent shrink-0" onClick={() => setCollapsed(v => !v)}>
          {collapsed
            ? <ChevronDown className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
            : <ChevronUp className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />}
        </button>
        <div className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: 'hsl(218 91% 57% / 0.12)' }}>
          <Shirt className="h-4 w-4" style={{ color: 'hsl(218 91% 57%)' }} />
        </div>
        <div className="flex-1 min-w-0">
          {line.description
            ? <p className="font-semibold text-sm truncate">{line.description}</p>
            : <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Select garment or enter manually</p>}
          {qty > 0 && (
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {qty} pcs · <span className="font-semibold" style={{ color: 'hsl(218 91% 57%)' }}>{formatCurrency(breakdown.total)}</span>
            </p>
          )}
        </div>
        <button type="button" className="p-1.5 rounded hover:bg-accent shrink-0" onClick={() => setShowPicker(v => !v)} title="Change garment">
          <Pencil className="h-3.5 w-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
        </button>
        <button type="button" className="p-1.5 rounded hover:bg-accent text-red-400 hover:text-red-600 shrink-0" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Garment picker ── */}
      {showPicker && (
        <div className="px-4 pb-3 pt-1 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
          <GarmentCatalogPicker garments={garments} onSelect={selectGarment} onClose={() => setShowPicker(false)} />
        </div>
      )}

      {/* ── Card Body ── */}
      {!showPicker && !collapsed && (
        <div className="border-t divide-y" style={{ borderColor: 'hsl(var(--border))' }}>

          {/* Description */}
          <div className="px-4 py-3 space-y-1">
            <Label className="text-xs">Description</Label>
            <Input className="h-8 text-sm" placeholder="e.g. Gildan 5000 Black T-Shirt" value={line.description} onChange={(e) => update({ description: e.target.value })} />
          </div>

          {/* Sizes & Pricing */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Sizes & Quantities
              <span className="ml-1.5 font-normal normal-case" style={{ color: 'hsl(218 91% 57%)' }}>
                {hasSizeOverrides ? '· per-size pricing (editable)' : '· enter $ per size to override'}
              </span>
            </p>
            <SizeMatrixInput
              sizes={line.sizes}
              onChange={(sizes) => update({ sizes })}
              sizeUnitPrices={line.sizeUnitPrices}
              onPriceChange={(size, price) => {
                const updated = { ...line.sizeUnitPrices };
                if (price > 0) updated[size] = price;
                else delete updated[size];
                update({ sizeUnitPrices: updated });
              }}
            />
            {/* Flat price input (when no per-size overrides) */}
            {!hasSizeOverrides && (
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-xs shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>Price / pc</Label>
                <div className="flex">
                  <span className="h-8 flex items-center px-2.5 text-xs border-y border-l rounded-l-md" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted))' }}>$</span>
                  <Input
                    className="h-8 text-sm rounded-l-none w-24"
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={line.priceOverridden ? (line.overriddenPrice || '') : (unitPriceFlat > 0 ? unitPriceFlat : '')}
                    onChange={(e) => update({ priceOverridden: true, overriddenPrice: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                {qty > 0 && unitPriceFlat > 0 && (
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    × {qty} = <strong style={{ color: 'hsl(218 91% 57%)' }}>{formatCurrency(qty * unitPriceFlat)}</strong>
                  </span>
                )}
                {line.priceOverridden && (
                  <button type="button" className="text-xs" style={{ color: 'hsl(218 91% 57%)' }}
                    onClick={() => update({ priceOverridden: false, overriddenPrice: 0 })}>↺ Reset</button>
                )}
              </div>
            )}
          </div>

          {/* Embellishments */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Embellishments</p>
              {!showDecoForm && decoGroups.length > 0 && (
                <button type="button" className="flex items-center gap-1 text-xs font-medium" style={{ color: 'hsl(218 91% 57%)' }} onClick={() => setShowDecoForm(true)}>
                  <Plus className="h-3 w-3" /> Add
                </button>
              )}
            </div>
            {line.decorations.length > 0 && (
              <div className="rounded-lg border overflow-hidden divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                {line.decorations.map((d) => {
                  const colLabel = d.groupColLabels[d.colIndex] ?? `Col ${d.colIndex + 1}`;
                  const unitP = qty > 0
                    ? lookupDecorationPrice(decoMatrix, d.groupId, qty, d.colIndex) || d.unitPrice
                    : d.unitPrice;
                  return (
                    <div key={d.tempId} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">{d.location} · {d.groupName}</p>
                        <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>{colLabel}</p>
                      </div>
                      {unitP > 0 ? (
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold" style={{ color: 'hsl(218 91% 57%)' }}>
                            {formatCurrency(unitP)}/pc
                          </p>
                          {qty > 0 && (
                            <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {qty}× = {formatCurrency(unitP * qty)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs shrink-0 font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'hsl(218 91% 57% / 0.08)', color: 'hsl(218 91% 57%)' }}>
                          qty-based
                        </span>
                      )}
                      <button type="button" className="p-1 rounded hover:bg-accent text-red-400 hover:text-red-600 shrink-0" onClick={() => removeDecoration(d.tempId)}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {showDecoForm ? (
              <DecorationAddForm
                totalQtyVal={qty}
                decoGroups={decoGroups}
                decoMatrix={decoMatrix}
                onAdd={(d) => { update({ decorations: [...line.decorations, d] }); setShowDecoForm(false); }}
                onCancel={() => setShowDecoForm(false)}
              />
            ) : (
              decoGroups.length === 0 && (
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>No decoration types in catalog yet.</p>
              )
            )}
          </div>

          {/* Finishing */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Finishing</p>
            {line.finishing.length > 0 && (
              <div className="rounded-lg border overflow-hidden divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                {line.finishing.map((f) => (
                  <div key={f.tempId} className="flex items-center gap-2 px-3 py-2">
                    <p className="flex-1 text-xs font-medium truncate">{f.serviceName}</p>
                    <div className="flex shrink-0">
                      <span className="h-7 flex items-center px-1.5 text-xs border-y border-l rounded-l" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted))' }}>$</span>
                      <Input
                        className="h-7 text-xs w-16 rounded-l-none"
                        type="number" min="0" step="0.01"
                        value={f.unitPrice || ''} placeholder="0.00"
                        onChange={(e) => update({ finishing: line.finishing.map((fi) => fi.tempId === f.tempId ? { ...fi, unitPrice: parseFloat(e.target.value) || 0 } : fi) })}
                      />
                    </div>
                    <span className="text-[11px] shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>/pc</span>
                    <button type="button" className="p-1 rounded hover:bg-accent text-red-400 hover:text-red-600 shrink-0" onClick={() => removeFinishing(f.tempId)}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {finishingServices.filter((s) => !line.finishing.some((f) => f.serviceId === s.id)).map((svc) => (
                <button key={svc.id} type="button"
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors hover:bg-accent"
                  style={{ border: '1px solid rgba(0,0,0,0.08)', backgroundColor: 'hsl(var(--muted)/0.4)' }}
                  onClick={() => addFinishing(svc)}>
                  <Plus className="h-3 w-3" />{svc.name}
                  <span className="font-semibold ml-0.5" style={{ color: 'hsl(218 91% 57%)' }}>{formatCurrency(svc.unit_price)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Line Breakdown */}
          {qty > 0 && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>Line Breakdown</p>
              <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'hsl(218 91% 57% / 0.2)' }}>
                {breakdown.groups.map((g, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 px-3 py-2 border-b last:border-b-0" style={{ borderColor: 'hsl(218 91% 57% / 0.1)', backgroundColor: i % 2 === 0 ? 'transparent' : 'hsl(218 91% 57% / 0.02)' }}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold">{g.sizes.join(', ')}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'hsl(218 91% 57% / 0.1)', color: 'hsl(218 91% 57%)' }}>
                          {g.qty} pcs
                        </span>
                      </div>
                      {hasSizeOverrides && (
                        <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {formatCurrency(g.price)} garment
                          {g.decoPerPc > 0 && <span> + {formatCurrency(g.decoPerPc)} deco ({g.qty} pcs tier)</span>}
                          {g.finishPerPc > 0 && <span> + {formatCurrency(g.finishPerPc)} finish</span>}
                          <span style={{ color: 'hsl(218 91% 57%)' }}> = {formatCurrency(g.totalPerPc)}/pc</span>
                        </p>
                      )}
                      {!hasSizeOverrides && (line.decorations.length > 0 || line.finishing.length > 0) && (
                        <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {[
                            line.decorations.length > 0 && `deco incl.`,
                            line.finishing.length > 0 && `finish incl.`,
                          ].filter(Boolean).join(' · ')}
                          <span style={{ color: 'hsl(218 91% 57%)' }}> {formatCurrency(g.totalPerPc)}/pc</span>
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: 'hsl(218 91% 57%)' }}>
                      {formatCurrency(g.groupTotal)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: 'hsl(218 91% 57% / 0.05)' }}>
                  <span className="text-xs font-bold">Line Total</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'hsl(218 91% 57%)' }}>
                    {formatCurrency(breakdown.total)}
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Setup Fee Card ────────────────────────────────────────────────────────────

function SetupFeeCard({
  fee,
  onChange,
  onRemove,
}: {
  fee: SetupFeeItem;
  onChange: (updated: SetupFeeItem) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg border"
      style={{ borderColor: 'hsl(38 92% 50% / 0.3)', backgroundColor: 'hsl(38 92% 50% / 0.04)' }}
    >
      <Input
        className="h-8 text-sm flex-1 min-w-0"
        placeholder="Description (e.g. Screen charges)"
        value={fee.description}
        onChange={(e) => onChange({ ...fee, description: e.target.value })}
      />
      <Input
        className="h-8 text-sm w-16 shrink-0 text-center"
        type="number"
        min="1"
        placeholder="Qty"
        value={fee.qty || ''}
        onChange={(e) => onChange({ ...fee, qty: parseInt(e.target.value) || 1 })}
      />
      <span className="text-xs shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>×</span>
      <div className="flex shrink-0">
        <span className="h-8 flex items-center px-2 text-sm border-y border-l rounded-l-md" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted))' }}>$</span>
        <Input
          className="h-8 text-sm w-20 rounded-l-none"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={fee.unitPrice || ''}
          onChange={(e) => onChange({ ...fee, unitPrice: parseFloat(e.target.value) || 0 })}
        />
      </div>
      <span className="text-sm font-semibold shrink-0 w-20 text-right">
        {formatCurrency(fee.qty * fee.unitPrice)}
      </span>
      <button
        type="button"
        className="p-1 rounded hover:bg-accent text-red-400 hover:text-red-600 shrink-0"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

// ── Price Breakdown Panel ─────────────────────────────────────────────────────

function PriceBreakdownPanel({
  garmentLines,
  setupFees,
  discountType,
  discountValue,
  taxRate,
  depositAmount,
  decoMatrix,
}: {
  garmentLines: GarmentLine[];
  setupFees: SetupFeeItem[];
  discountType: 'percent' | 'flat';
  discountValue: number;
  taxRate: number;
  depositAmount: number;
  decoMatrix: DecorationMatrixRow[];
}) {
  const billableItems = [
    ...garmentLines.map((l) => ({ qty: 1, unit_price: computeLineBreakdown(l, decoMatrix).total })),
    ...setupFees.map((f) => ({ qty: f.qty, unit_price: f.unitPrice })),
  ];
  const sub = calcSubtotal(billableItems);
  const disc = calcDiscount(sub, discountType, discountValue);
  const tax = calcTax(sub - disc, taxRate);
  const grandTotal = sub - disc + tax;

  const hasAnyContent = garmentLines.some((l) => l.description || totalQty(l.sizes) > 0) || setupFees.some((f) => f.description);

  return (
    <div
      className="w-80 shrink-0 flex flex-col overflow-hidden border-l"
      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted)/0.2)' }}
    >
      {/* Panel header */}
      <div
        className="shrink-0 px-4 py-3 border-b"
        style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
      >
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Price Breakdown
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {!hasAnyContent && (
          <p className="text-xs text-center py-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Add garment lines to see the breakdown.
          </p>
        )}

        {/* Garment lines */}
        {garmentLines.map((line) => {
          const qty = totalQty(line.sizes);
          const bd = computeLineBreakdown(line, decoMatrix);
          if (!line.description && qty === 0) return null;

          return (
            <div key={line.tempId} className="space-y-1">
              <p className="text-xs font-bold truncate pb-1.5 mb-1.5 border-b" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(218 91% 57%)' }}>
                {line.description || 'Garment'}
                {qty > 0 && <span className="font-normal ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>× {qty} pcs</span>}
              </p>

              {bd.hasSizeOverrides ? (
                <div className="space-y-1.5">
                  {bd.groups.map((g, gi) => (
                    <div key={gi} className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{g.sizes.join(', ')}</span>
                        <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{g.qty} pcs</span>
                      </div>
                      <div className="pl-2 space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span style={{ color: 'hsl(var(--muted-foreground))' }}>Garment</span>
                          <span className="tabular-nums">{formatCurrency(g.price)}/pc</span>
                        </div>
                        {g.decoPerPc > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span style={{ color: 'hsl(var(--muted-foreground))' }}>Deco ({g.qty} pcs)</span>
                            <span className="tabular-nums">{formatCurrency(g.decoPerPc)}/pc</span>
                          </div>
                        )}
                        {g.finishPerPc > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span style={{ color: 'hsl(var(--muted-foreground))' }}>Finishing</span>
                            <span className="tabular-nums">{formatCurrency(g.finishPerPc)}/pc</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs font-medium pt-0.5">
                          <span>{formatCurrency(g.totalPerPc)}/pc × {g.qty}</span>
                          <span className="tabular-nums" style={{ color: 'hsl(218 91% 57%)' }}>{formatCurrency(g.groupTotal)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {line.blankCost > 0 && (
                    <div className="flex items-center justify-between py-0.5">
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Blank ({Math.round(line.markupPct * 100)}% markup)
                      </span>
                      <span className="text-xs tabular-nums">{formatCurrency(blankPricePerPiece(line.blankCost, line.markupPct))}/pc</span>
                    </div>
                  )}
                  {line.decorations.map((d) => (
                    <div key={d.tempId} className="flex items-start justify-between py-0.5 gap-2">
                      <span className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {d.location} · {d.groupName}
                      </span>
                      <span className="text-xs tabular-nums shrink-0">{formatCurrency(d.unitPrice)}/pc</span>
                    </div>
                  ))}
                  {line.finishing.map((f) => (
                    <div key={f.tempId} className="flex items-center justify-between py-0.5">
                      <span className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{f.serviceName}</span>
                      <span className="text-xs tabular-nums shrink-0">{formatCurrency(f.unitPrice)}/pc</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-1.5 mt-1 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{qty} pcs</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: 'hsl(218 91% 57%)' }}>
                  {formatCurrency(bd.total)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Setup fees */}
        {setupFees.filter((f) => f.description).length > 0 && (
          <div className="space-y-0">
            <p
              className="text-xs font-bold truncate pb-2 mb-2 border-b"
              style={{ borderColor: 'hsl(var(--border))', color: 'hsl(38 92% 40%)' }}
            >
              Setup Fees
            </p>
            {setupFees.filter((f) => f.description).map((fee) => (
              <div key={fee.tempId} className="flex items-center justify-between py-1">
                <span className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {fee.description}
                  {fee.qty > 1 && <span className="ml-1">× {fee.qty}</span>}
                </span>
                <span className="text-xs font-medium tabular-nums shrink-0">
                  {formatCurrency(fee.qty * fee.unitPrice)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals footer — always visible */}
      <div
        className="shrink-0 border-t px-4 py-3 space-y-1.5"
        style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
      >
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>Subtotal</span>
          <span className="font-medium tabular-nums">{formatCurrency(sub)}</span>
        </div>
        {disc > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>Discount</span>
            <span className="font-medium tabular-nums text-red-500">−{formatCurrency(disc)}</span>
          </div>
        )}
        {taxRate > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>Tax ({taxRate}%)</span>
            <span className="font-medium tabular-nums">{formatCurrency(tax)}</span>
          </div>
        )}
        <div
          className="flex items-center justify-between pt-2 mt-1 border-t"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <span className="text-sm font-bold">Total</span>
          <span className="text-base font-bold tabular-nums" style={{ color: 'hsl(218 91% 57%)' }}>
            {formatCurrency(grandTotal)}
          </span>
        </div>
        {depositAmount > 0 && grandTotal > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>Balance due</span>
            <span className="font-semibold tabular-nums" style={{ color: 'hsl(38 92% 40%)' }}>
              {formatCurrency(Math.max(0, grandTotal - depositAmount))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface OrderCreateModalProps {
  open: boolean;
  onClose: () => void;
  editOrder?: OrderWithItems | null;
}

export function OrderCreateModal({ open, onClose, editOrder }: OrderCreateModalProps) {
  const qc = useQueryClient();
  const { data: garments = [] } = useGarments();
  const { data: decoGroups = [] } = useDecorationGroups();
  const { data: decoMatrix = [] } = useDecorationMatrix();
  const { data: finishingServices = [] } = useFinishingServices();
  const { data: customers = [] } = useCustomers();

  const isEdit = !!editOrder;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── Step 1: Customer + Job Details ────────────────────────────────────────
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [jobName, setJobName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // ── Step 2: Production Lines ──────────────────────────────────────────────
  const [garmentLines, setGarmentLines] = useState<GarmentLine[]>([emptyGarmentLine()]);
  const [setupFees, setSetupFees] = useState<SetupFeeItem[]>([]);

  // ── Step 3: Totals ────────────────────────────────────────────────────────
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);

  // ── Load for edit ─────────────────────────────────────────────────────────
  const loadEditOrder = useCallback(async (order: OrderWithItems) => {
    setCustomerId(order.customer_id ?? '');
    setCustomerName(order.customer_name ?? '');
    setCustomerEmail(order.customer_email ?? '');
    setCustomerPhone(order.customer_phone ?? '');
    setCustomerCompany(order.customer_company ?? '');
    setJobName(order.notes?.split('\n')[0]?.startsWith('Job:') ? order.notes.split('\n')[0].replace('Job:', '').trim() : '');
    setDueDate(order.due_date ?? '');
    setNotes(order.notes ?? '');
    setDiscountType(order.discount_type);
    setDiscountValue(order.discount_value);
    setTaxRate(order.tax_rate);
    setDepositAmount(order.deposit_amount);

    // Load items with decorations and finishing
    const { data: items } = await supabase
      .from('order_items')
      .select('*, order_item_decorations(*), order_item_finishing(*)')
      .eq('order_id', order.id)
      .order('created_at');

    // Fetch decoration groups for reconstructing DecorationItems
    const { data: groupsData } = await supabase
      .from('decoration_groups')
      .select('*');
    const groupsMap = new Map<string, DecorationGroup>(
      (groupsData ?? []).map((g: DecorationGroup) => [g.id, g]),
    );

    const allItems = (items ?? []) as (OrderItem & {
      order_item_decorations: import('@/types/database').OrderItemDecoration[];
      order_item_finishing: import('@/types/database').OrderItemFinishing[];
    })[];

    const garmentItems = allItems.filter((i) => i.line_type === 'garment');
    const feeItems = allItems.filter((i) => i.line_type === 'setup_fee');

    // Group order_items that originated from the same garment line (same garment_id + description + costs)
    const garmentGroups = new Map<string, typeof garmentItems>();
    for (const item of garmentItems) {
      const key = `${item.garment_id ?? ''}||${item.description}||${item.blank_cost ?? 0}||${item.markup_pct ?? 0}`;
      if (!garmentGroups.has(key)) garmentGroups.set(key, []);
      garmentGroups.get(key)!.push(item);
    }

    setGarmentLines(
      garmentGroups.size > 0
        ? Array.from(garmentGroups.values()).map((items) => {
            const first = items[0];
            const isMultiGroup = items.length > 1;

            // Merge all size_matrices into one
            const mergedSizes: Record<string, number> = { XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 };
            const sizeUnitPrices: Record<string, number> = {};
            for (const item of items) {
              const matrix = (item.size_matrix as Record<string, number>) ?? {};
              for (const [size, qty] of Object.entries(matrix)) {
                mergedSizes[size] = (mergedSizes[size] || 0) + (qty || 0);
                if (isMultiGroup && (qty || 0) > 0) {
                  sizeUnitPrices[size] = item.unit_price;
                }
              }
            }

            return {
              tempId: genTempId(),
              garmentId: first.garment_id ?? null,
              description: first.description,
              brand: '',
              styleNumber: '',
              color: first.color ?? '',
              sizes: mergedSizes,
              blankCost: first.blank_cost ?? 0,
              markupPct: first.markup_pct ?? 0.40,
              decorations: (first.order_item_decorations ?? []).map((d) => {
                const group = d.decoration_group_id ? groupsMap.get(d.decoration_group_id) : undefined;
                return {
                  tempId: genTempId(),
                  groupId: d.decoration_group_id ?? '',
                  groupName: group?.name ?? d.decoration_type,
                  groupColLabels: group?.col_labels ?? [],
                  colIndex: d.col_index ?? 0,
                  location: d.location,
                  unitPrice: d.unit_price,
                };
              }),
              finishing: (first.order_item_finishing ?? []).map((f) => ({
                tempId: genTempId(),
                serviceId: f.finishing_service_id ?? null,
                serviceName: f.service_name,
                unitPrice: f.unit_price,
              })),
              priceOverridden: isMultiGroup ? false : first.price_overridden,
              overriddenPrice: isMultiGroup ? 0 : (first.price_overridden ? first.unit_price : 0),
              overrideReason: first.override_reason ?? '',
              notes: first.notes ?? '',
              sizeUnitPrices,
            };
          })
        : [emptyGarmentLine()],
    );

    setSetupFees(
      feeItems.map((item) => ({
        tempId: genTempId(),
        description: item.description,
        qty: item.qty,
        unitPrice: item.unit_price,
      })),
    );
  }, []);

  useEffect(() => {
    if (open && editOrder) {
      loadEditOrder(editOrder);
    } else if (open && !editOrder) {
      // Reset
      setStep(0);
      setCustomerId('');
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setCustomerCompany('');
      setJobName('');
      setDueDate('');
      setNotes('');
      setGarmentLines([emptyGarmentLine()]);
      setSetupFees([]);
      setDiscountType('percent');
      setDiscountValue(0);
      setTaxRate(0);
      setDepositAmount(0);
    }
  }, [open, editOrder, loadEditOrder]);

  // ── Customer select helper ────────────────────────────────────────────────
  const handleCustomerSelect = (id: string) => {
    const c = customers.find((c) => c.id === id);
    if (!c) { setCustomerId(''); return; }
    setCustomerId(id);
    setCustomerName(c.name);
    setCustomerEmail(c.email ?? '');
    setCustomerPhone(c.phone ?? '');
    setCustomerCompany(c.company ?? '');
  };

  // ── Totals computation ────────────────────────────────────────────────────
  const billableItems = useMemo(() => {
    const garment = garmentLines.map((l) => ({ qty: 1, unit_price: computeLineBreakdown(l, decoMatrix).total }));
    const fees = setupFees.map((f) => ({ qty: f.qty, unit_price: f.unitPrice }));
    return [...garment, ...fees];
  }, [garmentLines, setupFees, decoMatrix]);

  const sub = calcSubtotal(billableItems);
  const disc = calcDiscount(sub, discountType, discountValue);
  const tax = calcTax(sub - disc, taxRate);
  const grandTotal = sub - disc + tax;

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!customerName.trim()) { toast.error('Customer name is required'); setStep(0); return; }

    const hasLines = garmentLines.some((l) => totalQty(l.sizes) > 0 || l.description);
    if (!hasLines) { toast.error('Add at least one garment line'); setStep(1); return; }

    setSaving(true);
    try {
      const orderData = {
        order_number: isEdit ? editOrder!.order_number : generateOrderNumber(),
        customer_id: customerId || null,
        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        customer_company: customerCompany || null,
        status: isEdit ? editOrder!.status : 'inquiry',
        due_date: dueDate || null,
        notes: [jobName ? `Job: ${jobName}` : '', notes].filter(Boolean).join('\n') || null,
        discount_type: discountType,
        discount_value: discountValue,
        tax_rate: taxRate,
        deposit_amount: depositAmount,
        image_url: null,
      };

      let orderId: string;
      if (isEdit) {
        await db.from('orders').update(orderData).eq('id', editOrder!.id);
        orderId = editOrder!.id;
        // Delete all existing items (cascades decorations + finishing)
        await db.from('order_items').delete().eq('order_id', orderId);
      } else {
        const { data: newOrder, error } = await db.from('orders').insert(orderData).select('id').single();
        if (error) throw error;
        orderId = newOrder.id;
      }

      // Insert garment lines — split into separate order_items per price group
      for (const line of garmentLines) {
        const qty = totalQty(line.sizes);
        if (qty === 0 && !line.description) continue;

        const priceGroups = groupSizesByPrice(line);
        const isMultiPrice = priceGroups.length > 1;

        // When no active sizes, save as a single placeholder item
        const groupsToSave = priceGroups.length > 0
          ? priceGroups
          : [{ price: effectiveUnitPrice(line), sizes: [], qty: 0, sizeMatrix: line.sizes }];

        for (const group of groupsToSave) {
          const sizeLabel = group.sizes.length > 0 ? group.sizes.join(', ') : null;
          const { data: item, error: itemErr } = await db
            .from('order_items')
            .insert({
              order_id: orderId,
              line_type: 'garment',
              garment_id: line.garmentId,
              description: line.description || 'Garment',
              qty: group.qty,
              unit_price: group.price,
              size_matrix: group.sizeMatrix,
              blank_cost: line.blankCost,
              markup_pct: line.markupPct,
              price_overridden: isMultiPrice ? true : line.priceOverridden,
              override_reason: isMultiPrice ? null : (line.priceOverridden ? (line.overrideReason || null) : null),
              color: line.color || null,
              taxable: true,
              notes: line.notes || null,
              size: sizeLabel,
            })
            .select('id')
            .single();
          if (itemErr) throw itemErr;

          // Decoration unit price is re-looked up per group qty so tiers are correct
          for (let i = 0; i < line.decorations.length; i++) {
            const d = line.decorations[i];
            const decoUnitPrice = isMultiPrice
              ? decoUnitPriceForQty(d, decoMatrix, group.qty)
              : d.unitPrice;
            await db.from('order_item_decorations').insert({
              order_item_id: item.id,
              decoration_type: d.groupName,
              decoration_group_id: d.groupId || null,
              col_index: d.colIndex,
              location: d.location,
              unit_price: decoUnitPrice,
              sort_order: i,
            });
          }

          // Finishing (same for all price groups)
          for (let i = 0; i < line.finishing.length; i++) {
            const f = line.finishing[i];
            await db.from('order_item_finishing').insert({
              order_item_id: item.id,
              finishing_service_id: f.serviceId,
              service_name: f.serviceName,
              unit_price: f.unitPrice,
              sort_order: i,
            });
          }
        }
      }

      // Insert setup fees
      for (const fee of setupFees) {
        if (!fee.description) continue;
        await db.from('order_items').insert({
          order_id: orderId,
          line_type: 'setup_fee',
          description: fee.description,
          qty: fee.qty || 1,
          unit_price: fee.unitPrice,
          taxable: false,
        });
      }

      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success(isEdit ? 'Order updated' : 'Order created');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  // ── Render steps ──────────────────────────────────────────────────────────

  const STEPS = ['Customer', 'Production Lines', 'Totals'];

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
      <div
        className="flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{
          width: 'calc(100vw - 1.5rem)',
          height: 'calc(100vh - 1.5rem)',
          backgroundColor: 'hsl(var(--background))',
        }}
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
          <div>
            <h2 className="font-bold text-lg font-heading">{isEdit ? 'Edit Order' : 'New Order'}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Production (Multi-SKU)
            </p>
          </div>
          {/* Step indicators */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
                style={{
                  backgroundColor: step === i ? 'hsl(218 91% 57%)' : step > i ? 'hsl(218 91% 57% / 0.15)' : 'hsl(var(--muted))',
                  color: step === i ? 'white' : step > i ? 'hsl(218 91% 57%)' : 'hsl(var(--muted-foreground))',
                }}
                onClick={() => setStep(i)}
              >
                {step > i && <Check className="h-3 w-3" />}
                {s}
              </button>
            ))}
          </div>
          <button type="button" className="p-1.5 rounded-lg hover:bg-accent" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: left form + right breakdown */}
        <div className="flex-1 flex overflow-hidden">

        {/* Left: form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-w-0">

          {/* ── Step 0: Customer ────────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-5 max-w-lg mx-auto">
              <div className="space-y-1">
                <Label>Customer</Label>
                <Select value={customerId || '__none__'} onValueChange={(v) => v === '__none__' ? handleCustomerSelect('') : handleCustomerSelect(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select existing customer…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Walk-in / New customer —</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.company ? ` — ${c.company}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label>Customer Name <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="Full name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Company</Label>
                  <Input placeholder="Company name" value={customerCompany} onChange={(e) => setCustomerCompany(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" placeholder="customer@email.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input placeholder="(555) 000-0000" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Order / Design Name</Label>
                <Input
                  placeholder="e.g. Acme Summer Event Tees"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  placeholder="Internal notes, special instructions…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── Step 1: Production Lines ────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Garment lines */}
              {garmentLines.map((line) => (
                <GarmentLineCard
                  key={line.tempId}
                  line={line}
                  garments={garments}
                  decoGroups={decoGroups}
                  decoMatrix={decoMatrix}
                  finishingServices={finishingServices}
                  onChange={(updated) =>
                    setGarmentLines((prev) => prev.map((l) => l.tempId === updated.tempId ? updated : l))
                  }
                  onRemove={() =>
                    setGarmentLines((prev) => prev.length > 1 ? prev.filter((l) => l.tempId !== line.tempId) : prev)
                  }
                />
              ))}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setGarmentLines((prev) => [...prev, emptyGarmentLine()])}
              >
                <Plus className="h-4 w-4" /> Add Another Garment Style
              </Button>

              {/* Setup fees */}
              {(setupFees.length > 0 || true) && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      Setup Fees
                    </p>
                  </div>
                  {setupFees.map((fee) => (
                    <SetupFeeCard
                      key={fee.tempId}
                      fee={fee}
                      onChange={(updated) =>
                        setSetupFees((prev) => prev.map((f) => f.tempId === updated.tempId ? updated : f))
                      }
                      onRemove={() => setSetupFees((prev) => prev.filter((f) => f.tempId !== fee.tempId))}
                    />
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {SETUP_FEE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium hover:bg-accent transition-colors"
                        style={{ borderColor: 'hsl(38 92% 50% / 0.5)', color: 'hsl(38 92% 40%)' }}
                        onClick={() =>
                          setSetupFees((prev) => [
                            ...prev,
                            { tempId: genTempId(), description: preset.label, qty: 1, unitPrice: 0 },
                          ])
                        }
                      >
                        <Plus className="h-3 w-3" /> {preset.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium hover:bg-accent transition-colors"
                      style={{ borderColor: 'hsl(var(--border))' }}
                      onClick={() =>
                        setSetupFees((prev) => [
                          ...prev,
                          { tempId: genTempId(), description: '', qty: 1, unitPrice: 0 },
                        ])
                      }
                    >
                      <Plus className="h-3 w-3" /> Custom Fee
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Totals ──────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5 max-w-lg mx-auto">
              {/* Line summary */}
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="px-4 py-2.5" style={{ backgroundColor: 'hsl(var(--muted)/0.5)' }}>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Order Summary</p>
                </div>
                <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                  {garmentLines
                    .filter((l) => totalQty(l.sizes) > 0 || l.description)
                    .map((l) => {
                      const qty = totalQty(l.sizes);
                      const hasSizeOverrides = Object.keys(l.sizeUnitPrices).length > 0;
                      const up = effectiveUnitPrice(l);
                      const subtotal = garmentLineSubtotal(l);
                      return (
                        <div key={l.tempId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{l.description || 'Garment'}</p>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {hasSizeOverrides
                                ? `${qty} pcs (per-size pricing)`
                                : `${qty} pcs × ${formatCurrency(up)}/pc`}
                            </p>
                          </div>
                          <span className="font-semibold shrink-0 ml-4">{formatCurrency(subtotal)}</span>
                        </div>
                      );
                    })}
                  {setupFees.filter((f) => f.description).map((f) => (
                    <div key={f.tempId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <p className="font-medium">{f.description}</p>
                      <span className="font-semibold">{formatCurrency(f.qty * f.unitPrice)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discount */}
              <div className="space-y-1">
                <Label>Discount</Label>
                <div className="flex gap-2">
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'percent' | 'flat')}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent %</SelectItem>
                      <SelectItem value="flat">Flat $</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Tax */}
              <div className="space-y-1">
                <Label>Tax Rate (%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={taxRate || ''}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                />
              </div>

              {/* Totals display */}
              <div className="rounded-xl border divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex justify-between px-4 py-2.5 text-sm">
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>Subtotal</span>
                  <span className="font-medium">{formatCurrency(sub)}</span>
                </div>
                {disc > 0 && (
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>Discount</span>
                    <span className="font-medium text-red-500">−{formatCurrency(disc)}</span>
                  </div>
                )}
                {taxRate > 0 && (
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>Tax ({taxRate}%)</span>
                    <span className="font-medium">{formatCurrency(tax)}</span>
                  </div>
                )}
                <div className="flex justify-between px-4 py-3">
                  <span className="font-bold">Total</span>
                  <span className="font-bold text-lg" style={{ color: 'hsl(218 91% 57%)' }}>{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              {/* Deposit */}
              <div className="space-y-1">
                <Label>Deposit Amount</Label>
                <div className="flex gap-1.5">
                  <span className="h-9 flex items-center px-2.5 text-sm rounded-l-md border-y border-l" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted))' }}>$</span>
                  <Input
                    className="rounded-l-none"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={depositAmount || ''}
                    onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)}
                  />
                </div>
                {depositAmount > 0 && grandTotal > 0 && (
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Balance due: {formatCurrency(Math.max(0, grandTotal - depositAmount))}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>{/* end left form */}

        {/* Right: price breakdown panel */}
        <PriceBreakdownPanel
          garmentLines={garmentLines}
          setupFees={setupFees}
          discountType={discountType}
          discountValue={discountValue}
          taxRate={taxRate}
          depositAmount={depositAmount}
          decoMatrix={decoMatrix}
        />

        </div>{/* end body flex */}

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t flex items-center justify-between gap-3" style={{ borderColor: 'hsl(var(--border))' }}>
          <Button variant="outline" onClick={step > 0 ? () => setStep(step - 1) : onClose}>
            {step > 0 ? 'Back' : 'Cancel'}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              style={{ backgroundColor: 'hsl(218 91% 57%)' }}
            >
              Next: {STEPS[step + 1]}
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: 'hsl(218 91% 57%)' }}
            >
              {saving ? 'Saving…' : isEdit ? 'Update Order' : 'Create Order'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
