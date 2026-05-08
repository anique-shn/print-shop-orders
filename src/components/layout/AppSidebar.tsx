'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Users, Settings,
  Printer, ChevronLeft, ChevronRight, Receipt, BookOpen, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const navItems = [
  { href: '/',          label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/orders',    label: 'Orders',     icon: ShoppingCart },
  { href: '/catalog',   label: 'Catalog',    icon: BookOpen },
  { href: '/customers', label: 'Customers',  icon: Users },
  { href: '/invoices',  label: 'Invoices',   icon: Receipt },
  { href: '/revenue',   label: 'Revenue',    icon: TrendingUp },
  { href: '/settings',  label: 'Settings',   icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col h-screen sticky top-0 shrink-0 transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-14' : 'w-52'
      )}
      style={{ background: 'hsl(var(--sidebar-background))' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 min-h-14 border-b border-white/10 shrink-0 overflow-hidden">
        <div
          className="flex items-center justify-center h-7 w-7 rounded-lg shrink-0"
          style={{ background: 'hsl(218 91% 57%)' }}
        >
          <Printer className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-white font-bold text-sm font-heading truncate">Print Shop</span>
            <span className="text-white/40 text-[10px] truncate">Orders & Invoicing</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const active = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
