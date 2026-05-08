'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, DollarSign, ShoppingCart, Users, Clock,
  Calendar, Plus, Trash2, Save, ChevronDown, BarChart2,
  Target, Layers, Zap, PieChart as PieIcon,
} from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { toast } from 'sonner';
import { supabase, db } from '@/lib/supabase';
import { formatCurrency, calcSubtotal, calcDiscount, calcTax } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Order, OrderItem } from '@/types/database';

// ── Types ──────────────────────────────────────────────────────────────────────

type OrderWithItems = Order & { order_items: OrderItem[] };

interface DateRange { start: string; end: string; label: string }

interface ExpenseLine { id: string; label: string; amount: string }

interface Snapshot {
  id: string;
  label: string;
  period_start: string;
  period_end: string;
  gross_revenue: number;
  expenses: { label: string; amount: number }[];
  total_expenses: number;
  net_profit: number;
  notes: string | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function orderTotal(o: OrderWithItems): number {
  const sub = calcSubtotal((o.order_items ?? []).map((i) => ({ qty: i.qty, unit_price: i.unit_price })));
  const disc = calcDiscount(sub, o.discount_type, o.discount_value);
  return sub - disc + calcTax(sub - disc, o.tax_rate);
}

function isoDate(d: Date) { return d.toISOString().split('T')[0]; }

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

const today = isoDate(new Date());
const PRESETS: DateRange[] = [
  { label: 'Today',       start: today, end: today },
  { label: 'Yesterday',   start: addDays(today, -1), end: addDays(today, -1) },
  { label: 'Last 7 days', start: addDays(today, -6), end: today },
  { label: 'This month',  start: today.slice(0, 8) + '01', end: today },
  { label: 'Last 30 days',start: addDays(today, -29), end: today },
  {
    label: 'Last month',
    start: (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return isoDate(d); })(),
    end: (() => { const d = new Date(); d.setDate(0); return isoDate(d); })(),
  },
  { label: 'This year',   start: today.slice(0, 5) + '01-01', end: today },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const BRAND = 'hsl(218 91% 57%)';
const CHART_COLORS = ['#2E7CF6', '#1ABF7A', '#F5A623', '#E8344A', '#9B59B6', '#1ABC9C', '#E67E22', '#3498DB'];

// ── Data hooks ─────────────────────────────────────────────────────────────────

function useOrders(range: DateRange) {
  return useQuery<OrderWithItems[]>({
    queryKey: ['revenue-orders', range.start, range.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .gte('created_at', range.start + 'T00:00:00')
        .lte('created_at', range.end + 'T23:59:59')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrderWithItems[];
    },
  });
}

function useAllOrders() {
  return useQuery<OrderWithItems[]>({
    queryKey: ['revenue-all-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrderWithItems[];
    },
    staleTime: 60_000,
  });
}

function useSnapshots() {
  return useQuery<Snapshot[]>({
    queryKey: ['revenue-snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revenue_snapshots')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Snapshot[];
    },
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-4 flex items-start gap-3" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '18' }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</p>
        <p className="text-xl font-bold mt-0.5" style={{ color: '#05253D' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>{sub}</p>}
      </div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
        <Icon className="h-4 w-4" style={{ color: BRAND }} />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-lg shadow-lg px-3 py-2 text-sm" style={{ borderColor: 'hsl(var(--border))' }}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: CHART_COLORS[i] ?? BRAND }}>
          {p.name ? `${p.name}: ` : ''}{formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

// ── Date Range Picker ──────────────────────────────────────────────────────────

function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-accent"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <Calendar className="h-3.5 w-3.5" style={{ color: BRAND }} />
        {value.label}
        <ChevronDown className="h-3.5 w-3.5 ml-1" style={{ color: 'hsl(var(--muted-foreground))' }} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-xl border shadow-xl overflow-hidden w-64" style={{ borderColor: 'hsl(var(--border))' }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center justify-between"
              style={{ fontWeight: value.label === p.label ? 600 : 400, color: value.label === p.label ? BRAND : undefined }}
              onClick={() => { onChange(p); setOpen(false); }}
            >
              {p.label}
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {p.start === p.end ? p.start : `${p.start} – ${p.end}`}
              </span>
            </button>
          ))}
          <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
            <p className="text-xs font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>Custom range</p>
            <div className="flex gap-2">
              <Input type="date" className="h-7 text-xs flex-1" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <Input type="date" className="h-7 text-xs flex-1" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
            <Button
              size="sm" className="w-full h-7 text-xs"
              style={{ backgroundColor: BRAND }}
              disabled={!customStart || !customEnd}
              onClick={() => {
                onChange({ label: `${customStart} – ${customEnd}`, start: customStart, end: customEnd });
                setOpen(false);
              }}
            >Apply</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analytics Charts ───────────────────────────────────────────────────────────

function AnalyticsTab({ orders, allOrders }: { orders: OrderWithItems[]; allOrders: OrderWithItems[] }) {

  // 1. Daily revenue in range
  const dailyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      const day = o.created_at.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + orderTotal(o));
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, revenue]) => ({ date: date.slice(5), revenue: +revenue.toFixed(2) }));
  }, [orders]);

  // 2. Hourly distribution (avg revenue per hour)
  const hourlyData = useMemo(() => {
    const map = new Map<number, { total: number; count: number }>();
    for (let h = 0; h < 24; h++) map.set(h, { total: 0, count: 0 });
    for (const o of orders) {
      const h = new Date(o.created_at).getHours();
      const cur = map.get(h)!;
      map.set(h, { total: cur.total + orderTotal(o), count: cur.count + 1 });
    }
    return Array.from(map.entries()).map(([hour, { total, count }]) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      revenue: count ? +(total / count).toFixed(2) : 0,
      orders: count,
    }));
  }, [orders]);

  // 3. Day-of-week distribution
  const dowData = useMemo(() => {
    const map = new Map<number, { total: number; count: number }>();
    for (let d = 0; d < 7; d++) map.set(d, { total: 0, count: 0 });
    for (const o of orders) {
      const d = new Date(o.created_at).getDay();
      const cur = map.get(d)!;
      map.set(d, { total: cur.total + orderTotal(o), count: cur.count + 1 });
    }
    return DAY_NAMES.map((name, i) => {
      const { total, count } = map.get(i)!;
      return { day: name, revenue: count ? +(total / count).toFixed(2) : 0, orders: count };
    });
  }, [orders]);

  // 4. Order status breakdown (current range)
  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) map.set(o.status, (map.get(o.status) ?? 0) + 1);
    return Array.from(map.entries()).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1), value: count,
    }));
  }, [orders]);

  // 5. Last 6 months trend (from all orders)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTH_NAMES[d.getMonth()] };
    });
    const map = new Map(months.map((m) => [m.key, 0]));
    for (const o of allOrders) {
      const key = o.created_at.slice(0, 7);
      if (map.has(key)) map.set(key, map.get(key)! + orderTotal(o));
    }
    return months.map((m) => ({ month: m.label, revenue: +(map.get(m.key) ?? 0).toFixed(2) }));
  }, [allOrders]);

  // 6. Revenue vs Orders count (daily)
  const dualAxisData = useMemo(() => {
    const revMap = new Map<string, number>();
    const cntMap = new Map<string, number>();
    for (const o of orders) {
      const day = o.created_at.slice(0, 10);
      revMap.set(day, (revMap.get(day) ?? 0) + orderTotal(o));
      cntMap.set(day, (cntMap.get(day) ?? 0) + 1);
    }
    const days = Array.from(new Set([...revMap.keys(), ...cntMap.keys()])).sort();
    return days.map((d) => ({ date: d.slice(5), revenue: +(revMap.get(d) ?? 0).toFixed(2), orders: cntMap.get(d) ?? 0 }));
  }, [orders]);

  // 7. Service type revenue from order items
  const serviceData = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      for (const item of o.order_items ?? []) {
        const key = item.decoration_type ?? 'Other';
        map.set(key, (map.get(key) ?? 0) + item.qty * item.unit_price);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, revenue]) => ({ name, revenue: +revenue.toFixed(2) }));
  }, [orders]);

  const noData = orders.length === 0;

  if (noData) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <BarChart2 className="h-12 w-12 mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
      <p className="font-semibold">No orders in this period</p>
      <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Try a wider date range</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Row 1: Daily revenue + 6-month trend */}
      <div className="grid grid-cols-2 gap-5">
        <SectionCard title="Daily Revenue" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BRAND} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" stroke={BRAND} fill="url(#revGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="6-Month Trend" icon={BarChart2}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" fill={BRAND} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Row 2: Peak hours + Peak days */}
      <div className="grid grid-cols-2 gap-5">
        <SectionCard title="Peak Hours (Avg Revenue)" icon={Clock}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" fill="#1ABF7A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Peak Days of Week (Avg Revenue)" icon={Calendar}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" fill="#F5A623" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Row 3: Revenue vs Orders + Status mix */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2">
          <SectionCard title="Revenue vs Orders (Daily)" icon={Zap}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dualAxisData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-white border rounded-lg shadow-lg px-3 py-2 text-sm" style={{ borderColor: 'hsl(var(--border))' }}>
                      <p className="font-semibold mb-1">{label}</p>
                      {payload.map((p, i) => (
                        <p key={i} style={{ color: p.color }}>
                          {p.name}: {p.name === 'revenue' ? formatCurrency(p.value as number) : p.value}
                        </p>
                      ))}
                    </div>
                  );
                }} />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill={BRAND} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="right" dataKey="orders" fill="#1ABF7A" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>

        <SectionCard title="Order Status Mix" icon={PieIcon}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                {statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v} orders`]} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      {/* Row 4: Service type revenue */}
      {serviceData.length > 0 && (
        <SectionCard title="Revenue by Service / Decoration Type" icon={Layers}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={serviceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={130} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" fill="#9B59B6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}
    </div>
  );
}

// ── Customers Tab ──────────────────────────────────────────────────────────────

function CustomersTab({ orders }: { orders: OrderWithItems[] }) {
  const [sort, setSort] = useState<'revenue' | 'orders'>('revenue');

  const rows = useMemo(() => {
    const map = new Map<string, { name: string; company: string | null; revenue: number; orders: number; avg: number }>();
    for (const o of orders) {
      const key = o.customer_id ?? o.customer_name ?? 'Unknown';
      const cur = map.get(key) ?? { name: o.customer_name ?? 'Unknown', company: o.customer_company, revenue: 0, orders: 0, avg: 0 };
      const total = orderTotal(o);
      cur.revenue += total;
      cur.orders += 1;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, avg: r.orders ? r.revenue / r.orders : 0 }))
      .sort((a, b) => sort === 'revenue' ? b.revenue - a.revenue : b.orders - a.orders);
  }, [orders, sort]);

  const max = rows[0]?.revenue ?? 1;

  if (!rows.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Users className="h-12 w-12 mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
      <p className="font-semibold">No customer data in this period</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Sort by:</span>
        {(['revenue', 'orders'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSort(s)}
            className="text-xs px-3 py-1.5 rounded-full border font-medium capitalize transition-colors"
            style={{
              backgroundColor: sort === s ? BRAND : 'white',
              color: sort === s ? 'white' : undefined,
              borderColor: sort === s ? BRAND : 'hsl(var(--border))',
            }}>{s}</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
        <table className="w-full text-sm">
          <thead style={{ background: '#05253D' }}>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.55)' }}>#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.55)' }}>Customer</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.55)' }}>Orders</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.55)' }}>Avg Order</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.55)' }}>Revenue</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider w-48" style={{ color: 'rgba(255,255,255,.55)' }}>Share</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-3 text-xs font-bold" style={{ color: 'hsl(var(--muted-foreground))' }}>{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{r.name}</div>
                  {r.company && <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{r.company}</div>}
                </td>
                <td className="px-4 py-3 text-right font-medium">{r.orders}</td>
                <td className="px-4 py-3 text-right" style={{ color: 'hsl(var(--muted-foreground))' }}>{formatCurrency(r.avg)}</td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: BRAND }}>{formatCurrency(r.revenue)}</td>
                <td className="px-4 py-3">
                  <div className="h-2 rounded-full overflow-hidden bg-gray-100">
                    <div className="h-full rounded-full" style={{ width: `${(r.revenue / max) * 100}%`, background: BRAND }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Groups Tab (by company) ────────────────────────────────────────────────────

function GroupsTab({ orders }: { orders: OrderWithItems[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { revenue: number; orders: number; customers: Set<string> }>();
    for (const o of orders) {
      const key = o.customer_company || 'No Company';
      const cur = map.get(key) ?? { revenue: 0, orders: 0, customers: new Set<string>() };
      cur.revenue += orderTotal(o);
      cur.orders += 1;
      if (o.customer_name) cur.customers.add(o.customer_name);
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, revenue: d.revenue, orders: d.orders, customers: d.customers.size }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const pieData = rows.slice(0, 6).map((r) => ({ name: r.name, value: +r.revenue.toFixed(2) }));

  if (!rows.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <PieIcon className="h-12 w-12 mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
      <p className="font-semibold">No group data in this period</p>
    </div>
  );

  return (
    <div className="grid grid-cols-5 gap-6">
      <div className="col-span-2">
        <SectionCard title="Revenue by Group" icon={PieIcon}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} dataKey="value" paddingAngle={3} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <div className="col-span-3">
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <Layers className="h-4 w-4" style={{ color: BRAND }} />
            <h3 className="font-semibold text-sm">Company / Group Breakdown</h3>
          </div>
          <table className="w-full text-sm">
            <thead style={{ background: '#05253D' }}>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.55)' }}>Group</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.55)' }}>Customers</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.55)' }}>Orders</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.55)' }}>Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="font-medium">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{r.customers}</td>
                  <td className="px-4 py-3 text-right">{r.orders}</td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: BRAND }}>{formatCurrency(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Snapshots Tab ──────────────────────────────────────────────────────────────

function SnapshotsTab() {
  const qc = useQueryClient();
  const { data: snapshots = [] } = useSnapshots();
  const [deleting, setDeleting] = useState<string | null>(null);

  const deleteSnapshot = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await db.from('revenue_snapshots').delete().eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['revenue-snapshots'] });
      toast.success('Snapshot deleted');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setDeleting(null);
    }
  };

  if (!snapshots.length) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Save className="h-12 w-12 mb-3" style={{ color: 'hsl(var(--muted-foreground))' }} />
      <p className="font-semibold">No snapshots yet</p>
      <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Save a projection from the calculator to track your assumptions</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {snapshots.map((s) => (
        <div key={s.id} className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <div>
              <p className="font-bold">{s.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {s.period_start} → {s.period_end} · Saved {new Date(s.created_at).toLocaleDateString()}
              </p>
            </div>
            <button type="button" onClick={() => deleteSnapshot(s.id)} disabled={deleting === s.id}
              className="p-1.5 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 divide-x" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Gross Revenue</p>
              <p className="font-bold text-lg" style={{ color: BRAND }}>{formatCurrency(s.gross_revenue)}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Total Expenses</p>
              <p className="font-bold text-lg text-red-500">{formatCurrency(s.total_expenses)}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Net Profit</p>
              <p className={`font-bold text-lg ${s.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(s.net_profit)}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>Margin</p>
              <p className="font-bold text-lg">{s.gross_revenue > 0 ? ((s.net_profit / s.gross_revenue) * 100).toFixed(1) : '0'}%</p>
            </div>
          </div>
          {s.expenses?.length > 0 && (
            <div className="px-5 pb-3 pt-1 flex flex-wrap gap-2">
              {(s.expenses as { label: string; amount: number }[]).map((e, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
                  {e.label}: {formatCurrency(e.amount)}
                </span>
              ))}
            </div>
          )}
          {s.notes && <p className="px-5 pb-3 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>{s.notes}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Projection Calculator ──────────────────────────────────────────────────────

function ProjectionCalculator({ grossRevenue, range }: { grossRevenue: number; range: DateRange }) {
  const qc = useQueryClient();
  const [expenses, setExpenses] = useState<ExpenseLine[]>([
    { id: '1', label: 'Salaries', amount: '' },
    { id: '2', label: 'Rent', amount: '' },
    { id: '3', label: 'Utilities', amount: '' },
  ]);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [snapshotNotes, setSnapshotNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const netProfit = grossRevenue - totalExpenses;
  const margin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

  const addExpense = () => setExpenses((p) => [...p, { id: Date.now().toString(), label: '', amount: '' }]);
  const removeExpense = (id: string) => setExpenses((p) => p.filter((e) => e.id !== id));
  const updateExpense = (id: string, key: 'label' | 'amount', val: string) =>
    setExpenses((p) => p.map((e) => e.id === id ? { ...e, [key]: val } : e));

  const saveSnapshot = async () => {
    if (!snapshotLabel.trim()) { toast.error('Enter a snapshot label'); return; }
    setSaving(true);
    try {
      const { error } = await db.from('revenue_snapshots').insert({
        label: snapshotLabel.trim(),
        period_start: range.start,
        period_end: range.end,
        gross_revenue: grossRevenue,
        expenses: expenses.filter((e) => e.label && parseFloat(e.amount)).map((e) => ({ label: e.label, amount: parseFloat(e.amount) })),
        total_expenses: totalExpenses,
        net_profit: netProfit,
        notes: snapshotNotes.trim() || null,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['revenue-snapshots'] });
      toast.success('Snapshot saved');
      setSnapshotLabel('');
      setSnapshotNotes('');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-80 shrink-0 flex flex-col gap-4">
      {/* Revenue summary */}
      <div className="rounded-xl p-4 space-y-2 text-sm" style={{ background: '#05253D', color: '#fff' }}>
        <p className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-3">Projection — {range.label}</p>
        <div className="flex justify-between opacity-70"><span>Gross Revenue</span><span className="font-semibold text-green-300">{formatCurrency(grossRevenue)}</span></div>
        <div className="flex justify-between opacity-70"><span>Total Expenses</span><span className="font-semibold text-red-300">-{formatCurrency(totalExpenses)}</span></div>
        <div className="flex justify-between font-bold text-base pt-2 border-t border-white/10">
          <span>Net Profit</span>
          <span className={netProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}>{formatCurrency(netProfit)}</span>
        </div>
        <div className="flex justify-between text-xs pt-1 opacity-60">
          <span>Margin</span><span>{margin.toFixed(1)}%</span>
        </div>
        {grossRevenue > 0 && (
          <div className="pt-2">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, margin))}%`, background: netProfit >= 0 ? '#1ABF7A' : '#E8344A' }} />
            </div>
          </div>
        )}
      </div>

      {/* Expense rows */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <span className="text-sm font-semibold">Expenses</span>
          <button type="button" onClick={addExpense} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors hover:bg-accent" style={{ color: BRAND }}>
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        <div className="px-4 py-3 space-y-2 max-h-64 overflow-y-auto">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center gap-1.5">
              <Input className="h-7 text-xs flex-1" placeholder="Label" value={e.label} onChange={(ev) => updateExpense(e.id, 'label', ev.target.value)} />
              <Input className="h-7 text-xs w-24" type="number" placeholder="$0" min={0} value={e.amount} onChange={(ev) => updateExpense(e.id, 'amount', ev.target.value)} />
              <button type="button" onClick={() => removeExpense(e.id)} className="text-red-400 hover:text-red-600 shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t flex justify-between text-sm font-semibold" style={{ borderColor: 'hsl(var(--border))' }}>
          <span>Total</span>
          <span className="text-red-500">{formatCurrency(totalExpenses)}</span>
        </div>
      </div>

      {/* Save snapshot */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <Save className="h-4 w-4" style={{ color: BRAND }} />
          <span className="text-sm font-semibold">Save Snapshot</span>
        </div>
        <div className="px-4 py-3 space-y-2">
          <Input className="h-8 text-sm" placeholder="e.g. May 2026 forecast" value={snapshotLabel} onChange={(e) => setSnapshotLabel(e.target.value)} />
          <Input className="h-8 text-sm" placeholder="Notes (optional)" value={snapshotNotes} onChange={(e) => setSnapshotNotes(e.target.value)} />
          <Button className="w-full" size="sm" onClick={saveSnapshot} disabled={saving} style={{ backgroundColor: BRAND }}>
            <Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save Snapshot'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RevenuePage() {
  const [range, setRange] = useState<DateRange>(PRESETS[4]); // Last 30 days
  const [tab, setTab] = useState<'overview' | 'analytics' | 'customers' | 'groups' | 'snapshots'>('overview');

  const { data: orders = [], isLoading } = useOrders(range);
  const { data: allOrders = [] } = useAllOrders();

  const metrics = useMemo(() => {
    const grossRevenue = orders.reduce((s, o) => s + orderTotal(o), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders ? grossRevenue / totalOrders : 0;

    const days = Math.max(1, Math.ceil((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86400000) + 1);
    const avgPerDay = grossRevenue / days;

    const uniqueCustomers = new Set(orders.map((o) => o.customer_id ?? o.customer_name).filter(Boolean)).size;

    const hourCounts = new Map<number, number>();
    for (const o of orders) {
      const h = new Date(o.created_at).getHours();
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + orderTotal(o));
    }
    const peakHour = hourCounts.size ? [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;

    return { grossRevenue, totalOrders, avgOrderValue, avgPerDay, uniqueCustomers, peakHour };
  }, [orders, range]);

  const TABS = [
    { id: 'overview',   label: 'Overview' },
    { id: 'analytics',  label: 'Analytics' },
    { id: 'customers',  label: 'Customers' },
    { id: 'groups',     label: 'Groups' },
    { id: 'snapshots',  label: 'Snapshots' },
  ] as const;

  return (
    <div className="animate-page-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm shrink-0">
            <TrendingUp size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-zinc-900">Revenue</h1>
            <p className="text-xs text-zinc-400 font-medium mt-0.5">Analytics, projections & business insights</p>
          </div>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-5 gap-4">
        <MetricCard label="Gross Revenue" value={formatCurrency(metrics.grossRevenue)} icon={DollarSign} color={BRAND} />
        <MetricCard label="Total Orders" value={metrics.totalOrders.toString()} icon={ShoppingCart} color="#1ABF7A" />
        <MetricCard label="Avg Order Value" value={formatCurrency(metrics.avgOrderValue)} icon={Target} color="#F5A623" />
        <MetricCard label="Avg Per Day" value={formatCurrency(metrics.avgPerDay)} icon={Calendar} color="#9B59B6" sub={`${Math.ceil((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86400000) + 1} day window`} />
        <MetricCard label="Unique Customers" value={metrics.uniqueCustomers.toString()} sub={metrics.peakHour !== null ? `Peak: ${metrics.peakHour.toString().padStart(2, '0')}:00` : undefined} icon={Users} color="#E8344A" />
      </div>

      {/* Main area */}
      <div className="flex gap-5 items-start">
        {/* Left: tabs content */}
        <div className="flex-1 min-w-0">
          {/* Tabs */}
          <div className="flex gap-0 border-b mb-5" style={{ borderColor: 'hsl(var(--border))' }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors"
                style={{
                  borderColor: tab === t.id ? BRAND : 'transparent',
                  color: tab === t.id ? BRAND : 'hsl(var(--muted-foreground))',
                }}
              >{t.label}</button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <>
              {tab === 'overview' && (
                <div className="space-y-5">
                  {/* Cumulative revenue area chart */}
                  <SectionCard title="Cumulative Revenue" icon={TrendingUp}>
                    {(() => {
                      const daily: { date: string; revenue: number }[] = [];
                      const map = new Map<string, number>();
                      for (const o of orders) {
                        const day = o.created_at.slice(0, 10);
                        map.set(day, (map.get(day) ?? 0) + orderTotal(o));
                      }
                      let cumulative = 0;
                      const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                      for (const [date, rev] of sorted) {
                        cumulative += rev;
                        daily.push({ date: date.slice(5), revenue: +cumulative.toFixed(2) });
                      }
                      return (
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={daily}>
                            <defs>
                              <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#1ABF7A" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#1ABF7A" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="revenue" stroke="#1ABF7A" fill="url(#cumGrad)" strokeWidth={2.5} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </SectionCard>

                  {/* Business averages */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Avg Revenue / Day', value: formatCurrency(metrics.avgPerDay) },
                      { label: 'Avg Revenue / Hour', value: formatCurrency(metrics.avgPerDay / 24) },
                      { label: 'Monthly Projection', value: formatCurrency(metrics.avgPerDay * 30) },
                    ].map((m) => (
                      <div key={m.label} className="bg-white rounded-xl border p-4 text-center" style={{ borderColor: 'hsl(var(--border))' }}>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{m.label}</p>
                        <p className="text-2xl font-black" style={{ color: '#05253D' }}>{m.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Quick analytics preview: peak hour + peak day */}
                  <div className="grid grid-cols-2 gap-5">
                    <SectionCard title="Peak Hours" icon={Clock}>
                      {(() => {
                        const hourlyData: { hour: string; revenue: number }[] = [];
                        const map = new Map<number, number>();
                        for (const o of orders) {
                          const h = new Date(o.created_at).getHours();
                          map.set(h, (map.get(h) ?? 0) + orderTotal(o));
                        }
                        for (let h = 0; h < 24; h++) {
                          hourlyData.push({ hour: `${h.toString().padStart(2, '0')}:00`, revenue: +(map.get(h) ?? 0).toFixed(2) });
                        }
                        return (
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={hourlyData}>
                              <XAxis dataKey="hour" tick={{ fontSize: 8 }} interval={3} />
                              <YAxis hide />
                              <Tooltip content={<CustomTooltip />} />
                              <Bar dataKey="revenue" fill="#1ABF7A" radius={[2, 2, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        );
                      })()}
                    </SectionCard>
                    <SectionCard title="Peak Days" icon={Calendar}>
                      {(() => {
                        const dowData = DAY_NAMES.map((name, i) => {
                          let total = 0;
                          for (const o of orders) {
                            if (new Date(o.created_at).getDay() === i) total += orderTotal(o);
                          }
                          return { day: name, revenue: +total.toFixed(2) };
                        });
                        return (
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={dowData}>
                              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                              <YAxis hide />
                              <Tooltip content={<CustomTooltip />} />
                              <Bar dataKey="revenue" fill="#F5A623" radius={[2, 2, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        );
                      })()}
                    </SectionCard>
                  </div>
                </div>
              )}

              {tab === 'analytics' && <AnalyticsTab orders={orders} allOrders={allOrders} />}
              {tab === 'customers' && <CustomersTab orders={orders} />}
              {tab === 'groups' && <GroupsTab orders={orders} />}
              {tab === 'snapshots' && <SnapshotsTab />}
            </>
          )}
        </div>

        {/* Right: projection calculator (always visible) */}
        <ProjectionCalculator grossRevenue={metrics.grossRevenue} range={range} />
      </div>
    </div>
  );
}
