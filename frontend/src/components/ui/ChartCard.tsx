'use client';

import { useState, useRef, useCallback } from 'react';
import { Info } from 'lucide-react';
import { cn } from './cn';

/**
 * Callback-ref IntersectionObserver — fires whenever the node attaches, so it
 * works even when the chart card mounts after an async load. Ported from c360
 * rm-workspace/performance.
 */
export function useInView(threshold = 0.05): [(node: HTMLDivElement | null) => void, boolean] {
  const [isInView, setIsInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node) return;
      if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
        setIsInView(true);
        return;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        },
        { threshold },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [threshold],
  );

  return [setRef, isInView];
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group/info shrink-0">
      <button
        type="button"
        tabIndex={0}
        aria-label="Visualization details"
        className="text-outline hover:text-foreground focus:text-foreground transition-colors outline-none"
      >
        <Info className="size-3.5" />
      </button>
      <span
        role="tooltip"
        className="invisible group-hover/info:visible group-focus-within/info:visible opacity-0 group-hover/info:opacity-100 group-focus-within/info:opacity-100 transition-opacity duration-150 absolute z-20 top-full right-0 mt-1.5 w-60 rounded-lg bg-inverse-surface text-inverse-on-surface text-[10px] leading-relaxed font-normal p-2.5 shadow-lg pointer-events-none"
      >
        {text}
      </span>
    </span>
  );
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  info?: string;
  className?: string;
  children: React.ReactNode;
}

/** Animated, in-view-revealed chart card matching the c360 visualizations tab. */
export function ChartCard({ title, subtitle, info, className, children }: ChartCardProps) {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-outline-variant shadow-card bg-card p-5 hover:shadow-card-hover transition-all duration-700 ease-out flex flex-col',
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        className,
      )}
    >
      <div className="mb-3 shrink-0 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-widest text-foreground">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {info && <InfoTooltip text={info} />}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

/** Shared recharts tooltip styling (neutral c360 surface). */
export const chartTooltip = {
  contentStyle: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e4e0',
    borderRadius: '12px',
    color: '#1a1a18',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -4px rgba(0,0,0,0.05)',
    fontSize: '11px',
  },
  itemStyle: { color: '#1a1a18' },
  labelStyle: { color: '#787776', fontSize: '10px' },
};

/** Chart series palette — neutral-led with status accents. */
export const CHART_COLORS = ['#1a1a18', '#4caf79', '#f59e0b', '#ef4444', '#3b82f6', '#787776', '#d97706'];
export const AXIS = { stroke: '#a8a7a4', fontSize: 10 };
export const GRID = '#ededea';
