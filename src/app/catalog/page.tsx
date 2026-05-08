'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Save, X, Shirt, Check,
  ChevronDown, ChevronUp, Printer, Scissors, Brush,
  Droplets, Pen, Layers, Package, Paintbrush,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type {
  Garment, DecorationGroup, DecorationMatrixRow, FinishingService,
} from '@/types/database';

// ── Shared constants ──────────────────────────────────────────────────────────

type Tab = 'garments' | 'decorations' | 'finishing';

const TABS: { id: Tab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'garments',    label: 'Garments',    icon: Shirt,    description: 'Blank garment catalog — brands, styles, colors, costs and markup' },
  { id: 'decorations', label: 'Decorations', icon: Printer,  description: 'Decoration groups with quantity-tier pricing matrices (Screen Print, Embroidery, DTG…)' },
  { id: 'finishing',   label: 'Finishing',   icon: Package,  description: 'Per-piece finishing services grouped by category' },
];

const ICON_OPTIONS = [
  { value: 'Printer',    icon: Printer },
  { value: 'Scissors',   icon: Scissors },
  { value: 'Brush',      icon: Brush },
  { value: 'Droplets',   icon: Droplets },
  { value: 'Pen',        icon: Pen },
  { value: 'Layers',     icon: Layers },
  { value: 'Package',    icon: Package },
  { value: 'Paintbrush', icon: Paintbrush },
];

const COLOR_PRESETS = [
  '#2E7CF6', '#7C3AED', '#059669', '#DC2626',
  '#D97706', '#0891B2', '#DB2777', '#374151',
];

const GARMENT_CATEGORIES = ['T-Shirt', 'Polo', 'Long Sleeve', 'Hoodie', 'Crewneck', 'Tank Top', 'Headwear', 'Bag', 'Outerwear', 'Performance'];

function iconComponent(name: string) {
  return ICON_OPTIONS.find((i) => i.value === name)?.icon ?? Printer;
}

// ── Garments Tab ──────────────────────────────────────────────────────────────

const ALL_UPCHARGE_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

