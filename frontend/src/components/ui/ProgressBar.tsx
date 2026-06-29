import { cn } from './cn';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  label?: string;
  dotClassName?: string;
  barClassName?: string;
  className?: string;
}

export function ProgressBar({
  value,
  label,
  dotClassName = 'bg-foreground',
  barClassName = 'bg-foreground',
  className,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="flex items-center gap-2 text-xs text-foreground">
            <span className={cn('w-2 h-2 rounded-full', dotClassName)} />
            {label}
          </span>
          <span className="text-xs font-semibold tabular-nums text-foreground">{pct}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barClassName)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
