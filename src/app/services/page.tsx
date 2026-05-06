'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, X, Save,
  Layers, Tag, Settings, Package, Scissors, Ticket, Droplets, Shirt,
  Printer, Paintbrush, Palette, Wrench, Zap, Star, Circle,
  Hash, Box, Truck, Award, Grid3x3, Pen, Flame, Sparkles, Diamond,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type {
  ServiceGroup, ServiceGroupInsert, ServiceItemInsert,
  ServiceItemTier, ServiceItemTierInsert, ServiceGroupWithItems, ServiceItemWithTiers,
} from '@/types/database';

// ── Icon Map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Layers, Tag, Settings, Package, Scissors, Ticket, Droplets, Shirt,
  Printer, Paintbrush, Palette, Wrench, Zap, Star, Circle,
  Hash, Box, Truck, Award, Grid3x3, Pen, Flame, Sparkles, Diamond,
};

const ICON_NAMES = Object.keys(ICON_MAP);

const PRESET_COLORS = [
  { label: 'Blue',   hex: '#2E7CF6' },
  { label: 'Purple', hex: '#8B5CF6' },
  { label: 'Amber',  hex: '#F59E0B' },
  { label: 'Green',  hex: '#10B981' },
  { label: 'Pink',   hex: '#EC4899' },
  { label: 'Red',    hex: '#EF4444' },
  { label: 'Cyan',   hex: '#06B6D4' },
  { label: 'Navy',   hex: '#05253D' },
];

function IconRenderer({ name, size = 18, color }: { name: string; size?: number; color?: string }) {
  const Comp = ICON_MAP[name] ?? Layers;
  return <Comp style={{ width: size, height: size, color: color ?? 'currentColor' }} />;
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

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

// ── Color Picker ──────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.label}
            className="h-8 w-8 rounded-full border-[3px] transition-transform hover:scale-110"
            style={{
              backgroundColor: c.hex,
              borderColor: value.toLowerCase() === c.hex.toLowerCase() ? '#000' : 'transparent',
            }}
            onClick={() => onChange(c.hex)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-8 w-8 rounded-md border shrink-0 overflow-hidden"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-10 -mt-1 -ml-1 cursor-pointer"
          />
        </div>
        <Input
          placeholder="#HEX"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v);
          }}
          className="h-8 text-xs w-28 font-mono"
        />
      </div>
    </div>
  );
}

// ── Icon Picker ───────────────────────────────────────────────────────────────

function IconPicker({ value, onChange, color }: { value: string; onChange: (v: string) => void; color?: string }) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {ICON_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          title={name}
          className="flex items-center justify-center h-9 w-9 rounded-md border-2 transition-all hover:scale-105"
          style={{
            borderColor: value === name ? (color ?? 'hsl(218 91% 57%)') : 'transparent',
            backgroundColor: value === name ? `${color ?? '#2E7CF6'}18` : 'hsl(var(--muted))',
          }}
          onClick={() => onChange(name)}
        >
          <IconRenderer name={name} size={17} color={value === name ? (color ?? '#2E7CF6') : 'hsl(var(--muted-foreground))'} />
        </button>
      ))}
    </div>
  );
}

// ── Group Preview Card ────────────────────────────────────────────────────────

function GroupPreviewCard({ name, description, icon, color }: { name: string; description: string; icon: string; color: string }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Preview
      </p>
      {/* Sidebar-style card */}
      <div
        className="rounded-xl border p-4 flex items-center gap-3"
        style={{ borderColor: `${color}40`, backgroundColor: `${color}10` }}
      >
        <div
          className="flex items-center justify-center h-11 w-11 rounded-xl shrink-0"
          style={{ backgroundColor: color }}
        >
          <IconRenderer name={icon} size={22} color="#fff" />
        </div>
        <div>
          <p className="font-semibold text-sm">{name || 'Group Name'}</p>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {description || 'No description'}
          </p>
        </div>
      </div>
      {/* List-item style */}
      <div className="rounded-xl border p-3 flex items-center gap-2.5" style={{ borderColor: 'hsl(var(--border))' }}>
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: color }}
        >
          <IconRenderer name={icon} size={15} color="#fff" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{name || 'Group Name'}</p>
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>0 items</p>
        </div>
      </div>
    </div>
  );
}

