import * as React from 'react';
import { cn } from './cn';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'bg-card text-card-foreground rounded-xl border border-outline-variant shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-center justify-between px-4 py-3 border-b border-outline-variant', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('text-sm font-semibold text-foreground tracking-tight', className)}
      {...props}
    />
  );
}

/** c360 micro-label: mono, uppercase, widely tracked. */
export function MicroLabel({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'font-mono text-[10px] font-semibold text-muted-foreground uppercase tracking-widest',
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-4', className)} {...props} />;
}
