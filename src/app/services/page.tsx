'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, Layers,
  Tag, Settings, Package, Scissors, Ticket, Droplets, Shirt,
  Printer, Paintbrush, Palette, Wrench, Zap, Star, Circle,
  Hash, Box, Truck, Award, Grid3x3, ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import type {
  ServiceGroup, ServiceGroupInsert, ServiceItem, ServiceItemInsert,
  ServiceItemTier, ServiceItemTierInsert, ServiceGroupWithItems, ServiceItemWithTiers,
} from '@/types/database';

// ── Icon Map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Layers, Tag, Settings, Package, Scissors, Ticket, Droplets, Shirt,
  Printer, Paintbrush, Palette, Wrench, Zap, Star, Circle,
  Hash, Box, Truck, Award, Grid3x3,
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

// ── Color Picker Sub-component ────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(
    PRESET_COLORS.some((c) => c.hex.toLowerCase() === value.toLowerCase()) ? '' : value
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.label}
            className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: c.hex,
              borderColor: value.toLowerCase() === c.hex.toLowerCase() ? '#000' : 'transparent',
            }}
            onClick={() => { onChange(c.hex); setCustom(''); }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => { onChange(e.target.value); setCustom(e.target.value); }}
          className="h-7 w-7 rounded cursor-pointer border border-[hsl(var(--border))]"
        />
        <Input
          placeholder="#HEX color"
          value={custom}
          onChange={(e) => { setCustom(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) onChange(e.target.value); }}
          className="h-7 text-xs w-32"
        />
      </div>
    </div>
  );
}

// ── Icon Picker Sub-component ─────────────────────────────────────────────────

function IconPicker({ value, onChange, color }: { value: string; onChange: (v: string) => void; color?: string }) {
  return (
    <div className="grid grid-cols-10 gap-1">
      {ICON_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          title={name}
          className="flex items-center justify-center h-8 w-8 rounded-md border transition-colors hover:bg-[hsl(var(--accent))]"
          style={{
            borderColor: value === name ? color ?? 'hsl(var(--brand))' : 'transparent',
            backgroundColor: value === name ? `${color ?? '#2E7CF6'}22` : undefined,
          }}
          onClick={() => onChange(name)}
        >
          <IconRenderer name={name} size={16} color={value === name ? color : 'hsl(var(--muted-foreground))'} />
        </button>
      ))}
    </div>
  );
}

// ── Group Modal ───────────────────────────────────────────────────────────────

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
        toast.success('Group updated');
      } else {
        const { error } = await db.from('service_groups').insert(payload);
        if (error) throw error;
        toast.success('Group created');
      }
      qc.invalidateQueries({ queryKey: ['service-groups'] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[480px] w-full">
        <DialogHeader>
          <DialogTitle>{editGroup ? 'Edit Group' : 'New Service Group'}</DialogTitle>
          <DialogDescription>
            Groups organize your services in the catalog.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2 space-y-4">
          {/* Preview */}
          <div
            className="flex items-center gap-3 p-4 rounded-xl border"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: `${color}12` }}
          >
            <div
              className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0"
              style={{ backgroundColor: color }}
            >
              <IconRenderer name={icon} size={20} color="#fff" />
            </div>
            <div>
              <p className="font-semibold text-sm">{name || 'Group Name'}</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{description || 'No description'}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Screen Printing" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this service group…" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <IconPicker value={icon} onChange={setIcon} color={color} />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editGroup ? 'Save Changes' : 'Create Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Tier Row ──────────────────────────────────────────────────────────────────

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

// ── Item Modal ────────────────────────────────────────────────────────────────

interface ItemModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupIcon: string;
  groupColor: string;
  editItem?: ServiceItemWithTiers | null;
}

