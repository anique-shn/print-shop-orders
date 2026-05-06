import * as React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

const variants = {
  default: 'bg-[hsl(218_91%_57%)] text-white',
  secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]',
  outline: 'border border-[hsl(var(--border))] text-[hsl(var(--foreground))]',
  destructive: 'bg-[hsl(var(--destructive))] text-white',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
