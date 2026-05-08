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

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

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
  const colKey = `col_${colIndex + 1}` as keyof DecorationMatrixRow;
  return (row[colKey] as number) ?? 0;
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
    sizes: { XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 },
    blankCost: 0,
    markupPct: 0.40,
    decorations: [],
    finishing: [],
    priceOverridden: false,
    overriddenPrice: 0,
    overrideReason: '',
    notes: '',
  };
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
                <span className="text-xs font-semibold shrink-0" style={{ color: 'hsl(218 91% 57%)' }}>
                  ${g.base_cost.toFixed(2)} cost
                </span>
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

  const autoPrice = useMemo(() => {
    if (!selectedGroupId || totalQtyVal <= 0) return 0;
    return lookupDecorationPrice(decoMatrix, selectedGroupId, totalQtyVal, colIndex);
  }, [selectedGroupId, totalQtyVal, colIndex, decoMatrix]);

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
          {!priceManual && autoPrice > 0 && (
            <span className="text-xs font-normal" style={{ color: 'hsl(218 91% 57%)' }}>(auto)</span>
          )}
          {totalQtyVal === 0 && (
            <span className="text-xs font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(enter qty first for auto-pricing)</span>
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
  upcharges,
  onChange,
}: {
  sizes: Record<string, number>;
  upcharges: Record<string, number>;
  onChange: (sizes: Record<string, number>) => void;
}) {
  const total = totalQty(sizes);

  return (
    <div>
      <div className="flex gap-1.5 flex-wrap">
        {STANDARD_SIZES.map((size) => {
          const upcharge = upcharges[size] ?? 0;
          return (
            <div key={size} className="flex flex-col items-center gap-0.5">
              <span className="text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>{size}</span>
              <input
                type="text"
                inputMode="numeric"
                className="w-12 h-8 rounded-md border text-center text-sm font-medium outline-none transition-colors focus:border-blue-400"
                style={{ borderColor: 'hsl(var(--border))' }}
                value={sizes[size] || ''}
                placeholder="0"
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^\d*$/.test(v)) {
                    onChange({ ...sizes, [size]: parseInt(v) || 0 });
                  }
                }}
              />
              {upcharge > 0 && (
                <span className="text-xs" style={{ color: 'hsl(38 92% 50%)' }}>+${upcharge}</span>
              )}
            </div>
          );
        })}
        <div className="flex flex-col items-center justify-end pb-0.5 gap-0.5 ml-2">
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Total</span>
          <span
            className="h-8 flex items-center px-2 font-bold text-sm rounded-md"
            style={{
              backgroundColor: total > 0 ? 'hsl(218 91% 57% / 0.1)' : 'hsl(var(--muted))',
              color: total > 0 ? 'hsl(218 91% 57%)' : 'hsl(var(--muted-foreground))',
            }}
          >
            {total}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Garment Line Card ─────────────────────────────────────────────────────────

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
  const [expanded, setExpanded] = useState(true);

  const qty = totalQty(line.sizes);
  const upcharges = useMemo(() => {
    const g = garments.find((g) => g.id === line.garmentId);
    return (g?.size_upcharges ?? {}) as Record<string, number>;
  }, [garments, line.garmentId]);

  const autoBlank = blankPricePerPiece(line.blankCost, line.markupPct);
  const autoDecoTotal = line.decorations.reduce((s, d) => s + d.unitPrice, 0);
  const autoFinishTotal = line.finishing.reduce((s, f) => s + f.unitPrice, 0);
  const autoUnit = autoBlank + autoDecoTotal + autoFinishTotal;
  const unitPrice = line.priceOverridden ? line.overriddenPrice : autoUnit;
  const lineTotal = qty * unitPrice;

  const update = (patch: Partial<GarmentLine>) => onChange({ ...line, ...patch });

  const selectGarment = (g: Garment) => {
    update({
      garmentId: g.id,
      description: g.name + (g.color ? ` — ${g.color}` : ''),
      brand: g.brand,
      styleNumber: g.style_number ?? '',
      color: g.color ?? '',
      blankCost: g.base_cost,
      markupPct: g.markup_value,
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
      finishing: [
        ...line.finishing,
        { tempId: genTempId(), serviceId: svc.id, serviceName: svc.name, unitPrice: svc.unit_price },
      ],
    });
  };

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'hsl(var(--border))', borderLeft: '3px solid hsl(218 91% 57%)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-transparent">
        <button
          type="button"
          className="p-0.5 rounded hover:bg-accent"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? <ChevronUp className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
            : <ChevronDown className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />}
        </button>
        <div
          className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center"
          style={{ backgroundColor: 'hsl(218 91% 57% / 0.1)' }}
        >
          <Shirt className="h-4 w-4" style={{ color: 'hsl(218 91% 57%)' }} />
        </div>
        <div className="flex-1 min-w-0">
          {line.description ? (
            <p className="font-semibold text-sm truncate">{line.description}</p>
          ) : (
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Select a garment from catalog or enter manually
            </p>
          )}
          {qty > 0 && (
            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {qty} pcs · {formatCurrency(unitPrice)}/pc · {formatCurrency(lineTotal)} total
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="p-1.5 rounded hover:bg-accent"
            onClick={() => setShowPicker((v) => !v)}
            title="Change garment"
          >
            <Pencil className="h-3.5 w-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
          </button>
          <button
            type="button"
            className="p-1.5 rounded hover:bg-accent text-red-400 hover:text-red-600"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Garment picker */}
      {showPicker && (
        <div className="px-4 pb-3">
          <GarmentCatalogPicker
            garments={garments}
            onSelect={selectGarment}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}

      {expanded && !showPicker && (
        <div
          className="px-4 pb-4 space-y-4 border-t"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          {/* Manual description override */}
          <div className="pt-3 space-y-1">
            <Label className="text-xs">Description (customer-facing)</Label>
            <Input
              className="h-8 text-sm"
              placeholder="e.g. Gildan 5000 Black T-Shirt"
              value={line.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </div>

          {/* Size Matrix */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Sizes
            </p>
            <SizeMatrixInput
              sizes={line.sizes}
              upcharges={upcharges}
              onChange={(sizes) => update({ sizes })}
            />
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Blank Cost / pc</Label>
              <div className="flex gap-1.5">
                <span className="h-8 flex items-center px-2.5 text-sm rounded-l-md border-y border-l" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted))' }}>$</span>
                <Input
                  className="h-8 text-sm rounded-l-none"
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.blankCost || ''}
                  placeholder="0.00"
                  onChange={(e) => update({ blankCost: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Markup %</Label>
              <div className="flex gap-1.5">
                <Input
                  className="h-8 text-sm"
                  type="number"
                  min="0"
                  step="1"
                  value={Math.round(line.markupPct * 100) || ''}
                  placeholder="40"
                  onChange={(e) => update({ markupPct: (parseFloat(e.target.value) || 0) / 100 })}
                />
                <span className="h-8 flex items-center px-2.5 text-sm rounded-r-md border-y border-r" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted))' }}>%</span>
              </div>
            </div>
          </div>

          {/* Decorations */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Decorations
            </p>
            {line.decorations.length > 0 && (
              <div className="rounded-lg border divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                {line.decorations.map((d) => {
                  const colLabel = d.groupColLabels[d.colIndex] ?? `Col ${d.colIndex + 1}`;
                  return (
                    <div key={d.tempId} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {d.location} · {d.groupName} — {colLabel}
                        </p>
                      </div>
                      <span className="text-xs font-semibold shrink-0" style={{ color: 'hsl(218 91% 57%)' }}>
                        {formatCurrency(d.unitPrice)}/pc
                      </span>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-accent text-red-400 hover:text-red-600 shrink-0"
                        onClick={() => removeDecoration(d.tempId)}
                      >
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
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
                style={{ color: 'hsl(218 91% 57%)' }}
                onClick={() => setShowDecoForm(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Add Decoration
              </button>
            )}
          </div>

          {/* Finishing */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Finishing
            </p>
            {line.finishing.length > 0 && (
              <div className="rounded-lg overflow-hidden" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.06)' }}>
                {line.finishing.map((f) => (
                  <div key={f.tempId} className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <p className="flex-1 text-xs font-medium truncate">{f.serviceName}</p>
                    <Input
                      className="h-7 text-xs w-20 shrink-0"
                      type="number"
                      min="0"
                      step="0.01"
                      value={f.unitPrice || ''}
                      placeholder="0.00"
                      onChange={(e) => {
                        update({
                          finishing: line.finishing.map((fi) =>
                            fi.tempId === f.tempId
                              ? { ...fi, unitPrice: parseFloat(e.target.value) || 0 }
                              : fi,
                          ),
                        });
                      }}
                    />
                    <span className="text-xs shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>/pc</span>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-accent text-red-400 hover:text-red-600 shrink-0"
                      onClick={() => removeFinishing(f.tempId)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Finishing service picker */}
            <div className="flex flex-wrap gap-1.5">
              {finishingServices
                .filter((s) => !line.finishing.some((f) => f.serviceId === s.id))
                .map((svc) => (
                  <button
                    key={svc.id}
                    type="button"
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors hover:bg-accent"
                    style={{ border: '1px solid rgba(0,0,0,0.08)', backgroundColor: 'hsl(var(--muted)/0.4)' }}
                    onClick={() => addFinishing(svc)}
                  >
                    <Plus className="h-3 w-3" />
                    {svc.name}
                    <span className="font-semibold" style={{ color: 'hsl(218 91% 57%)' }}>
                      {formatCurrency(svc.unit_price)}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {/* Pricing summary + override */}
          <div
            className="rounded-lg border p-3 space-y-2"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted)/0.3)' }}
          >
            {/* Auto breakdown */}
            {!line.priceOverridden && (
              <div className="text-xs space-y-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                <div className="flex justify-between">
                  <span>Blank ({Math.round(line.markupPct * 100)}% markup)</span>
                  <span>{formatCurrency(autoBlank)}/pc</span>
                </div>
                {autoDecoTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Decoration</span>
                    <span>{formatCurrency(autoDecoTotal)}/pc</span>
                  </div>
                )}
                {autoFinishTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Finishing</span>
                    <span>{formatCurrency(autoFinishTotal)}/pc</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-sm font-bold">{formatCurrency(unitPrice)}/pc</span>
                {qty > 0 && (
                  <span className="text-xs ml-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    × {qty} = <strong>{formatCurrency(lineTotal)}</strong>
                  </span>
                )}
              </div>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={line.priceOverridden}
                  onChange={(e) => {
                    update({
                      priceOverridden: e.target.checked,
                      overriddenPrice: e.target.checked ? autoUnit : 0,
                    });
                  }}
                />
                Override price
              </label>
            </div>
            {line.priceOverridden && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Override price / pc</Label>
                  <div className="flex gap-1">
                    <span className="h-7 flex items-center px-2 text-xs rounded-l-md border-y border-l" style={{ borderColor: 'hsl(38 92% 50%)', backgroundColor: 'hsl(38 92% 50% / 0.08)' }}>$</span>
                    <Input
                      className="h-7 text-xs rounded-l-none"
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.overriddenPrice || ''}
                      placeholder={autoUnit.toFixed(2)}
                      style={{ borderColor: 'hsl(38 92% 50%)' }}
                      onChange={(e) => update({ overriddenPrice: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Override reason</Label>
                  <Input
                    className="h-7 text-xs"
                    placeholder="e.g. repeat customer discount"
                    value={line.overrideReason}
                    onChange={(e) => update({ overrideReason: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
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
}: {
  garmentLines: GarmentLine[];
  setupFees: SetupFeeItem[];
  discountType: 'percent' | 'flat';
  discountValue: number;
  taxRate: number;
  depositAmount: number;
}) {
  const billableItems = [
    ...garmentLines.map((l) => ({ qty: totalQty(l.sizes), unit_price: effectiveUnitPrice(l) })),
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
          if (!line.description && qty === 0) return null;

          const blank = blankPricePerPiece(line.blankCost, line.markupPct);
          const decoTotal = line.decorations.reduce((s, d) => s + d.unitPrice, 0);
          const finishTotal = line.finishing.reduce((s, f) => s + f.unitPrice, 0);
          const autoUnit = blank + decoTotal + finishTotal;
          const unitPrice = effectiveUnitPrice(line);
          const lineTotal = qty * unitPrice;

          return (
            <div key={line.tempId} className="space-y-0">
              {/* Garment name */}
              <p
                className="text-xs font-bold truncate pb-2 mb-2 border-b"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(218 91% 57%)' }}
              >
                {line.description || 'Garment'}
                {qty > 0 && <span className="font-normal ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>× {qty}</span>}
              </p>

              {/* Blank cost row */}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Blank ({Math.round(line.markupPct * 100)}% markup)
                </span>
                <span className="text-xs font-medium tabular-nums">{formatCurrency(blank)}/pc</span>
              </div>

              {/* Decorations */}
              {line.decorations.length > 0 && (
                <div className="mt-1 mb-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Decorations
                  </p>
                  {line.decorations.map((d) => {
                    const colLabel = d.groupColLabels[d.colIndex] ?? `Col ${d.colIndex + 1}`;
                    return (
                      <div key={d.tempId} className="flex items-start justify-between py-0.5 gap-2">
                        <span className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {d.location} · {d.groupName}
                          <span className="block text-[10px] opacity-70">{colLabel}</span>
                        </span>
                        <span className="text-xs font-medium tabular-nums shrink-0">{formatCurrency(d.unitPrice)}/pc</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Finishing */}
              {line.finishing.length > 0 && (
                <div className="mt-1 mb-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Finishing
                  </p>
                  {line.finishing.map((f) => (
                    <div key={f.tempId} className="flex items-center justify-between py-0.5">
                      <span className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{f.serviceName}</span>
                      <span className="text-xs font-medium tabular-nums shrink-0">{formatCurrency(f.unitPrice)}/pc</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Override badge */}
              {line.priceOverridden && (
                <div
                  className="flex items-center justify-between py-1 px-2 rounded-md mt-1"
                  style={{ backgroundColor: 'hsl(38 92% 50% / 0.1)' }}
                >
                  <span className="text-xs font-medium" style={{ color: 'hsl(38 92% 40%)' }}>Price override</span>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: 'hsl(38 92% 40%)' }}>
                    {formatCurrency(unitPrice)}/pc
                  </span>
                </div>
              )}

              {/* Line subtotal */}
              <div
                className="flex items-center justify-between pt-2 mt-2 border-t"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                {!line.priceOverridden ? (
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {formatCurrency(autoUnit)}/pc × {qty}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {formatCurrency(unitPrice)}/pc × {qty}
                  </span>
                )}
                <span className="text-sm font-bold" style={{ color: 'hsl(218 91% 57%)' }}>
                  {formatCurrency(lineTotal)}
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

    setGarmentLines(
      garmentItems.length > 0
        ? garmentItems.map((item) => ({
            tempId: genTempId(),
            garmentId: item.garment_id ?? null,
            description: item.description,
            brand: '',
            styleNumber: '',
            color: item.color ?? '',
            sizes: (item.size_matrix as Record<string, number>) ?? { XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 },
            blankCost: item.blank_cost ?? 0,
            markupPct: item.markup_pct ?? 0.40,
            decorations: (item.order_item_decorations ?? []).map((d) => {
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
            finishing: (item.order_item_finishing ?? []).map((f) => ({
              tempId: genTempId(),
              serviceId: f.finishing_service_id ?? null,
              serviceName: f.service_name,
              unitPrice: f.unit_price,
            })),
            priceOverridden: item.price_overridden,
            overriddenPrice: item.price_overridden ? item.unit_price : 0,
            overrideReason: item.override_reason ?? '',
            notes: item.notes ?? '',
          }))
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
    const garment = garmentLines.map((l) => ({
      qty: totalQty(l.sizes),
      unit_price: effectiveUnitPrice(l),
    }));
    const fees = setupFees.map((f) => ({ qty: f.qty, unit_price: f.unitPrice }));
    return [...garment, ...fees];
  }, [garmentLines, setupFees]);

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

      // Insert garment lines
      for (const line of garmentLines) {
        const qty = totalQty(line.sizes);
        if (qty === 0 && !line.description) continue;
        const unitPrice = effectiveUnitPrice(line);

        const { data: item, error: itemErr } = await db
          .from('order_items')
          .insert({
            order_id: orderId,
            line_type: 'garment',
            garment_id: line.garmentId,
            description: line.description || 'Garment',
            qty: qty || 0,
            unit_price: unitPrice,
            size_matrix: line.sizes,
            blank_cost: line.blankCost,
            markup_pct: line.markupPct,
            price_overridden: line.priceOverridden,
            override_reason: line.priceOverridden ? (line.overrideReason || null) : null,
            color: line.color || null,
            taxable: true,
            notes: line.notes || null,
          })
          .select('id')
          .single();
        if (itemErr) throw itemErr;

        // Insert decorations using generic group system
        for (let i = 0; i < line.decorations.length; i++) {
          const d = line.decorations[i];
          await db.from('order_item_decorations').insert({
            order_item_id: item.id,
            decoration_type: d.groupName,
            decoration_group_id: d.groupId || null,
            col_index: d.colIndex,
            location: d.location,
            unit_price: d.unitPrice,
            sort_order: i,
          });
        }

        // Insert finishing
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
                      const up = effectiveUnitPrice(l);
                      return (
                        <div key={l.tempId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{l.description || 'Garment'}</p>
                            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                              {qty} pcs × {formatCurrency(up)}/pc
                              {l.priceOverridden && (
                                <span className="ml-1.5 text-amber-600 font-medium">(override)</span>
                              )}
                            </p>
                          </div>
                          <span className="font-semibold shrink-0 ml-4">{formatCurrency(qty * up)}</span>
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
