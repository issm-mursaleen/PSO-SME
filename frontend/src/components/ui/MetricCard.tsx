import * as React from 'react';
import { cn } from './cn';

interface MetricCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** small line under the value (trend / context) */
  hint?: React.ReactNode;
  hintIcon?: React.ReactNode;
  /** colour the value + hint (e.g. for credit/danger) */
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

const VALUE_TONE: Record<NonNullable<MetricCardProps['tone']>, string> = {
  default: 'text-foreground',
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  info: 'text-info-text',
};

export function MetricCard({
  label,
  value,
  hint,
  hintIcon,
  tone = 'default',
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-outline-variant px-4 py-3 shadow-card hover:shadow-card-hover transition-shadow animate-fade-in',
        className,
      )}
    >
      <p className="font-mono text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        {label}
      </p>
      <p className={cn('text-2xl font-bold tracking-tight mt-2 tabular-nums', VALUE_TONE[tone])}>
        {value}
      </p>
      {hint && (
        <div
          className={cn(
            'mt-2 flex items-center gap-1 text-[11px] font-semibold',
            tone === 'default' ? 'text-muted-foreground' : VALUE_TONE[tone],
          )}
        >
          {hintIcon}
          <span>{hint}</span>
        </div>
      )}
    </div>
  );
}
