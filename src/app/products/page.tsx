'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Package, Tag, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Product, ProductInsert } from '@/types/database';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = ['Tops', 'Sweatshirts', 'Bottoms', 'Headwear', 'Accessories'];

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
}

// ── Product Modal ─────────────────────────────────────────────────────────────

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  editProduct?: Product | null;
  existingCategories: string[];
}

function ProductModal({ open, onClose, editProduct, existingCategories }: ProductModalProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [categoryMode, setCategoryMode] = useState<'select' | 'new'>('select');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [basePrice, setBasePrice] = useState('');

  // Merged categories: defaults + any extra from DB
  const allCategories = useMemo(() => {
    const merged = [...DEFAULT_CATEGORIES];
    for (const c of existingCategories) {
      if (!merged.includes(c)) merged.push(c);
    }
    return merged;
  }, [existingCategories]);

  // Populate form when modal opens
  useMemo(() => {
    if (!open) return;
    if (editProduct) {
      setName(editProduct.name);
      const cat = editProduct.category ?? '';
      if (allCategories.includes(cat)) {
        setCategoryMode('select');
        setSelectedCategory(cat);
      } else if (cat) {
        setCategoryMode('new');
        setNewCategory(cat);
      } else {
        setCategoryMode('select');
        setSelectedCategory('');
      }
      setDescription(editProduct.description ?? '');
      setImageUrl(editProduct.image_url ?? '');
      setBasePrice(editProduct.base_price != null ? String(editProduct.base_price) : '');
    } else {
      setName('');
      setCategoryMode('select');
      setSelectedCategory('');
      setNewCategory('');
      setDescription('');
      setImageUrl('');
      setBasePrice('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editProduct]);

  const resolvedCategory = categoryMode === 'new' ? newCategory.trim() : selectedCategory;

  const save = async () => {
    if (!name.trim()) { toast.error('Product name is required'); return; }
    setSaving(true);
    try {
      const payload: ProductInsert = {
        name: name.trim(),
        category: resolvedCategory || null,
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
        base_price: basePrice ? parseFloat(basePrice) : null,
        sort_order: editProduct?.sort_order ?? 0,
      };

      if (editProduct) {
        const { error } = await db.from('products').update(payload).eq('id', editProduct.id);
        if (error) throw error;
        toast.success('Product updated');
      } else {
        const { error } = await db.from('products').insert(payload);
        if (error) throw error;
        toast.success(`${name.trim()} added`);
      }

      qc.invalidateQueries({ queryKey: ['products'] });
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg w-full">
        <DialogHeader>
          <DialogTitle>{editProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
          <DialogDescription>
            {editProduct ? 'Update product details.' : 'Add a new product to your catalog.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-1 pb-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Gildan 5000 Tee"
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={categoryMode === 'new' ? '__new__' : selectedCategory}
              onValueChange={(v) => {
                if (v === '__new__') {
                  setCategoryMode('new');
                  setSelectedCategory('');
                } else {
                  setCategoryMode('select');
                  setSelectedCategory(v);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category…" />
              </SelectTrigger>
              <SelectContent>
                {allCategories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
                <SelectItem value="__new__">+ Add new category</SelectItem>
              </SelectContent>
            </Select>
            {categoryMode === 'new' && (
              <Input
                className="mt-2"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New category name"
                autoFocus
              />
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="100% cotton, pre-shrunk…"
              rows={3}
            />
          </div>

          {/* Image URL */}
          <div className="space-y-1.5">
            <Label>Image URL</Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/product.jpg"
            />
            {imageUrl && (
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="h-20 w-20 object-cover rounded-lg border"
                  style={{ borderColor: 'hsl(var(--border))' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
          </div>

          {/* Base Price */}
          <div className="space-y-1.5">
            <Label>Base Price</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>$</span>
              <Input
                className="pl-6"
                type="number"
                min={0}
                step={0.01}
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editProduct ? 'Save Changes' : 'Add Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
}

function ProductCard({ product, onEdit, onDelete }: ProductCardProps) {
  return (
    <Card className="overflow-hidden group">
      {/* Image */}
      <div
        className="h-44 w-full flex items-center justify-center"
        style={{ backgroundColor: 'hsl(var(--muted))' }}
      >
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              const parent = (e.target as HTMLImageElement).parentElement;
              if (parent) {
                const icon = document.createElement('div');
                icon.className = 'flex items-center justify-center w-full h-full';
                parent.appendChild(icon);
              }
            }}
          />
        ) : (
          <Package className="h-12 w-12" style={{ color: 'hsl(var(--muted-foreground))' }} />
        )}
      </div>

      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{product.name}</p>
            {product.category && (
              <span
                className="inline-flex items-center gap-1 mt-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: 'hsl(218 91% 57% / 0.1)', color: 'hsl(218, 91%, 50%)' }}
              >
                <Tag className="h-2.5 w-2.5" />
                {product.category}
              </span>
            )}
          </div>
          {product.base_price != null && (
            <span className="text-sm font-bold shrink-0" style={{ color: 'hsl(218, 91%, 57%)' }}>
              {formatCurrency(product.base_price)}
            </span>
          )}
        </div>

        {product.description && (
          <p className="text-xs line-clamp-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {product.description}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-1 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => onEdit(product)}
          >
            <Pencil className="h-3 w-3" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-500 hover:text-red-700"
            onClick={() => onDelete(product)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts();

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  // Derive unique categories with counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      const cat = p.category ?? 'Uncategorized';
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [products]);

  const existingCategories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))] as string[],
    [products],
  );

  const filteredProducts = useMemo(() => {
    let list = products;
    if (categoryFilter !== 'all') {
      list = list.filter((p) =>
        categoryFilter === 'Uncategorized'
          ? !p.category
          : p.category === categoryFilter,
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, categoryFilter, search]);

  const openAdd = () => {
    setEditProduct(null);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct(p);
    setModalOpen(true);
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    const { error } = await db.from('products').delete().eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['products'] });
    toast.success(`${p.name} deleted`);
  };

  const sidebarCategories = useMemo(() => {
    const cats = Object.keys(categoryCounts);
    return cats.sort((a, b) => a.localeCompare(b));
  }, [categoryCounts]);

  return (
    <div className="animate-page-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">Products</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Manage your garments and physical product catalog.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
        <Input
          className="pl-9"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6 items-start">
        {/* Category Sidebar */}
        <div
          className="w-52 shrink-0 rounded-xl border p-3 space-y-1"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Categories
          </p>
          {/* All */}
          <button
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: categoryFilter === 'all' ? 'hsl(218 91% 57% / 0.1)' : 'transparent',
              color: categoryFilter === 'all' ? 'hsl(218, 91%, 50%)' : 'hsl(var(--foreground))',
            }}
            onClick={() => setCategoryFilter('all')}
          >
            <span>All Products</span>
            <span
              className="text-xs rounded-full px-1.5 py-0.5"
              style={{
                backgroundColor: categoryFilter === 'all' ? 'hsl(218 91% 57% / 0.15)' : 'hsl(var(--muted))',
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              {products.length}
            </span>
          </button>

          {sidebarCategories.map((cat) => (
            <button
              key={cat}
              className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: categoryFilter === cat ? 'hsl(218 91% 57% / 0.1)' : 'transparent',
                color: categoryFilter === cat ? 'hsl(218, 91%, 50%)' : 'hsl(var(--foreground))',
              }}
              onClick={() => setCategoryFilter(cat)}
            >
              <span className="truncate">{cat}</span>
              <span
                className="text-xs rounded-full px-1.5 py-0.5 shrink-0"
                style={{
                  backgroundColor: categoryFilter === cat ? 'hsl(218 91% 57% / 0.15)' : 'hsl(var(--muted))',
                  color: 'hsl(var(--muted-foreground))',
                }}
              >
                {categoryCounts[cat] ?? 0}
              </span>
            </button>
          ))}

          {sidebarCategories.length === 0 && !isLoading && (
            <p className="px-3 py-2 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              No categories yet
            </p>
          )}
        </div>

        {/* Product Grid */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
                  <div className="skeleton-shimmer h-44 w-full" />
                  <div className="p-4 space-y-2">
                    <div className="skeleton-shimmer h-4 w-3/4 rounded" />
                    <div className="skeleton-shimmer h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Package className="mb-3 h-10 w-10" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="font-medium">
                {search || categoryFilter !== 'all' ? 'No products match your filters' : 'No products yet'}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {search || categoryFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Add your first garment or product.'}
              </p>
              {!search && categoryFilter === 'all' && (
                <Button className="mt-4" size="sm" onClick={openAdd}>
                  <Plus className="h-4 w-4" /> Add Product
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <ProductModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditProduct(null); }}
        editProduct={editProduct}
        existingCategories={existingCategories}
      />
    </div>
  );
}
