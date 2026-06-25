'use client';

import { cn } from './cn';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** fill colour (hex) */
  fill: string;
  /** tailwind dot class for the legend (e.g. "bg-emerald-400") */
  dot: string;
}

const CX = 80;
const CY = 80;
const R_OUTER = 72;
const R_INNER = 44;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(startDeg: number, endDeg: number) {
  if (endDeg - startDeg >= 359.99) {
    return [
      `M ${CX} ${CY - R_OUTER}`,
      `A ${R_OUTER} ${R_OUTER} 0 1 1 ${CX - 0.01} ${CY - R_OUTER}`,
      `L ${CX} ${CY - R_INNER}`,
      `A ${R_INNER} ${R_INNER} 0 1 0 ${CX} ${CY - R_INNER}`,
      'Z',
    ].join(' ');
  }
  const oS = polar(CX, CY, R_OUTER, startDeg);
  const oE = polar(CX, CY, R_OUTER, endDeg);
  const iE = polar(CX, CY, R_INNER, endDeg);
  const iS = polar(CX, CY, R_INNER, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${oS.x} ${oS.y}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${oE.x} ${oE.y}`,
    `L ${iE.x} ${iE.y}`,
    `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${iS.x} ${iS.y}`,
    'Z',
  ].join(' ');
}

interface DonutProps {
  segments: DonutSegment[];
  /** big number rendered in the hole; defaults to the summed value */
  centerValue?: React.ReactNode;
  centerLabel?: string;
  size?: number;
  className?: string;
  legend?: boolean;
}

/**
 * Pure-SVG donut chart ported from c360 overview/churn-pie-chart.
 */
export function Donut({
  segments,
  centerValue,
  centerLabel = 'total',
  size = 150,
  className,
  legend = true,
}: DonutProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  let angle = 0;
  const slices = segments
    .map((seg) => {
      const sweep = total > 0 ? (seg.value / total) * 360 : 0;
      const start = angle;
      angle += sweep;
      return { ...seg, start, end: angle };
    })
    .filter((s) => s.value > 0);

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden>
          {total === 0 || slices.length === 0 ? (
            <>
              <circle cx={CX} cy={CY} r={R_OUTER} fill="#e5e4e0" />
              <circle cx={CX} cy={CY} r={R_INNER} fill="#fff" />
            </>
          ) : (
            slices.map((s) => (
              <path key={s.key} d={slicePath(s.start, s.end)} fill={s.fill} stroke="#fff" strokeWidth={2} />
            ))
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-foreground tabular-nums">
            {centerValue ?? total}
          </span>
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
            {centerLabel}
          </span>
        </div>
      </div>

      {legend && (
        <div className="w-full grid grid-cols-2 gap-x-3 gap-y-1.5">
          {segments.map((seg) => {
            const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
            return (
              <div key={seg.key} className="flex items-center gap-1.5 min-w-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', seg.dot)} />
                <span className="text-[10px] text-muted-foreground truncate">
                  {seg.label}{' '}
                  <span className="font-semibold text-foreground">{seg.value.toLocaleString()}</span>
                  <span className="text-muted-foreground/80"> ({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