// ── Item Preview Card ─────────────────────────────────────────────────────────

interface ItemPreviewCardProps {
  name: string;
  description: string;
  icon: string;
  color: string;
  pricingType: 'moq' | 'flat';
  flatPrice: string;
  tiers: TierRow[];
  imageUrl: string;
}

function ItemPreviewCard({ name, description, icon, color, pricingType, flatPrice, tiers, imageUrl }: ItemPreviewCardProps) {
  const pricePreview = pricingType === 'flat'
    ? (flatPrice ? formatCurrency(parseFloat(flatPrice)) : 'Flat Rate')
    : tiers.filter((t) => t.min_qty && t.price_per_unit).length > 0
      ? (() => {
          const prices = tiers.filter((t) => t.price_per_unit).map((t) => parseFloat(t.price_per_unit));
          if (!prices.length) return 'MOQ Tiered';
          const mn = Math.min(...prices);
          const mx = Math.max(...prices);
          return mn === mx ? formatCurrency(mn) : `${formatCurrency(mn)} – ${formatCurrency(mx)}`;
        })()
      : 'MOQ Tiered';

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
        Preview
      </p>
      <div
        className="rounded-xl border p-4 flex items-center gap-3"
        style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
      >
        <div
          className="flex items-center justify-center h-11 w-11 rounded-xl shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <IconRenderer name={icon} size={22} color={color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{name || 'Item Name'}</p>
          {description && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{description}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{
                backgroundColor: pricingType === 'moq' ? 'hsl(218 91% 57% / 0.12)' : 'hsl(152 74% 42% / 0.12)',
                color: pricingType === 'moq' ? 'hsl(218 91% 57%)' : 'hsl(152 74% 28%)',
              }}
            >
              {pricingType === 'moq' ? 'MOQ' : 'Flat'}
            </span>
            <span className="text-sm font-bold" style={{ color }}>{pricePreview}</span>
          </div>
        </div>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-12 w-12 rounded-lg object-cover border shrink-0"
            style={{ borderColor: 'hsl(var(--border))' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>

      {/* MOQ tier preview */}
      {pricingType === 'moq' && tiers.filter((t) => t.min_qty && t.price_per_unit).length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="px-3 py-2 text-xs font-semibold" style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
            Price at qty
          </div>
          <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
            {[144, 300, 600, 1200, 2400].map((qty) => {
              const validTiers = tiers
                .filter((t) => t.min_qty && t.price_per_unit)
                .map((t) => ({
                  min: parseInt(t.min_qty),
                  max: t.max_qty ? parseInt(t.max_qty) : null,
                  price: parseFloat(t.price_per_unit),
                }))
                .sort((a, b) => a.min - b.min);
              const matchedTier = validTiers.reduce<typeof validTiers[0] | null>((best, t) => {
                if (qty >= t.min) return t;
                return best;
              }, null);
              if (!matchedTier) return null;
              const active = qty >= matchedTier.min && (matchedTier.max === null || qty <= matchedTier.max);
              return (
                <div key={qty} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>{qty.toLocaleString()} pcs</span>
                  <span className={active ? 'font-bold' : ''} style={{ color: active ? color : 'hsl(var(--foreground))' }}>
                    {formatCurrency(matchedTier.price)}/ea
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tier Row Type ─────────────────────────────────────────────────────────────

interface TierRow {
  min_qty: string;
  max_qty: string;
  price_per_unit: string;
}

const DEFAULT_TIERS: TierRow[] = [
  { min_qty: '144',  max_qty: '299',  price_per_unit: '' },
  { min_qty: '300',  max_qty: '599',  price_per_unit: '' },
  { min_qty: '600',  max_qty: '1199', price_per_unit: '' },
  { min_qty: '1200', max_qty: '2399', price_per_unit: '' },
  { min_qty: '2400', max_qty: '',     price_per_unit: '' },
];

// ── Fullscreen Group Modal ────────────────────────────────────────────────────

interface GroupModalProps {
  open: boolean;
  onClose: () => void;
  editGroup?: ServiceGroup | null;
}

function GroupModal({ open, onClose, editGroup }: GroupModalProps) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Layers');
  const [color, setColor] = useState('#2E7CF6');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editGroup) {
      setName(editGroup.name);
      setDescription(editGroup.description ?? '');
      setIcon(editGroup.icon);
      setColor(editGroup.color);
    } else {
      setName(''); setDescription(''); setIcon('Layers'); setColor('#2E7CF6');
    }
  }, [open, editGroup]);

  const save = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload: ServiceGroupInsert = {
        name: name.trim(),
        description: description.trim() || null,
        icon,
        color,
        sort_order: editGroup?.sort_order ?? 0,
      };
      if (editGroup) {
        const { error } = await db.from('service_groups').update(payload).eq('id', editGroup.id);
        if (error) throw error;
        toast.success('Category updated');
      } else {
        const { error } = await db.from('service_groups').insert(payload);
        if (error) throw error;
        toast.success('Category created');
      }
      qc.invalidateQueries({ queryKey: ['service-groups'] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save category');
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
        <h2 className="text-lg font-bold font-heading">
          {editGroup ? 'Edit Category' : 'Add Category'}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
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

      {/* Body — 2 columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — form */}
        <div className="w-1/2 border-r overflow-y-auto px-8 py-6 space-y-6" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Name <span className="text-red-500">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Screen Printing"
              className="text-base h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this service category…"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Icon</Label>
            <IconPicker value={icon} onChange={setIcon} color={color} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>

        {/* Right — live preview */}
        <div
          className="w-1/2 overflow-y-auto px-8 py-6"
          style={{ backgroundColor: 'hsl(var(--muted))' }}
        >
          <GroupPreviewCard name={name} description={description} icon={icon} color={color} />
        </div>
      </div>
    </div>
  );
}

// ── Fullscreen Item Modal ─────────────────────────────────────────────────────

interface ItemModalProps {
  open: boolean;
  onClose: () => void;
  groups: ServiceGroupWithItems[];
  defaultGroupId: string;
  editItem?: ServiceItemWithTiers | null;
}

function ItemModal({ open, onClose, groups, defaultGroupId, editItem }: ItemModalProps) {
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pricingType, setPricingType] = useState<'moq' | 'flat'>('moq');
  const [flatPrice, setFlatPrice] = useState('');
  const [tiers, setTiers] = useState<TierRow[]>(DEFAULT_TIERS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGroupId(defaultGroupId);
    if (editItem) {
      setName(editItem.name);
      setDescription(editItem.description ?? '');
      setIcon(editItem.icon ?? '');
      setColor(editItem.color ?? '');
      setImageUrl(editItem.image_url ?? '');
      setPricingType(editItem.pricing_type);
      setFlatPrice(editItem.flat_price != null ? String(editItem.flat_price) : '');
      setTiers(
        editItem.tiers.length
          ? editItem.tiers.map((t) => ({
              min_qty: String(t.min_qty),
              max_qty: t.max_qty != null ? String(t.max_qty) : '',
              price_per_unit: String(t.price_per_unit),
            }))
          : DEFAULT_TIERS
      );
    } else {
      setName(''); setDescription(''); setIcon(''); setColor('');
      setImageUrl(''); setPricingType('moq'); setFlatPrice('');
      setTiers(DEFAULT_TIERS);
    }
  }, [open, editItem, defaultGroupId]);

  const updateTier = (i: number, key: keyof TierRow, val: string) => {
    setTiers((prev) => prev.map((t, idx) => idx === i ? { ...t, [key]: val } : t));
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (pricingType === 'flat' && !flatPrice) { toast.error('Enter a flat price'); return; }
    if (pricingType === 'moq' && tiers.some((t) => !t.min_qty || !t.price_per_unit)) {
      toast.error('Fill in all tier quantities and prices'); return;
    }
    setSaving(true);
    try {
      const itemPayload: ServiceItemInsert = {
        group_id: groupId,
        name: name.trim(),
        description: description.trim() || null,
        pricing_type: pricingType,
        flat_price: pricingType === 'flat' ? parseFloat(flatPrice) : null,
        icon: icon || null,
        color: color || null,
        image_url: imageUrl.trim() || null,
        sort_order: editItem?.sort_order ?? 0,
      };

      let itemId = editItem?.id;
      if (editItem) {
        const { error } = await db.from('service_items').update(itemPayload).eq('id', editItem.id);
        if (error) throw error;
        await db.from('service_item_tiers').delete().eq('item_id', editItem.id);
      } else {
        const { data, error } = await db.from('service_items').insert(itemPayload).select('id').single();
        if (error) throw error;
        itemId = data.id;
      }

      if (pricingType === 'moq' && itemId) {
        const tierRows: ServiceItemTierInsert[] = tiers
          .filter((t) => t.min_qty && t.price_per_unit)
          .map((t) => ({
            item_id: itemId!,
            min_qty: parseInt(t.min_qty),
            max_qty: t.max_qty ? parseInt(t.max_qty) : null,
            price_per_unit: parseFloat(t.price_per_unit),
          }));
        if (tierRows.length) {
          const { error } = await db.from('service_item_tiers').insert(tierRows);
          if (error) throw error;
        }
      }

      toast.success(editItem ? 'Item updated' : 'Item created');
      qc.invalidateQueries({ queryKey: ['service-groups'] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const activeGroup = groups.find((g) => g.id === groupId) ?? groups[0];
  const effectiveIcon = icon || activeGroup?.icon || 'Layers';
  const effectiveColor = color || activeGroup?.color || '#2E7CF6';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-6 shrink-0 border-b"
        style={{ height: 56, borderColor: 'hsl(var(--border))' }}
      >
        <h2 className="text-lg font-bold font-heading">
          {editItem ? 'Edit Service Item' : 'Add Service Item'}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
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

      {/* Body — 2 columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left form panel (420px) */}
        <div
          className="shrink-0 border-r overflow-y-auto px-6 py-6 space-y-5"
          style={{ width: 420, borderColor: 'hsl(var(--border))' }}
        >
          {/* Group selector */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Group</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue placeholder="Select group…" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Name <span className="text-red-500">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Front Left Chest Print"
              className="text-base h-11"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Item description (optional)…"
              rows={2}
            />
          </div>

          {/* Pricing Type toggle */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Pricing Type</Label>
            <div className="flex gap-2">
              {(['moq', 'flat'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-colors"
                  style={{
                    backgroundColor: pricingType === type ? 'hsl(218 91% 57%)' : 'transparent',
                    color: pricingType === type ? 'white' : 'hsl(var(--foreground))',
                    borderColor: pricingType === type ? 'hsl(218 91% 57%)' : 'hsl(var(--border))',
                  }}
                  onClick={() => setPricingType(type)}
                >
                  {type === 'moq' ? 'MOQ Tiered' : 'Flat Rate'}
                </button>
              ))}
            </div>
          </div>

          {/* Flat Price */}
          {pricingType === 'flat' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Price per Unit ($)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={flatPrice}
                onChange={(e) => setFlatPrice(e.target.value)}
                placeholder="0.00"
                className="text-base h-11 max-w-48"
              />
            </div>
          )}

          {/* MOQ Tiers */}
          {pricingType === 'moq' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Price Tiers</Label>
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border font-medium transition-colors hover:bg-[hsl(var(--accent))]"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(218 91% 57%)' }}
                  onClick={() => setTiers(DEFAULT_TIERS)}
                >
                  Use 144/300/600/1200/2400
                </button>
              </div>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: 'hsl(var(--muted))' }}>
                    <tr>
                      {['Min Qty', 'Max Qty', '$/Unit', ''].map((h) => (
                        <th key={h} className="px-2 py-2 text-left text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                    {tiers.map((tier, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={1} className="h-7 w-16 text-xs" value={tier.min_qty} onChange={(e) => updateTier(i, 'min_qty', e.target.value)} placeholder="144" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={1} className="h-7 w-16 text-xs" value={tier.max_qty} onChange={(e) => updateTier(i, 'max_qty', e.target.value)} placeholder="∞" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={0} step={0.01} className="h-7 w-20 text-xs" value={tier.price_per_unit} onChange={(e) => updateTier(i, 'price_per_unit', e.target.value)} placeholder="0.00" />
                        </td>
                        <td className="px-2 py-1.5 w-8">
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6 text-red-500"
                            onClick={() => setTiers(tiers.filter((_, idx) => idx !== i))}
                            disabled={tiers.length === 1}
                            type="button"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                type="button" variant="outline" size="sm"
                onClick={() => setTiers([...tiers, { min_qty: '', max_qty: '', price_per_unit: '' }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add Tier
              </Button>
            </div>
          )}

          {/* Icon override */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Icon <span className="text-xs font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
              </Label>
              {icon && (
                <button type="button" className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }} onClick={() => setIcon('')}>
                  Clear
                </button>
              )}
            </div>
            <IconPicker value={effectiveIcon} onChange={(v) => setIcon(v === activeGroup?.icon ? '' : v)} color={effectiveColor} />
          </div>

          {/* Color override */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Color <span className="text-xs font-normal" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span>
              </Label>
              {color && (
                <button type="button" className="text-xs px-2 py-1 rounded border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }} onClick={() => setColor('')}>
                  Clear
                </button>
              )}
            </div>
            <ColorPicker value={effectiveColor} onChange={(v) => setColor(v)} />
          </div>

          {/* Image URL */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Image URL</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="preview"
                className="mt-2 h-20 w-20 rounded-lg object-cover border"
                style={{ borderColor: 'hsl(var(--border))' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>
        </div>

        {/* Right — live preview */}
        <div
          className="flex-1 overflow-y-auto px-8 py-6"
          style={{ backgroundColor: 'hsl(var(--muted))' }}
        >
          <ItemPreviewCard
            name={name}
            description={description}
            icon={effectiveIcon}
            color={effectiveColor}
            pricingType={pricingType}
            flatPrice={flatPrice}
            tiers={tiers}
            imageUrl={imageUrl}
          />
        </div>
      </div>
    </div>
  );
}

// ── Inline Tier Table ─────────────────────────────────────────────────────────

function TierTable({ tiers }: { tiers: ServiceItemTier[] }) {
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  return (
    <div className="mt-2 rounded-lg overflow-hidden" style={{ backgroundColor: 'hsl(var(--muted))' }}>
      <div
        className="grid px-4 py-2 text-xs font-semibold uppercase tracking-wider"
        style={{ gridTemplateColumns: '1fr 1fr 1fr', color: 'hsl(var(--muted-foreground))' }}
      >
        <span>Min Qty</span>
        <span>Max Qty</span>
        <span className="text-right">$/Unit</span>
      </div>
      {sorted.map((t, i) => (
        <div
          key={t.id}
          className="grid px-4 py-3 text-sm"
          style={{
            gridTemplateColumns: '1fr 1fr 1fr',
            backgroundColor: i % 2 === 0 ? 'hsl(var(--background))' : 'transparent',
          }}
        >
          <span className="font-medium">{t.min_qty.toLocaleString()}</span>
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t.max_qty != null ? t.max_qty.toLocaleString() : '∞'}
          </span>
          <span className="text-right font-bold" style={{ color: 'hsl(218 91% 57%)' }}>
            {formatCurrency(t.price_per_unit)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Item Row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item, groupIcon, groupColor, onEdit, onDelete,
}: {
  item: ServiceItemWithTiers;
  groupIcon: string;
  groupColor: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const effectiveIcon = item.icon ?? groupIcon;
  const effectiveColor = item.color ?? groupColor;

  const pricePreview = item.pricing_type === 'flat'
    ? (item.flat_price != null ? formatCurrency(item.flat_price) : '—')
    : item.tiers.length
      ? `${formatCurrency(Math.min(...item.tiers.map((t) => t.price_per_unit)))} – ${formatCurrency(Math.max(...item.tiers.map((t) => t.price_per_unit)))}`
      : 'No tiers';

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'hsl(var(--border))' }}>
      <div
        className="grid items-center px-4 py-3 hover:bg-[hsl(var(--accent))] transition-colors"
        style={{ gridTemplateColumns: '2rem 1fr 5rem 9rem 6rem', gap: '0.75rem' }}
      >
        {/* Icon */}
        <div
          className="flex items-center justify-center h-8 w-8 rounded-md"
          style={{ backgroundColor: `${effectiveColor}20` }}
        >
          <IconRenderer name={effectiveIcon} size={15} color={effectiveColor} />
        </div>
        {/* Name */}
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{item.name}</p>
          {item.description && (
            <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.description}</p>
          )}
        </div>
        {/* Type */}
        <div>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: item.pricing_type === 'moq' ? 'hsl(218 91% 57% / 0.12)' : 'hsl(152 74% 42% / 0.12)',
              color: item.pricing_type === 'moq' ? 'hsl(218 91% 57%)' : 'hsl(152 74% 28%)',
            }}
          >
            {item.pricing_type === 'moq' ? 'MOQ' : 'Flat'}
          </span>
        </div>
        {/* Price */}
        <div className="text-sm font-semibold text-right">{pricePreview}</div>
        {/* Actions */}
        <div className="flex items-center justify-end gap-1">
          {item.pricing_type === 'moq' && item.tiers.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)} type="button">
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} type="button">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={onDelete} type="button">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {expanded && item.pricing_type === 'moq' && (
        <div className="px-4 pb-3">
          <TierTable tiers={item.tiers} />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ServicesPage() {
  const qc = useQueryClient();
  const { data: groups = [], isLoading } = useServiceGroups();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<ServiceGroup | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<ServiceItemWithTiers | null>(null);

  useEffect(() => {
    if (!selectedGroupId && groups.length > 0) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this group and all its items?')) return;
    await db.from('service_groups').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['service-groups'] });
    toast.success('Group deleted');
    if (selectedGroupId === id) setSelectedGroupId(groups.find((g) => g.id !== id)?.id ?? null);
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    await db.from('service_item_tiers').delete().eq('item_id', id);
    await db.from('service_items').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['service-groups'] });
    toast.success('Item deleted');
  };

  return (
    <div className="animate-page-in h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-heading">Service Catalog</h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Manage your print shop service groups and pricing tiers.
        </p>
      </div>

      <div className="flex gap-0 border rounded-xl overflow-hidden" style={{ borderColor: 'hsl(var(--border))', minHeight: 540 }}>
        {/* Left Panel — Group List */}
        <div className="flex flex-col shrink-0 border-r" style={{ width: 240, borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center px-3 border-b shrink-0" style={{ height: 64, borderColor: 'hsl(var(--border))' }}>
            <Button
              size="sm" className="w-full"
              onClick={() => { setEditGroup(null); setGroupModalOpen(true); }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Group
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg">
                  <div className="skeleton-shimmer h-8 w-8 rounded-md" />
                  <div className="flex-1 space-y-1">
                    <div className="skeleton-shimmer h-3 w-24" />
                    <div className="skeleton-shimmer h-2.5 w-16" />
                  </div>
                </div>
              ))
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-2">
                <Layers className="h-8 w-8 mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>No groups yet. Create one to get started.</p>
              </div>
            ) : (
              groups.map((group) => {
                const isActive = selectedGroupId === group.id;
                return (
                  <div
                    key={group.id}
                    className="flex items-center gap-2 p-2 rounded-lg cursor-pointer group/card transition-colors"
                    style={{
                      backgroundColor: isActive ? `${group.color}18` : undefined,
                      border: isActive ? `1px solid ${group.color}40` : '1px solid transparent',
                    }}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <div
                      className="flex items-center justify-center h-8 w-8 rounded-md shrink-0"
                      style={{ backgroundColor: group.color }}
                    >
                      <IconRenderer name={group.icon} size={15} color="#fff" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{group.name}</p>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {group.items?.length ?? 0} item{(group.items?.length ?? 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-0.5">
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-[hsl(var(--accent))]"
                        onClick={(e) => { e.stopPropagation(); setEditGroup(group); setGroupModalOpen(true); }}
                      >
                        <Pencil className="h-3 w-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); deleteGroup(group.id); }}
                      >
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel — Items */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedGroup ? (
            <>
              <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center h-9 w-9 rounded-lg"
                    style={{ backgroundColor: selectedGroup.color }}
                  >
                    <IconRenderer name={selectedGroup.icon} size={17} color="#fff" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-base font-heading">{selectedGroup.name}</h2>
                    {selectedGroup.description && (
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{selectedGroup.description}</p>
                    )}
                  </div>
                </div>
                <Button size="sm" onClick={() => { setEditItem(null); setItemModalOpen(true); }}>
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
              </div>

              {selectedGroup.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-16">
                  <div
                    className="flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
                    style={{ backgroundColor: `${selectedGroup.color}15` }}
                  >
                    <IconRenderer name={selectedGroup.icon} size={28} color={selectedGroup.color} />
                  </div>
                  <p className="font-semibold">No items in {selectedGroup.name}</p>
                  <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Add your first service item to start building your price list.
                  </p>
                  <Button className="mt-4" size="sm" onClick={() => { setEditItem(null); setItemModalOpen(true); }}>
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </Button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div
                    className="grid px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b"
                    style={{
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--muted-foreground))',
                      backgroundColor: 'hsl(var(--muted))',
                      gridTemplateColumns: '2rem 1fr 5rem 9rem 6rem',
                      gap: '0.75rem',
                    }}
                  >
                    <span />
                    <span>Name</span>
                    <span>Type</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">Actions</span>
                  </div>
                  {selectedGroup.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      groupIcon={selectedGroup.icon}
                      groupColor={selectedGroup.color}
                      onEdit={() => { setEditItem(item); setItemModalOpen(true); }}
                      onDelete={() => deleteItem(item.id)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-6">
              {isLoading ? (
                <div className="space-y-3 w-full max-w-xs">
                  <div className="skeleton-shimmer h-8 w-48 mx-auto" />
                  <div className="skeleton-shimmer h-4 w-64 mx-auto" />
                </div>
              ) : (
                <>
                  <Layers className="h-12 w-12 mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
                  <p className="font-semibold">Select a group</p>
                  <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Choose a service group on the left to view its items.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Modals (rendered outside the card) */}
      <GroupModal
        open={groupModalOpen}
        onClose={() => { setGroupModalOpen(false); setEditGroup(null); }}
        editGroup={editGroup}
      />
      <ItemModal
        open={itemModalOpen}
        onClose={() => { setItemModalOpen(false); setEditItem(null); }}
        groups={groups}
        defaultGroupId={selectedGroupId ?? groups[0]?.id ?? ''}
        editItem={editItem}
      />
    </div>
  );
}
