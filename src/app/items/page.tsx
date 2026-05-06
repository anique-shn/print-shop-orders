'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2, Package, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Item, ItemVariant, VariantPricing } from '@/types/database';

const CATEGORIES = [
  'Screen Printing', 'Embroidery', 'DTG', 'DTF',
  'Vinyl', 'Sublimation', 'Other',
];

// ── Types ────────────────────────────────────────────────────────────────────

type ItemWithVariants = Item & {
  item_variants?: (ItemVariant & { item_variant_pricing?: VariantPricing[] })[];
};

interface PricingRow {
  id?: string;
  min_qty: number;
  max_qty: number | null;
  price_per_unit: number;
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('*, item_variants(*, item_variant_pricing(*))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ItemWithVariants[];
    },
  });
}

// ── Item Form Modal ───────────────────────────────────────────────────────────

function ItemModal({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item?: Item | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? '');
  const [saving, setSaving] = useState(false);

  const handleOpen = (o: boolean) => {
    if (o) {
      setName(item?.name ?? '');
      setDescription(item?.description ?? '');
      setCategory(item?.category ?? '');
      setImageUrl(item?.image_url ?? '');
    }
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (item) {
        const { error } = await db
          .from('items')
          .update({ name, description: description || null, category: category || null, image_url: imageUrl || null })
          .eq('id', item.id);
        if (error) throw error;
        toast.success('Item updated');
      } else {
        const { error } = await db
          .from('items')
          .insert({ name, description: description || null, category: category || null, image_url: imageUrl || null });
        if (error) throw error;
        toast.success('Item created');
      }
      qc.invalidateQueries({ queryKey: ['items'] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { handleOpen(o); if (!o) onClose(); }}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Item' : 'New Item'}</DialogTitle>
          <DialogDescription>
            {item ? 'Update item details below.' : 'Add a new catalog item.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-2">
          <div className="space-y-1.5">
            <Label htmlFor="item-name">Name <span className="text-red-500">*</span></Label>
            <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gildan 5000 Tee" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-cat">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="item-cat"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-desc">Description</Label>
            <Textarea id="item-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-img">Image URL</Label>
            <Input id="item-img" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : item ? 'Save Changes' : 'Create Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Variant Modal ─────────────────────────────────────────────────────────────

function VariantModal({
  open,
  onClose,
  itemId,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  itemId: string;
  variant?: ItemVariant & { item_variant_pricing?: VariantPricing[] };
}) {
  const qc = useQueryClient();
  const [vName, setVName] = useState(variant?.name ?? '');
  const [vDesc, setVDesc] = useState(variant?.description ?? '');
  const [pricing, setPricing] = useState<PricingRow[]>(
    variant?.item_variant_pricing?.map((p) => ({
      id: p.id,
      min_qty: p.min_qty,
      max_qty: p.max_qty,
      price_per_unit: p.price_per_unit,
    })) ?? [{ min_qty: 1, max_qty: null, price_per_unit: 0 }]
  );
  const [saving, setSaving] = useState(false);

  const addRow = () => setPricing([...pricing, { min_qty: 1, max_qty: null, price_per_unit: 0 }]);
  const removeRow = (i: number) => setPricing(pricing.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: keyof PricingRow, val: string) => {
    setPricing(pricing.map((r, idx) => {
      if (idx !== i) return r;
      if (key === 'max_qty') return { ...r, max_qty: val === '' ? null : Number(val) };
      return { ...r, [key]: key === 'price_per_unit' ? parseFloat(val) || 0 : Number(val) || 0 };
    }));
  };

  const save = async () => {
    if (!vName.trim()) { toast.error('Variant name is required'); return; }
    setSaving(true);
    try {
      let variantId = variant?.id;
      if (variant) {
        const { error } = await db.from('item_variants')
          .update({ name: vName, description: vDesc || null })
          .eq('id', variant.id);
        if (error) throw error;
        await db.from('item_variant_pricing').delete().eq('variant_id', variant.id);
      } else {
        const { data, error } = await db.from('item_variants')
          .insert({ item_id: itemId, name: vName, description: vDesc || null })
          .select('id').single();
        if (error) throw error;
        variantId = data.id;
      }
      if (pricing.length > 0 && variantId) {
        const rows = pricing.map((p) => ({
          variant_id: variantId!,
          min_qty: p.min_qty,
          max_qty: p.max_qty,
          price_per_unit: p.price_per_unit,
        }));
        const { error } = await db.from('item_variant_pricing').insert(rows);
        if (error) throw error;
      }
      toast.success(variant ? 'Variant updated' : 'Variant added');
      qc.invalidateQueries({ queryKey: ['items'] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle>{variant ? 'Edit Variant' : 'Add Variant'}</DialogTitle>
          <DialogDescription>Configure variant details and MOQ pricing tiers.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Variant Name <span className="text-red-500">*</span></Label>
              <Input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="e.g. White / S-XL" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={vDesc} onChange={(e) => setVDesc(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Pricing Tiers</Label>
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" /> Add Tier
              </Button>
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: 'hsl(var(--muted))' }}>
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Min Qty</th>
                    <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Max Qty</th>
                    <th className="px-3 py-2 text-left font-medium text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Price / Unit</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                  {pricing.map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min={1} value={row.min_qty}
                          onChange={(e) => updateRow(i, 'min_qty', e.target.value)}
                          className="h-7 w-20"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min={1}
                          value={row.max_qty ?? ''}
                          placeholder="∞"
                          onChange={(e) => updateRow(i, 'max_qty', e.target.value)}
                          className="h-7 w-20"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min={0} step={0.01}
                          value={row.price_per_unit}
                          onChange={(e) => updateRow(i, 'price_per_unit', e.target.value)}
                          className="h-7 w-24"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-700"
                          onClick={() => removeRow(i)}
                          disabled={pricing.length === 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : variant ? 'Save Changes' : 'Add Variant'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Expanded row ──────────────────────────────────────────────────────────────

function ItemVariantsRow({
  item,
  onAddVariant,
}: {
  item: ItemWithVariants;
  onAddVariant: (item: ItemWithVariants) => void;
}) {
  const qc = useQueryClient();
  const [editVariant, setEditVariant] = useState<(ItemVariant & { item_variant_pricing?: VariantPricing[] }) | null>(null);

  const deleteVariant = async (id: string) => {
    if (!confirm('Delete this variant?')) return;
    await db.from('item_variants').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['items'] });
    toast.success('Variant deleted');
  };

  return (
    <tr>
      <td colSpan={5} className="px-6 pb-4 pt-0">
        <div
          className="rounded-lg border p-4"
          style={{ backgroundColor: 'hsl(var(--muted))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Variants & Pricing
            </p>
            <Button size="sm" variant="outline" onClick={() => onAddVariant(item)}>
              <Plus className="h-3.5 w-3.5" /> Add Variant
            </Button>
          </div>

          {!item.item_variants?.length ? (
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              No variants yet. Add a variant with pricing tiers.
            </p>
          ) : (
            <div className="space-y-3">
              {item.item_variants.map((v) => (
                <div key={v.id} className="rounded-md border bg-white p-3" style={{ borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium text-sm">{v.name}</span>
                      {v.description && (
                        <span className="ml-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{v.description}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setEditVariant(v as ItemVariant & { item_variant_pricing?: VariantPricing[] })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                        onClick={() => deleteVariant(v.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {v.item_variant_pricing && v.item_variant_pricing.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {v.item_variant_pricing.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: 'hsl(218 91% 57% / 0.1)', color: 'hsl(218, 91%, 57%)' }}
                        >
                          {p.min_qty}{p.max_qty ? `–${p.max_qty}` : '+'} pcs → ${p.price_per_unit.toFixed(2)}/ea
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {editVariant && (
          <VariantModal
            open
            onClose={() => setEditVariant(null)}
            itemId={item.id}
            variant={editVariant}
          />
        )}
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ItemsPage() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useItems();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [addVariantItem, setAddVariantItem] = useState<ItemWithVariants | null>(null);

  const categories = ['all', ...Array.from(new Set(items.map((i) => i.category).filter(Boolean) as string[]))];

  const filtered = categoryFilter === 'all'
    ? items
    : items.filter((i) => i.category === categoryFilter);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item and all its variants?')) return;
    await db.from('items').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['items'] });
    toast.success('Item deleted');
  };

  return (
    <div className="animate-page-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">Items Catalog</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Manage your print shop&apos;s products, variants, and MOQ pricing.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Item
        </Button>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors border',
              categoryFilter === cat
                ? 'text-white border-transparent'
                : 'border-[hsl(var(--border))] bg-white hover:bg-[hsl(var(--accent))]'
            )}
            style={
              categoryFilter === cat
                ? { backgroundColor: 'hsl(218, 91%, 57%)', borderColor: 'transparent' }
                : undefined
            }
          >
            {cat === 'all' ? 'All Categories' : cat}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-0 divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="skeleton-shimmer h-10 w-10 rounded-lg" />
                  <div className="skeleton-shimmer h-4 w-40 flex-1" />
                  <div className="skeleton-shimmer h-5 w-24 rounded-full" />
                  <div className="skeleton-shimmer h-4 w-16" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="mb-3 h-10 w-10" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="font-medium">No items found</p>
              <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {categoryFilter !== 'all' ? 'Try a different category filter.' : 'Add your first catalog item to get started.'}
              </p>
              {categoryFilter === 'all' && (
                <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> New Item
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  {['', 'Image', 'Name', 'Category', 'Variants', 'Actions'].map((h, i) => (
                    <th
                      key={i}
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const expanded = expandedIds.has(item.id);
                  return (
                    <>
                      <tr
                        key={item.id}
                        className="transition-colors cursor-pointer"
                        style={{ borderBottom: expanded ? 'none' : '1px solid hsl(var(--border))' }}
                        onClick={() => toggleExpand(item.id)}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'hsl(var(--accent))')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                      >
                        <td className="pl-4 pr-2 py-4 w-8">
                          {expanded
                            ? <ChevronDown className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                            : <ChevronRight className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                          }
                        </td>
                        <td className="px-4 py-4 w-16">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="h-10 w-10 rounded-lg object-cover border" style={{ borderColor: 'hsl(var(--border))' }} />
                          ) : (
                            <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                              <ImageIcon className="h-5 w-5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium text-sm">{item.name}</div>
                          {item.description && (
                            <div className="text-xs mt-0.5 line-clamp-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{item.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {item.category ? (
                            <Badge variant="secondary">{item.category}</Badge>
                          ) : (
                            <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-medium">{item.item_variants?.length ?? 0}</span>
                          <span className="text-xs ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>variants</span>
                        </td>
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              onClick={(e) => { e.stopPropagation(); setEditItem(item); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700"
                              onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <ItemVariantsRow
                          key={`${item.id}-variants`}
                          item={item}
                          onAddVariant={(i) => setAddVariantItem(i)}
                        />
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Modals */}
      <ItemModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editItem && (
        <ItemModal open onClose={() => setEditItem(null)} item={editItem} />
      )}
      {addVariantItem && (
        <VariantModal
          open
          onClose={() => setAddVariantItem(null)}
          itemId={addVariantItem.id}
        />
      )}
    </div>
  );
}
