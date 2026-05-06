'use client';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
}

const variantClasses = {
  default: 'bg-[hsl(218_91%_57%)] text-white hover:bg-[hsl(218_91%_50%)] shadow-sm',
  outline: 'border border-[hsl(var(--border))] bg-transparent hover:bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]',
  ghost: 'hover:bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]',
  destructive: 'bg-[hsl(var(--destructive))] text-white hover:bg-[hsl(353_79%_48%)]',
  secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(210_40%_88%)]',
  link: 'text-[hsl(218_91%_57%)] underline-offset-4 hover:underline p-0 h-auto',
};

const sizeClasses = {
  default: 'h-9 px-4 py-2 text-sm',
  sm: 'h-7 px-3 text-xs rounded-md',
  lg: 'h-11 px-8 text-base',
  icon: 'h-9 w-9',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
