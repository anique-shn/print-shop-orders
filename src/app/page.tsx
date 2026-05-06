'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ShoppingCart, Package, Clock, DollarSign, TrendingUp,
  Plus, ArrowRight, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, ORDER_STATUSES } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Order } from '@/types/database';

function StatusBadge({ status }: { status: string }) {
  const def = ORDER_STATUSES.find((s) => s.value === status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${def?.color ?? ''}`}>
      {def?.label ?? status}
    </span>
  );
}

function SkeletonCard() {
  return (
    <Card className="p-6">
      <div className="skeleton-shimmer h-4 w-24 mb-3" />
      <div className="skeleton-shimmer h-8 w-32" />
    </Card>
  );
}

function useStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [ordersRes, paidInvRes] = await Promise.all([
        supabase.from('orders').select('id, status'),
        supabase.from('invoices').select('id, invoice_items(qty, rate)').eq('status', 'paid'),
      ]);

      const orders = (ordersRes.data ?? []) as { status: string }[];
      const total = orders.length;
      const inProduction = orders.filter((o) => o.status === 'production').length;
      const ready = orders.filter((o) => o.status === 'ready').length;
      const paidInvoices = (paidInvRes.data ?? []) as { invoice_items?: { qty: number; rate: number }[] }[];
      const revenue = paidInvoices.reduce((sum, inv) => {
        return sum + (inv.invoice_items ?? []).reduce((s, i) => s + i.qty * i.rate, 0);
      }, 0);

      return { total, inProduction, ready, revenue };
    },
  });
}

function useRecentOrders() {
  return useQuery({
    queryKey: ['recent-orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_company, status, due_date, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      return (data ?? []) as Partial<Order>[];
    },
  });
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accentColor: string;
  sub?: string;
}

function StatCard({ label, value, icon: Icon, accentColor, sub }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {label}
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight font-heading">
              {value}
            </p>
            {sub && (
              <p className="mt-1 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {sub}
              </p>
            )}
          </div>
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accentColor}1a` }}
          >
            <Icon className="h-5 w-5" style={{ color: accentColor }} />
          </div>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5"
          style={{ backgroundColor: accentColor }}
        />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const stats = useStats();
  const recentOrders = useRecentOrders();

  return (
    <div className="animate-page-in space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading">Dashboard</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Welcome back — here&apos;s what&apos;s happening in your print shop.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/invoices?new=1">
              <Plus className="h-4 w-4" />
              New Invoice
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/orders?new=1">
              <Plus className="h-4 w-4" />
              New Order
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : stats.isError ? (
          <div className="col-span-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Failed to load stats. Check your Supabase connection.
          </div>
        ) : (
          <>
            <StatCard
              label="Total Orders"
              value={stats.data!.total}
              icon={ShoppingCart}
              accentColor="hsl(218, 91%, 57%)"
              sub="All time"
            />
            <StatCard
              label="In Production"
              value={stats.data!.inProduction}
              icon={Package}
              accentColor="hsl(38, 89%, 45%)"
              sub="Active jobs"
            />
            <StatCard
              label="Ready to Ship"
              value={stats.data!.ready}
              icon={Clock}
              accentColor="hsl(152, 74%, 38%)"
              sub="Awaiting pickup or shipment"
            />
            <StatCard
              label="Revenue (Paid)"
              value={formatCurrency(stats.data!.revenue)}
              icon={DollarSign}
              accentColor="hsl(152, 74%, 38%)"
              sub="From paid invoices"
            />
          </>
        )}
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-base font-semibold">Recent Orders</CardTitle>
            <p className="mt-0.5 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Last 5 orders across all statuses
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/orders">
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.isLoading ? (
            <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="skeleton-shimmer h-4 w-28" />
                  <div className="skeleton-shimmer h-4 w-36 flex-1" />
                  <div className="skeleton-shimmer h-5 w-20 rounded-full" />
                  <div className="skeleton-shimmer h-4 w-20" />
                </div>
              ))}
            </div>
          ) : !recentOrders.data?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="mb-3 h-10 w-10" style={{ color: 'hsl(var(--muted-foreground))' }} />
              <p className="font-medium">No orders yet</p>
              <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                Create your first order to get started tracking production.
              </p>
              <Button asChild className="mt-4" size="sm">
                <Link href="/orders?new=1">
                  <Plus className="h-4 w-4" />
                  New Order
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                    {['Order #', 'Customer', 'Status', 'Due Date', 'Created'].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.data!.map((order) => (
                    <tr
                      key={order.id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid hsl(var(--border))' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'hsl(var(--accent))')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/orders?id=${order.id}`}
                          className="font-mono text-sm font-semibold hover:underline"
                          style={{ color: 'hsl(218, 91%, 57%)' }}
                        >
                          {order.order_number}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium">{order.customer_name ?? '—'}</div>
                        {order.customer_company && (
                          <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            {order.customer_company}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={order.status!} />
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {order.due_date ? formatDate(order.due_date) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {order.created_at ? formatDate(order.created_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