function GarmentFormDialog({ open, garment, onClose, onSave }: {
  open: boolean; garment: Garment | null; onClose: () => void; onSave: () => void;
}) {
  const isEdit = !!garment;
  const [brand, setBrand] = useState(garment?.brand ?? '');
  const [styleNumber, setStyleNumber] = useState(garment?.style_number ?? '');
  const [name, setName] = useState(garment?.name ?? '');
  const [category, setCategory] = useState(garment?.category ?? 'T-Shirt');
  const [color, setColor] = useState(garment?.color ?? '');
  const [baseCost, setBaseCost] = useState(garment?.base_cost?.toString() ?? '');
  const [markup, setMarkup] = useState(String(Math.round((garment?.markup_value ?? 0.40) * 100)));
  const [upcharges, setUpcharges] = useState<Record<string, string>>(
    Object.fromEntries(
      ALL_UPCHARGE_SIZES.map((s) => [s, String((garment?.size_upcharges?.[s] as number | undefined) ?? '')])
    )
  );
  const [saving, setSaving] = useState(false);

  // Re-sync when garment prop changes (open for different garment)
  useEffect(() => {
    setBrand(garment?.brand ?? '');
    setStyleNumber(garment?.style_number ?? '');
    setName(garment?.name ?? '');
    setCategory(garment?.category ?? 'T-Shirt');
    setColor(garment?.color ?? '');
    setBaseCost(garment?.base_cost?.toString() ?? '');
    setMarkup(String(Math.round((garment?.markup_value ?? 0.40) * 100)));
    setUpcharges(
      Object.fromEntries(
        ALL_UPCHARGE_SIZES.map((s) => [s, String((garment?.size_upcharges?.[s] as number | undefined) ?? '')])
      )
    );
  }, [garment]);

  const sellPrice = useMemo(() => {
    const cost = parseFloat(baseCost) || 0;
    const m = (parseFloat(markup) || 0) / 100;
    return cost > 0 ? cost * (1 + m) : null;
  }, [baseCost, markup]);

  const handleSave = async () => {
    if (!name.trim() || !brand.trim()) { toast.error('Brand and name are required'); return; }
    setSaving(true);
    try {
      const size_upcharges = Object.fromEntries(
        Object.entries(upcharges)
          .map(([k, v]) => [k, parseFloat(v) || 0])
          .filter(([, v]) => (v as number) > 0)
      );
      const payload = {
        brand: brand.trim(), style_number: styleNumber.trim() || null, name: name.trim(),
        category: category || null, color: color.trim() || null,
        base_cost: parseFloat(baseCost) || 0,
        size_upcharges,
        markup_value: (parseFloat(markup) || 40) / 100, active: true,
      };
      if (isEdit) {
        const { error } = await db.from('garments').update(payload).eq('id', garment!.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('garments').insert(payload);
        if (error) throw error;
      }
      toast.success(isEdit ? 'Garment updated' : 'Garment added');
      onSave(); onClose();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Garment' : 'Add Garment'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-2">

          {/* Brand + Style */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Brand <span className="text-red-500">*</span></Label>
              <Input className="h-8 text-sm" placeholder="Gildan, Bella+Canvas…" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Style Number</Label>
              <Input className="h-8 text-sm" placeholder="G500, BC3001…" value={styleNumber} onChange={(e) => setStyleNumber(e.target.value)} />
            </div>
          </div>

          {/* Full name */}
          <div className="space-y-1">
            <Label className="text-xs">Full Name <span className="text-red-500">*</span></Label>
            <Input className="h-8 text-sm" placeholder="Gildan 5000 Heavy Cotton T-Shirt" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Category + Color */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{GARMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <Input className="h-8 text-sm" placeholder="Black, White, Navy…" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>

          {/* Base cost + Markup */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Base Cost / pc</Label>
              <div className="flex">
                <span className="h-8 flex items-center px-2.5 text-sm border-y border-l rounded-l-md" style={{ borderColor: 'rgba(0,0,0,0.08)', backgroundColor: 'hsl(var(--muted))' }}>$</span>
                <Input className="h-8 text-sm rounded-l-none" type="number" min="0" step="0.01" placeholder="0.00" value={baseCost} onChange={(e) => setBaseCost(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default Markup %</Label>
              <div className="flex">
                <Input className="h-8 text-sm rounded-r-none" type="number" min="0" max="500" placeholder="40" value={markup} onChange={(e) => setMarkup(e.target.value)} />
                <span className="h-8 flex items-center px-2.5 text-sm border-y border-r rounded-r-md" style={{ borderColor: 'rgba(0,0,0,0.08)', backgroundColor: 'hsl(var(--muted))' }}>%</span>
              </div>
              {sellPrice !== null && (
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Sell price: <strong>{formatCurrency(sellPrice)}</strong> / pc
                </p>
              )}
            </div>
          </div>

          {/* Size upcharges */}
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Size Upcharges</Label>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Added on top of base cost for oversized garments. Leave blank for no upcharge.
              </p>
            </div>
            <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'hsl(var(--muted)/0.3)' }}>
              <div className="grid grid-cols-9 gap-2">
                {ALL_UPCHARGE_SIZES.map((size) => {
                  const val = upcharges[size] ?? '';
                  const hasVal = parseFloat(val) > 0;
                  return (
                    <div key={size} className="flex flex-col items-center gap-1">
                      <span
                        className="text-xs font-semibold"
                        style={{ color: hasVal ? 'hsl(218 91% 57%)' : 'hsl(var(--muted-foreground))' }}
                      >
                        {size}
                      </span>
                      <div className="flex flex-col items-center">
                        <span className="text-xs mb-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>+$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          placeholder="0"
                          value={val}
                          onChange={(e) => setUpcharges((prev) => ({ ...prev, [size]: e.target.value }))}
                          className="w-full h-8 rounded-md text-center text-sm font-medium outline-none transition-colors focus:ring-1"
                          style={{
                            border: `1px solid ${hasVal ? 'hsl(218 91% 57% / 0.4)' : 'rgba(0,0,0,0.08)'}`,
                            backgroundColor: hasVal ? 'hsl(218 91% 57% / 0.06)' : 'white',
                            color: hasVal ? 'hsl(218 91% 57%)' : 'inherit',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {Object.entries(upcharges).some(([, v]) => parseFloat(v) > 0) && (
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Upcharges set:{' '}
                  {Object.entries(upcharges)
                    .filter(([, v]) => parseFloat(v) > 0)
                    .map(([k, v]) => `${k} +$${parseFloat(v).toFixed(2)}`)
                    .join('  ·  ')}
                </p>
              )}
            </div>
          </div>

        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} style={{ backgroundColor: 'hsl(218 91% 57%)' }}>
            {saving ? 'Saving…' : isEdit ? 'Update Garment' : 'Add Garment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GarmentsTab() {
  const qc = useQueryClient();
  const { data: garments = [], isLoading } = useQuery<Garment[]>({
    queryKey: ['garments'],
    queryFn: async () => {
      const { data } = await supabase.from('garments').select('*').order('sort_order').order('brand');
      return (data ?? []) as Garment[];
    },
  });
  const [editGarment, setEditGarment] = useState<Garment | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const grouped = useMemo(() => {
    const map: Record<string, Garment[]> = {};
    garments.forEach((g) => { const k = g.category ?? 'Other'; (map[k] = map[k] ?? []).push(g); });
    return map;
  }, [garments]);

  const deleteGarment = async (id: string) => {
    if (!confirm('Delete this garment?')) return;
    await db.from('garments').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['garments'] });
    toast.success('Garment deleted');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>{garments.length} garments in catalog</p>
        <Button size="sm" onClick={() => setAddOpen(true)} style={{ backgroundColor: 'hsl(218 91% 57%)' }}>
          <Plus className="h-4 w-4" /> Add Garment
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton-shimmer h-10 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>{cat}</p>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                        {['Brand', 'Style #', 'Name', 'Color', 'Cost', 'Upcharges', 'Markup', 'Sell Price', ''].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((g) => {
                        const up = Object.entries(g.size_upcharges as Record<string, number> ?? {}).filter(([,v]) => v > 0).map(([k,v]) => `${k}+$${v}`).join(' ');
                        return (
                          <tr key={g.id} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                            <td className="px-4 py-2.5 font-medium">{g.brand}</td>
                            <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{g.style_number ?? '—'}</td>
                            <td className="px-4 py-2.5">{g.name}</td>
                            <td className="px-4 py-2.5">{g.color ?? '—'}</td>
                            <td className="px-4 py-2.5 font-semibold">{formatCurrency(g.base_cost)}</td>
                            <td className="px-4 py-2.5 text-xs" style={{ color: 'hsl(38 92% 40%)' }}>{up || '—'}</td>
                            <td className="px-4 py-2.5">{Math.round(g.markup_value * 100)}%</td>
                            <td className="px-4 py-2.5 font-semibold" style={{ color: 'hsl(218 91% 57%)' }}>{formatCurrency(g.base_cost * (1 + g.markup_value))}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditGarment(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => deleteGarment(g.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
      <GarmentFormDialog open={addOpen} garment={null} onClose={() => setAddOpen(false)} onSave={() => qc.invalidateQueries({ queryKey: ['garments'] })} />
      <GarmentFormDialog open={!!editGarment} garment={editGarment} onClose={() => setEditGarment(null)} onSave={() => qc.invalidateQueries({ queryKey: ['garments'] })} />
    </div>
  );
}

// ── Decorations Tab ───────────────────────────────────────────────────────────

function AddGroupDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Printer');
  const [color, setColor] = useState('#2E7CF6');
  const [colCount, setColCount] = useState(3);
  const [colLabels, setColLabels] = useState(['Col 1', 'Col 2', 'Col 3', '', '', '']);
  const [saving, setSaving] = useState(false);

  const handleColCountChange = (n: number) => {
    setColCount(n);
    setColLabels((prev) => {
      const next = [...prev];
      while (next.length < 6) next.push('');
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const labels = colLabels.slice(0, colCount).map((l, i) => l || `Col ${i + 1}`);
    setSaving(true);
    try {
      // Get max sort_order
      const { data: existing } = await supabase.from('decoration_groups').select('sort_order').order('sort_order', { ascending: false }).limit(1);
      const nextOrder = (((existing as unknown as Array<{ sort_order: number }>)?.[0]?.sort_order) ?? 0) + 1;
      const { error } = await db.from('decoration_groups').insert({
        name: name.trim(), description: description.trim() || null,
        icon, color, col_labels: labels, col_count: colCount,
        sort_order: nextOrder, active: true,
      });
      if (error) throw error;
      toast.success(`"${name}" decoration group added`);
      onSave(); onClose();
      setName(''); setDescription(''); setIcon('Printer'); setColor('#2E7CF6');
      setColCount(3); setColLabels(['Col 1', 'Col 2', 'Col 3', '', '', '']);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Decoration Group</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input className="h-8 text-sm" placeholder="e.g. DTG Printing, Vinyl, Sublimation…" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} className="text-sm resize-none" placeholder="Short description…" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Icon</Label>
              <div className="flex gap-1.5 flex-wrap">
                {ICON_OPTIONS.map(({ value, icon: Ic }) => (
                  <button
                    key={value}
                    type="button"
                    className="h-8 w-8 rounded-lg border flex items-center justify-center transition-colors"
                    style={{
                      borderColor: icon === value ? color : 'hsl(var(--border))',
                      backgroundColor: icon === value ? `${color}20` : 'transparent',
                    }}
                    onClick={() => setIcon(value)}
                  >
                    <Ic className="h-4 w-4" style={{ color: icon === value ? color : undefined }} />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <div className="flex gap-1.5 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="h-7 w-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? 'hsl(var(--foreground))' : 'transparent',
                      transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Label className="text-xs">Number of price columns</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="h-7 w-7 rounded text-xs font-semibold border transition-colors"
                    style={{
                      borderColor: colCount === n ? color : 'hsl(var(--border))',
                      backgroundColor: colCount === n ? color : 'transparent',
                      color: colCount === n ? 'white' : undefined,
                    }}
                    onClick={() => handleColCountChange(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: colCount }).map((_, i) => (
                <div key={i} className="space-y-0.5">
                  <Label className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Col {i + 1}</Label>
                  <Input
                    className="h-7 text-xs"
                    placeholder={`Column ${i + 1}`}
                    value={colLabels[i] ?? ''}
                    onChange={(e) => {
                      const next = [...colLabels];
                      next[i] = e.target.value;
                      setColLabels(next);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} style={{ backgroundColor: color }}>
            {saving ? 'Saving…' : 'Add Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DecorationGroupCard({ group, matrixRows, onRefresh }: {
  group: DecorationGroup;
  matrixRows: DecorationMatrixRow[];
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [edited, setEdited] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [addingRow, setAddingRow] = useState(false);
  const [newQtyMin, setNewQtyMin] = useState('');
  const [newQtyMax, setNewQtyMax] = useState('');
  const [newCols, setNewCols] = useState<string[]>(Array(6).fill(''));

  const IconComp = iconComponent(group.icon);
  const cols = Array.from({ length: group.col_count }, (_, i) => `col_${i + 1}` as keyof DecorationMatrixRow);

  const getValue = (row: DecorationMatrixRow, colKey: string): string =>
    edited[row.id]?.[colKey] ?? String(row[colKey as keyof DecorationMatrixRow] ?? '');

  const getQtyValue = (row: DecorationMatrixRow, key: 'qty_min' | 'qty_max'): string => {
    if (edited[row.id]?.[key] !== undefined) return edited[row.id][key];
    return key === 'qty_max' ? String(row.qty_max ?? '') : String(row.qty_min);
  };

  const setField = (rowId: string, key: string, value: string) =>
    setEdited((prev) => ({ ...prev, [rowId]: { ...(prev[rowId] ?? {}), [key]: value } }));

  const hasChanges = Object.keys(edited).some((k) => Object.keys(edited[k]).length > 0);

  const saveMatrix = async () => {
    setSaving(true);
    try {
      for (const row of matrixRows) {
        const changes = edited[row.id];
        if (!changes || Object.keys(changes).length === 0) continue;
        const patch: Record<string, number | null> = {};
        Object.entries(changes).forEach(([k, v]) => {
          if (k === 'qty_min') patch[k] = parseInt(v) || row.qty_min;
          else if (k === 'qty_max') patch[k] = v === '' ? null : (parseInt(v) || null);
          else patch[k] = parseFloat(v) || null;
        });
        const { error } = await db.from('decoration_matrix').update(patch).eq('id', row.id);
        if (error) throw error;
      }
      setEdited({});
      qc.invalidateQueries({ queryKey: ['decoration_matrix'] });
      toast.success('Matrix saved');
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const addRow = async () => {
    const qMin = parseInt(newQtyMin);
    if (!qMin) { toast.error('Enter min qty'); return; }
    const patch: Record<string, number | null> = { group_id: group.id as unknown as number, qty_min: qMin, qty_max: parseInt(newQtyMax) || null };
    for (let i = 0; i < group.col_count; i++) {
      patch[`col_${i + 1}`] = parseFloat(newCols[i]) || null;
    }
    const { error } = await db.from('decoration_matrix').insert(patch);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['decoration_matrix'] });
    setAddingRow(false);
    setNewQtyMin(''); setNewQtyMax(''); setNewCols(Array(6).fill(''));
    toast.success('Row added');
  };

  const deleteRow = async (id: string) => {
    await db.from('decoration_matrix').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['decoration_matrix'] });
    toast.success('Row deleted');
  };

  const deleteGroup = async () => {
    if (!confirm(`Delete "${group.name}" and all its pricing? This cannot be undone.`)) return;
    await db.from('decoration_groups').delete().eq('id', group.id);
    onRefresh();
    toast.success('Decoration group deleted');
  };

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))', borderLeft: `3px solid ${group.color}` }}>
      {/* Group header */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: `${group.color}18` }}>
          <IconComp className="h-4 w-4" style={{ color: group.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{group.name}</p>
          {group.description && (
            <p className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>{group.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${group.color}18`, color: group.color }}>
            {group.col_count} col{group.col_count !== 1 ? 's' : ''} · {matrixRows.length} tiers
          </span>
          <button
            type="button"
            className="p-1.5 rounded hover:bg-accent text-red-400 hover:text-red-600"
            onClick={(e) => { e.stopPropagation(); deleteGroup(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {expanded ? <ChevronUp className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} /> : <ChevronDown className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />}
        </div>
      </button>

      {/* Matrix editor */}
      {expanded && (
        <div className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Pricing Matrix</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddingRow((v) => !v)}>
                <Plus className="h-3 w-3" /> Add Qty Tier
              </Button>
              {hasChanges && (
                <Button size="sm" className="h-7 text-xs" onClick={saveMatrix} disabled={saving} style={{ backgroundColor: group.color }}>
                  <Save className="h-3 w-3" /> {saving ? 'Saving…' : 'Save'}
                </Button>
              )}
            </div>
          </div>

          {/* Add row form */}
          {addingRow && (
            <div className="mx-4 mb-3 rounded-lg border p-3 space-y-2" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted)/0.3)' }}>
              <p className="text-xs font-semibold">New Quantity Tier</p>
              <div className="flex gap-2 flex-wrap items-end">
                <div className="space-y-0.5">
                  <Label className="text-xs">Min Qty</Label>
                  <Input className="h-7 text-xs w-20" type="number" min="1" placeholder="48" value={newQtyMin} onChange={(e) => setNewQtyMin(e.target.value)} />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-xs">Max Qty (blank = ∞)</Label>
                  <Input className="h-7 text-xs w-24" type="number" placeholder="∞" value={newQtyMax} onChange={(e) => setNewQtyMax(e.target.value)} />
                </div>
                {Array.from({ length: group.col_count }).map((_, i) => (
                  <div key={i} className="space-y-0.5">
                    <Label className="text-xs">{group.col_labels[i] ?? `Col ${i + 1}`}</Label>
                    <div className="flex">
                      <span className="h-7 flex items-center px-1.5 text-xs border-y border-l rounded-l" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted))' }}>$</span>
                      <Input className="h-7 text-xs w-16 rounded-l-none" type="number" min="0" step="0.25" placeholder="0.00"
                        value={newCols[i] ?? ''} onChange={(e) => { const n = [...newCols]; n[i] = e.target.value; setNewCols(n); }} />
                    </div>
                  </div>
                ))}
                <Button size="sm" className="h-7 text-xs" onClick={addRow} style={{ backgroundColor: group.color }}>Add</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingRow(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto pb-3">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>Qty Tier</th>
                  {group.col_labels.slice(0, group.col_count).map((label) => (
                    <th key={label} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</th>
                  ))}
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {[...matrixRows]
                  .sort((a, b) => a.qty_min - b.qty_min)
                  .map((row, idx) => (
                    <tr key={row.id} style={{ borderBottom: idx < matrixRows.length - 1 ? '1px solid hsl(var(--border))' : undefined }}>
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            className="w-14 h-7 rounded text-center text-xs font-semibold border outline-none"
                            style={{
                              borderColor: edited[row.id]?.qty_min !== undefined ? group.color : 'rgba(0,0,0,0.1)',
                              backgroundColor: edited[row.id]?.qty_min !== undefined ? `${group.color}08` : 'transparent',
                            }}
                            value={getQtyValue(row, 'qty_min')}
                            onChange={(e) => setField(row.id, 'qty_min', e.target.value)}
                          />
                          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>–</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="∞"
                            className="w-14 h-7 rounded text-center text-xs font-semibold border outline-none"
                            style={{
                              borderColor: edited[row.id]?.qty_max !== undefined ? group.color : 'rgba(0,0,0,0.1)',
                              backgroundColor: edited[row.id]?.qty_max !== undefined ? `${group.color}08` : 'transparent',
                            }}
                            value={getQtyValue(row, 'qty_max')}
                            onChange={(e) => setField(row.id, 'qty_max', e.target.value)}
                          />
                        </div>
                      </td>
                      {cols.map((colKey) => {
                        const isDirty = edited[row.id]?.[colKey] !== undefined;
                        return (
                          <td key={colKey} className="px-2 py-1">
                            <div className="flex items-center justify-center gap-0.5">
                              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.25"
                                className="w-16 h-7 rounded text-center text-sm font-medium border outline-none"
                                style={{
                                  borderColor: isDirty ? group.color : 'hsl(var(--border))',
                                  backgroundColor: isDirty ? `${group.color}08` : 'transparent',
                                }}
                                value={getValue(row, colKey)}
                                onChange={(e) => setField(row.id, colKey, e.target.value)}
                              />
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1">
                        <button type="button" className="p-1 rounded hover:bg-accent text-red-400 hover:text-red-600" onClick={() => deleteRow(row.id)}>
                          <X className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                {matrixRows.length === 0 && (
                  <tr>
                    <td colSpan={group.col_count + 2} className="px-4 py-6 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      No pricing tiers yet. Click "Add Qty Tier" to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DecorationsTab() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: groups = [] } = useQuery<DecorationGroup[]>({
    queryKey: ['decoration_groups'],
    queryFn: async () => {
      const { data } = await supabase.from('decoration_groups').select('*').order('sort_order');
      return (data ?? []) as DecorationGroup[];
    },
  });

  const { data: allMatrixRows = [] } = useQuery<DecorationMatrixRow[]>({
    queryKey: ['decoration_matrix'],
    queryFn: async () => {
      const { data } = await supabase.from('decoration_matrix').select('*').order('qty_min');
      return (data ?? []) as DecorationMatrixRow[];
    },
  });

  const rowsByGroup = useMemo(() => {
    const map: Record<string, DecorationMatrixRow[]> = {};
    allMatrixRows.forEach((r) => { (map[r.group_id] = map[r.group_id] ?? []).push(r); });
    return map;
  }, [allMatrixRows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {groups.length} decoration group{groups.length !== 1 ? 's' : ''}. Expand a group to edit its pricing matrix.
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)} style={{ backgroundColor: 'hsl(218 91% 57%)' }}>
          <Plus className="h-4 w-4" /> Add Decoration Group
        </Button>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <DecorationGroupCard
            key={group.id}
            group={group}
            matrixRows={rowsByGroup[group.id] ?? []}
            onRefresh={() => qc.invalidateQueries({ queryKey: ['decoration_groups'] })}
          />
        ))}
        {groups.length === 0 && (
          <div className="text-center py-12 rounded-xl border border-dashed" style={{ borderColor: 'hsl(var(--border))' }}>
            <Printer className="h-8 w-8 mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm font-medium">No decoration groups yet</p>
            <p className="text-xs mt-1 mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>Add Screen Print, Embroidery, DTG, and more</p>
            <Button size="sm" onClick={() => setAddOpen(true)} style={{ backgroundColor: 'hsl(218 91% 57%)' }}>
              <Plus className="h-4 w-4" /> Add First Group
            </Button>
          </div>
        )}
      </div>

      <AddGroupDialog open={addOpen} onClose={() => setAddOpen(false)} onSave={() => qc.invalidateQueries({ queryKey: ['decoration_groups'] })} />
    </div>
  );
}

// ── Finishing Tab ─────────────────────────────────────────────────────────────

const DEFAULT_FINISHING_GROUPS = ['Packaging', 'Labels & Tags', 'Alterations'];

function FinishingTab() {
  const qc = useQueryClient();
  const { data: services = [] } = useQuery<FinishingService[]>({
    queryKey: ['finishing_services'],
    queryFn: async () => {
      const { data } = await supabase.from('finishing_services').select('*').order('sort_order');
      return (data ?? []) as FinishingService[];
    },
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editGroup, setEditGroup] = useState('');

  // Add-row state per group
  const [addGroupName, setAddGroupName] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addPrice, setAddPrice] = useState('');

  // New group name input
  const [newGroupName, setNewGroupName] = useState('');

  const grouped = useMemo(() => {
    const map: Record<string, FinishingService[]> = {};
    services.forEach((s) => {
      const k = s.group_name ?? 'Other';
      (map[k] = map[k] ?? []).push(s);
    });
    return map;
  }, [services]);

  // All group names that exist (from services + defaults)
  const allGroupNames = useMemo(() => {
    const fromServices = [...new Set(services.map((s) => s.group_name ?? 'Other'))];
    const all = [...new Set([...DEFAULT_FINISHING_GROUPS, ...fromServices])];
    return all.filter((g) => g);
  }, [services]);

  const startEdit = (s: FinishingService) => {
    setEditId(s.id); setEditName(s.name);
    setEditPrice(String(s.unit_price)); setEditGroup(s.group_name ?? 'Other');
  };

  const saveEdit = async () => {
    if (!editName.trim()) return;
    try {
      await db.from('finishing_services').update({
        name: editName.trim(),
        unit_price: parseFloat(editPrice) || 0,
        group_name: editGroup || null,
      }).eq('id', editId!);
      qc.invalidateQueries({ queryKey: ['finishing_services'] });
      setEditId(null);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const addService = async (groupName: string) => {
    if (!addName.trim()) return;
    try {
      const maxOrder = Math.max(0, ...services.map((s) => s.sort_order));
      await db.from('finishing_services').insert({
        name: addName.trim(), unit_price: parseFloat(addPrice) || 0,
        group_name: groupName === 'Other' ? null : groupName,
        active: true, sort_order: maxOrder + 1,
      });
      qc.invalidateQueries({ queryKey: ['finishing_services'] });
      setAddName(''); setAddPrice(''); setAddGroupName(null);
      toast.success('Service added');
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  const deleteService = async (id: string) => {
    if (!confirm('Delete this service?')) return;
    await db.from('finishing_services').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['finishing_services'] });
    toast.success('Deleted');
  };

  const toggleActive = async (s: FinishingService) => {
    await db.from('finishing_services').update({ active: !s.active }).eq('id', s.id);
    qc.invalidateQueries({ queryKey: ['finishing_services'] });
  };

  const addNewGroup = () => {
    const name = newGroupName.trim();
    if (!name || allGroupNames.includes(name)) return;
    setAddGroupName(name);
    setNewGroupName('');
  };

  // Determine groups to render
  const groupsToShow = allGroupNames.filter((g) => grouped[g]?.length > 0 || addGroupName === g);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 justify-between">
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {services.length} finishing service{services.length !== 1 ? 's' : ''} across {Object.keys(grouped).length} categories.
        </p>
        <div className="flex gap-2">
          <Input
            className="h-8 text-sm w-44"
            placeholder="New category name…"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNewGroup()}
          />
          <Button size="sm" variant="outline" className="h-8" onClick={addNewGroup} disabled={!newGroupName.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add Category
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {groupsToShow.map((groupName) => (
          <div key={groupName}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>{groupName}</p>
            <div className="rounded-xl overflow-hidden bg-white shadow-sm" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)' }}>
                {(grouped[groupName] ?? []).map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    {editId === s.id ? (
                      <>
                        <Input className="h-7 text-sm flex-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        <Select value={editGroup} onValueChange={setEditGroup}>
                          <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {allGroupNames.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex shrink-0">
                          <span className="h-7 flex items-center px-2 text-xs border-y border-l rounded-l" style={{ borderColor: 'rgba(0,0,0,0.08)', backgroundColor: 'hsl(var(--muted))' }}>$</span>
                          <Input className="h-7 text-sm w-20 rounded-l-none" type="number" min="0" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                        </div>
                        <span className="text-xs shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>/pc</span>
                        <Button size="icon" className="h-7 w-7 shrink-0" onClick={saveEdit} style={{ backgroundColor: 'hsl(218 91% 57%)' }}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="h-5 w-5 rounded flex items-center justify-center shrink-0 transition-colors"
                          style={{
                            border: `2px solid ${s.active ? 'hsl(218 91% 57%)' : 'rgba(0,0,0,0.15)'}`,
                            backgroundColor: s.active ? 'hsl(218 91% 57%)' : 'transparent',
                          }}
                          onClick={() => toggleActive(s)}
                          title={s.active ? 'Active' : 'Inactive — click to activate'}
                        >
                          {s.active && <Check className="h-3 w-3 text-white" />}
                        </button>
                        <span className={`flex-1 text-sm ${!s.active ? 'line-through opacity-50' : ''}`}>{s.name}</span>
                        <span className="text-sm font-semibold shrink-0" style={{ color: 'hsl(218 91% 57%)' }}>
                          {formatCurrency(s.unit_price)}<span className="text-xs font-normal text-muted-foreground">/pc</span>
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => startEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-red-400 hover:text-red-600" onClick={() => deleteService(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </div>
                ))}

                {/* Add row */}
                {addGroupName === groupName ? (
                  <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: 'hsl(var(--muted)/0.3)' }}>
                    <div className="h-5 w-5 shrink-0" />
                    <Input className="h-7 text-sm flex-1" placeholder="Service name…" value={addName} onChange={(e) => setAddName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addService(groupName)} />
                    <div className="flex shrink-0">
                      <span className="h-7 flex items-center px-2 text-xs border-y border-l rounded-l" style={{ borderColor: 'rgba(0,0,0,0.08)', backgroundColor: 'hsl(var(--muted))' }}>$</span>
                      <Input className="h-7 text-sm w-20 rounded-l-none" type="number" min="0" step="0.01" placeholder="0.00" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} />
                    </div>
                    <span className="text-xs shrink-0" style={{ color: 'hsl(var(--muted-foreground))' }}>/pc</span>
                    <Button size="sm" className="h-7 text-xs shrink-0" onClick={() => addService(groupName)} style={{ backgroundColor: 'hsl(218 91% 57%)' }}><Plus className="h-3 w-3" /> Add</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => setAddGroupName(null)}><X className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="w-full flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors hover:bg-accent"
                    style={{ color: 'hsl(218 91% 57%)' }}
                    onClick={() => { setAddGroupName(groupName); setAddName(''); setAddPrice(''); }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add service to {groupName}
                  </button>
                )}
            </div>
          </div>
        ))}

        {/* Shortcut: add to "Other" for empty state */}
        {groupsToShow.length === 0 && (
          <div className="text-center py-10 rounded-xl border border-dashed" style={{ borderColor: 'hsl(var(--border))' }}>
            <Package className="h-8 w-8 mx-auto mb-2" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <p className="text-sm font-medium">No finishing services yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [activeTab, setActiveTab] = useState<Tab>('garments');
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="animate-page-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading">Catalog</h1>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Manage garments, decoration groups with pricing matrices, and finishing services.
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'hsl(var(--muted))' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: activeTab === tab.id ? 'hsl(var(--background))' : 'transparent',
              color: activeTab === tab.id ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-sm -mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>{active.description}</p>

      {activeTab === 'garments'    && <GarmentsTab />}
      {activeTab === 'decorations' && <DecorationsTab />}
      {activeTab === 'finishing'   && <FinishingTab />}
    </div>
  );
}
