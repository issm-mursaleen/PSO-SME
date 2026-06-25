import * as React from 'react';
import { cn } from './cn';

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return <table className={cn('w-full text-left border-collapse', className)} {...props} />;
}

export function THead({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      className={cn(
        'bg-surface-container-low font-mono text-[10px] uppercase tracking-widest text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function Th({ className, ...props }: React.ComponentProps<'th'>) {
  return <th className={cn('px-4 py-2.5 font-semibold whitespace-nowrap', className)} {...props} />;
}

export function TBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-outline-variant text-sm', className)} {...props} />;
}

export function TRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('hover:bg-muted/40 transition-colors', className)} {...props} />;
}

export function Td({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
}