function ItemModal({ open, onClose, groupId, groupIcon, groupColor, editItem }: ItemModalProps) {
  const qc = useQueryClient();
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
  }, [open, editItem]);

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
        // Delete existing tiers and re-insert
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

  const effectiveIcon = icon || groupIcon;
  const effectiveColor = color || groupColor;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[720px] w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editItem ? 'Edit Service Item' : 'New Service Item'}</DialogTitle>
          <DialogDescription>Configure item details and pricing.</DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2 space-y-5">
          {/* Preview */}
          <div
            className="flex items-center gap-3 p-4 rounded-xl border"
            style={{ borderColor: 'hsl(var(--border))', backgroundColor: `${effectiveColor}10` }}
          >
            <div
              className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0"
              style={{ backgroundColor: effectiveColor }}
            >
              <IconRenderer name={effectiveIcon} size={20} color="#fff" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{name || 'Item Name'}</p>
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {pricingType === 'flat'
                  ? flatPrice ? `Flat: ${formatCurrency(parseFloat(flatPrice))}` : 'Flat Rate'
                  : 'MOQ Tiered Pricing'}
              </p>
            </div>
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Preview" className="h-10 w-10 rounded object-cover border" style={{ borderColor: 'hsl(var(--border))' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
          </div>

          {/* Name + Description */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Front Left Chest Print" />
            </div>
            <div className="space-y-1.5">
              <Label>Image URL</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Item description (optional)…" rows={2} />
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <Label>Icon <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional — uses group icon if blank)</span></Label>
            <div className="flex items-center gap-2 mb-2">
              {icon && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                  onClick={() => setIcon('')}
                >
                  Clear (use group icon)
                </button>
              )}
            </div>
            <IconPicker value={icon || groupIcon} onChange={(v) => setIcon(v === groupIcon ? '' : v)} color={effectiveColor} />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>(optional — uses group color if blank)</span></Label>
            <div className="flex items-center gap-2 mb-2">
              {color && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                  onClick={() => setColor('')}
                >
                  Clear (use group color)
                </button>
              )}
            </div>
            <ColorPicker value={effectiveColor} onChange={(v) => setColor(v)} />
          </div>

          {/* Pricing Type */}
          <div className="space-y-2">
            <Label>Pricing Type</Label>
            <div className="flex gap-2">
              {(['moq', 'flat'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
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
              <Label>Price per unit ($)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={flatPrice}
                onChange={(e) => setFlatPrice(e.target.value)}
                placeholder="0.00"
                className="max-w-xs"
              />
            </div>
          )}

          {/* MOQ Tiers */}
          {pricingType === 'moq' && (
            <div className="space-y-2">
              <Label>Price Tiers</Label>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: 'hsl(var(--muted))' }}>
                    <tr>
                      {['Min Qty', 'Max Qty (blank = unlimited)', '$/Unit', ''].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                    {tiers.map((tier, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={1}
                            className="h-7 w-20 text-xs"
                            value={tier.min_qty}
                            onChange={(e) => updateTier(i, 'min_qty', e.target.value)}
                            placeholder="144"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={1}
                            className="h-7 w-24 text-xs"
                            value={tier.max_qty}
                            onChange={(e) => updateTier(i, 'max_qty', e.target.value)}
                            placeholder="∞"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            className="h-7 w-24 text-xs"
                            value={tier.price_per_unit}
                            onChange={(e) => updateTier(i, 'price_per_unit', e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-2 py-1.5 w-8">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-500"
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
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTiers([...tiers, { min_qty: '', max_qty: '', price_per_unit: '' }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add Tier
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
          <Button onClick={save} disabled={saving} type="button">
            {saving ? 'Saving…' : editItem ? 'Save Changes' : 'Create Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Inline Item Tier Preview ──────────────────────────────────────────────────

function TierTable({ tiers }: { tiers: ServiceItemTier[] }) {
  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  return (
    <div className="mt-2 rounded-md overflow-hidden border" style={{ borderColor: 'hsl(var(--border))' }}>
      <table className="w-full text-xs">
        <thead style={{ backgroundColor: 'hsl(var(--muted))' }}>
          <tr>
            <th className="px-3 py-1.5 text-left font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Min Qty</th>
            <th className="px-3 py-1.5 text-left font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>Max Qty</th>
            <th className="px-3 py-1.5 text-right font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>$/Unit</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
          {sorted.map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-1.5">{t.min_qty.toLocaleString()}</td>
              <td className="px-3 py-1.5">{t.max_qty != null ? t.max_qty.toLocaleString() : '∞'}</td>
              <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(t.price_per_unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Item Row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  groupIcon,
  groupColor,
  onEdit,
  onDelete,
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
    ? item.flat_price != null ? formatCurrency(item.flat_price) : '—'
    : item.tiers.length
      ? `${formatCurrency(Math.min(...item.tiers.map((t) => t.price_per_unit)))} – ${formatCurrency(Math.max(...item.tiers.map((t) => t.price_per_unit)))}`
      : 'No tiers';

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'hsl(var(--border))' }}>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-[hsl(var(--accent))] transition-colors"
      >
        {/* Icon dot */}
        <div
          className="flex items-center justify-center h-8 w-8 rounded-md shrink-0"
          style={{ backgroundColor: `${effectiveColor}20` }}
        >
          <IconRenderer name={effectiveIcon} size={15} color={effectiveColor} />
        </div>

        {/* Name + desc */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{item.name}</p>
          {item.description && (
            <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.description}</p>
          )}
        </div>

        {/* Badge */}
        <span
          className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: item.pricing_type === 'moq' ? 'hsl(218 91% 57% / 0.12)' : 'hsl(152 74% 42% / 0.12)',
            color: item.pricing_type === 'moq' ? 'hsl(218 91% 57%)' : 'hsl(152 74% 28%)',
          }}
        >
          {item.pricing_type === 'moq' ? 'MOQ' : 'Flat'}
        </span>

        {/* Price preview */}
        <span className="shrink-0 text-sm font-semibold w-36 text-right">{pricePreview}</span>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1">
          {item.pricing_type === 'moq' && item.tiers.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}
              type="button"
            >
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

      {/* Expanded tier table */}
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

  // Auto-select first group
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
        <div
          className="flex flex-col shrink-0 border-r"
          style={{ width: 240, borderColor: 'hsl(var(--border))' }}
        >
          {/* Add Group button */}
          <div className="p-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <Button
              size="sm"
              className="w-full"
              onClick={() => { setEditGroup(null); setGroupModalOpen(true); }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Group
            </Button>
          </div>

          {/* Groups */}
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
                    {/* Edit/delete appear on hover */}
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
              {/* Panel Header */}
              <div
                className="flex items-center justify-between px-5 py-3.5 border-b"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
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
                <Button
                  size="sm"
                  onClick={() => { setEditItem(null); setItemModalOpen(true); }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
              </div>

              {/* Items List */}
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
                  <Button
                    className="mt-4"
                    size="sm"
                    onClick={() => { setEditItem(null); setItemModalOpen(true); }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </Button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {/* Table header */}
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

      {/* Modals */}
      <GroupModal
        open={groupModalOpen}
        onClose={() => { setGroupModalOpen(false); setEditGroup(null); }}
        editGroup={editGroup}
      />
      {selectedGroup && (
        <ItemModal
          open={itemModalOpen}
          onClose={() => { setItemModalOpen(false); setEditItem(null); }}
          groupId={selectedGroup.id}
          groupIcon={selectedGroup.icon}
          groupColor={selectedGroup.color}
          editItem={editItem}
        />
      )}
    </div>
  );
}
