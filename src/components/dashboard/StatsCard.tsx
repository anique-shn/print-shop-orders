'use client';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: { value: string; up: boolean };
}

export function StatsCard({ title, value, description, icon: Icon, iconColor = 'hsl(218 91% 57%)', trend }: StatsCardProps) {
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-[hsl(var(--muted-foreground))] font-medium">{title}</p>
          <p className="text-2xl font-bold font-heading text-[hsl(var(--foreground))]">{value}</p>
          {description && <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>}
        </div>
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${iconColor}1a` }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={cn('font-semibold', trend.up ? 'text-[hsl(152_74%_42%)]' : 'text-[hsl(353_79%_55%)]')}>
            {trend.up ? '↑' : '↓'} {trend.value}
          </span>
          <span className="text-[hsl(var(--muted-foreground))]">vs last month</span>
        </div>
      )}
    </div>
  );
}
