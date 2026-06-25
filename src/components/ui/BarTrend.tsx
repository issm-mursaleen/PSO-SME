'use client';

import { cn } from './cn';

interface BarTrendProps {
  /** bar heights as 0–100 percentages */
  data: number[];
  labels?: string[];
  /** optional per-bar hover tooltip text */
  tooltips?: string[];
  /** highlight the final bar in solid foreground */
  highlightLast?: boolean;
  className?: string;
  barClassName?: string;
  height?: number;
}

/**
 * c360 flex-bar mini chart (ported from customer-detail/NetWorthTrend).
 * Pure CSS bars — no chart lib. Last bar is emphasised in foreground.
 */
export function BarTrend({
  data,
  labels,
  tooltips,
  highlightLast = true,
  className,
  barClassName,
  height = 96,
}: BarTrendProps) {
  return (
    <div className={cn('w-full', className)}>
      <div className="w-full flex items-end justify-between gap-1.5" style={{ height }}>
        {data.map((h, i) => {
          const isLast = highlightLast && i === data.length - 1;
          return (
            <div key={i} className="group relative flex-1 h-full flex items-end">
              <div
                className={cn(
                  'w-full rounded-t-sm transition-all duration-500',
                  isLast ? 'bg-foreground' : 'bg-muted group-hover:bg-surface-container-highest',
                  barClassName,
                )}
                style={{ height: `${Math.max(2, Math.min(100, h))}%` }}
              />
              {tooltips?.[i] && (
                <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-inverse-surface px-2 py-1 text-[10px] text-inverse-on-surface whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  {tooltips[i]}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {labels && (
        <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
