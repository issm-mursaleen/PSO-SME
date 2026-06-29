'use client';

import {
  BarChart3, Lightbulb, AlertCircle, Sparkles, ChevronRight, LineChart, PieChart, Target, TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart as RePieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AlaraChatMessage } from '@/lib/alara/types';

type Step = { label: string; prompt: string; reason?: string; tone?: string };
type VisualPoint = {
  label: string;
  value: number;
  target?: number;
  meta?: string;
  tone?: string;
  rank?: number;
  invoiceCount?: number;
  lastVisitDays?: number;
  period?: string;
  customerId?: string;
};

interface VisualizationCardProps {
  msg: AlaraChatMessage;
  actions: { onPrompt: (prompt: string) => void };
}

const str = (v: unknown) => String(v ?? '');
const pkr = (v: number) => `PKR ${Math.round(v).toLocaleString()}`;

const CHART_COLORS = ['#1a1a18', '#4caf79', '#f59e0b', '#3b82f6', '#ef4444', '#787776'];
const GRID = '#ededea';
const AXIS = { stroke: '#a8a7a4', fontSize: 10, tickLine: false, axisLine: false };

const CHART_META: Record<string, { icon: typeof BarChart3; label: string }> = {
  kpi: { icon: BarChart3, label: 'Live data' },
  bar: { icon: BarChart3, label: 'Ranked view' },
  area: { icon: LineChart, label: 'Trend view' },
  line: { icon: LineChart, label: 'Trend view' },
  donut: { icon: PieChart, label: 'Split view' },
  progress: { icon: Target, label: 'Target view' },
};

function toneColor(tone?: string) {
  if (tone === 'urgent') return '#ef4444';
  if (tone === 'opportunity') return '#4caf79';
  return '#1a1a18';
}

function compactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return value.toLocaleString();
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: unknown; payload?: VisualPoint }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const point = row.payload;
  return (
    <div className="rounded-lg border border-outline-variant bg-card px-2.5 py-2 text-[11px] shadow-md">
      <p className="font-semibold text-foreground">
        {point?.rank ? `#${point.rank} ` : ''}{label ?? point?.label}
      </p>
      <p className="mt-0.5 font-mono text-muted-foreground tabular-nums">
        {point?.meta ?? Number(row.value ?? 0).toLocaleString()}
      </p>
      {typeof point?.invoiceCount === 'number' && !point?.meta && (
        <p className="mt-0.5 font-mono text-muted-foreground tabular-nums">{point.invoiceCount} invoices</p>
      )}
      {typeof point?.lastVisitDays === 'number' && (
        <p className="mt-0.5 font-mono text-muted-foreground tabular-nums">Last visit: {point.lastVisitDays}d ago</p>
      )}
      {point?.period && <p className="mt-0.5 text-[10px] text-muted-foreground">{point.period}</p>}
    </div>
  );
}

const STAT_COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' };

function StatStrip({ stats, chartType }: { stats: { label: string; value: unknown }[]; chartType: string }) {
  if (!stats.length) return null;
  const shown = stats.slice(0, 4);
  const cols = chartType === 'kpi' ? 'grid-cols-1 sm:grid-cols-3' : STAT_COLS[shown.length] ?? 'grid-cols-3';
  return (
    <div className={`grid gap-px border-b border-outline-variant bg-outline-variant/70 ${cols}`}>
      {shown.map((s, i) => (
        <div key={i} className="min-w-0 bg-card px-3 py-2.5">
          <p className="truncate font-mono text-[9px] uppercase text-muted-foreground">{s.label}</p>
          <p className={`mt-1 truncate font-semibold tabular-nums text-foreground ${chartType === 'kpi' ? 'text-base' : 'text-xs'}`}>
            {str(s.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-44 items-center justify-center border-t border-outline-variant bg-surface-container-lowest px-3 text-center text-xs text-muted-foreground">
      No visualization data is available yet.
    </div>
  );
}

function BarPoints({ points, onPrompt }: { points: VisualPoint[]; onPrompt: (p: string) => void }) {
  const data = points.map((p) => ({ ...p, fill: toneColor(p.tone) }));
  const clickable = data.some((p) => p.customerId);
  return (
    <div className="h-64 border-t border-outline-variant bg-card p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" {...AXIS} tickFormatter={(v) => compactNumber(Number(v))} />
          <YAxis type="category" dataKey="label" {...AXIS} width={98} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f0efeb' }} />
          <Bar
            dataKey="value"
            radius={[0, 5, 5, 0]}
            barSize={14}
            style={clickable ? { cursor: 'pointer' } : undefined}
            onClick={(entry) => {
              const point = entry as unknown as VisualPoint;
              if (point?.customerId) onPrompt(`${point.label} ka page kholo`);
            }}
          >
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v: unknown) => pkr(Number(v))}
              style={{ fontSize: 10, fontFamily: 'monospace', fill: '#1a1a18' }}
            />
            {data.map((p, i) => (
              <Cell key={`${p.label}-${i}`} fill={p.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LinePoints({ points }: { points: VisualPoint[] }) {
  return (
    <div className="h-64 border-t border-outline-variant bg-card p-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
          <YAxis {...AXIS} tickFormatter={(v) => compactNumber(Number(v))} />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#1a1a18"
            strokeWidth={2.5}
            fill="#ededea"
            dot={{ r: 3, fill: '#ffffff', stroke: '#1a1a18', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutPoints({ points }: { points: VisualPoint[] }) {
  const total = points.reduce((s, p) => s + Number(p.value), 0);
  const leader = points.slice().sort((a, b) => b.value - a.value)[0];
  return (
    <div className="grid gap-3 border-t border-outline-variant bg-card p-3 sm:grid-cols-[220px_1fr]">
      <div className="relative h-52 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <RePieChart>
            <Pie data={points} dataKey="value" nameKey="label" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="#ffffff" strokeWidth={2}>
              {points.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </RePieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="font-mono text-lg font-bold text-foreground">{compactNumber(total)}</p>
          <p className="mt-0.5 text-[9px] uppercase text-muted-foreground">total</p>
        </div>
      </div>
      <div className="min-w-0 self-center space-y-2">
        {points.map((p, i) => {
          const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
          return (
            <div key={`${p.label}-${i}`} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="truncate font-medium text-foreground">{p.label}</span>
              </span>
              <span className="shrink-0 font-mono text-muted-foreground">{p.meta ?? `${pct}%`}</span>
            </div>
          );
        })}
        {leader && (
          <p className="border-t border-outline-variant pt-2 text-[10px] text-muted-foreground">
            Lead segment: <span className="font-semibold text-foreground">{leader.label}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function ProgressPoints({ points }: { points: VisualPoint[] }) {
  return (
    <div className="space-y-3 border-t border-outline-variant bg-card p-3">
      {points.map((p, i) => {
        const target = Math.max(1, Number(p.target ?? p.value) || 1);
        const rawPct = Math.round((Number(p.value) / target) * 100);
        const pct = Math.max(2, Math.min(100, rawPct));
        return (
          <div key={`${p.label}-${i}`} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate font-medium text-foreground">{p.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{p.meta ?? `${p.value}/${target}`}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: toneColor(p.tone) }} />
              </div>
              <span className="w-9 text-right font-mono text-[10px] text-muted-foreground">{rawPct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const stepColor = (tone?: string) =>
  tone === 'urgent' ? 'text-danger' : tone === 'opportunity' ? 'text-success' : 'text-warning';

function StepButton({ s, onPrompt }: { s: Step; onPrompt: (p: string) => void }) {
  const iconClass = `size-3.5 shrink-0 ${stepColor(s.tone)}`;
  return (
    <button
      onClick={() => onPrompt(s.prompt)}
      className="group flex w-full items-center gap-2.5 rounded-lg border border-outline-variant bg-card px-3 py-2 text-left transition-colors hover:bg-muted hover:border-foreground/30"
    >
      {s.tone === 'urgent' ? (
        <AlertCircle className={iconClass} />
      ) : s.tone === 'opportunity' ? (
        <Sparkles className={iconClass} />
      ) : (
        <Lightbulb className={iconClass} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{s.label}</span>
        {s.reason && <span className="block truncate text-[10px] text-muted-foreground">{s.reason}</span>}
      </span>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

function ChartBody({
  chartType,
  points,
  onPrompt,
}: {
  chartType: string;
  points: VisualPoint[];
  onPrompt: (p: string) => void;
}) {
  if (chartType === 'kpi') return null;
  if (!points.length) return <EmptyChart />;
  if (chartType === 'line' || chartType === 'area') return <LinePoints points={points} />;
  if (chartType === 'donut') return <DonutPoints points={points} />;
  if (chartType === 'progress') return <ProgressPoints points={points} />;
  return <BarPoints points={points} onPrompt={onPrompt} />;
}

type InsightFact = { type: string; label: string; formatted_value: string };
type Insights = { headline: string; facts: InsightFact[]; recommendedAction?: { label: string; prompt: string } };

function InsightsBlock({ insights, onPrompt }: { insights: Insights; onPrompt: (p: string) => void }) {
  return (
    <div className="border-t border-outline-variant bg-surface-container-lowest p-3">
      <p className="mb-1.5 font-mono text-[9px] font-bold uppercase text-muted-foreground">Insights</p>
      <p className="text-[11px] leading-relaxed text-foreground/90">{insights.headline}</p>
      {insights.facts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {insights.facts.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border border-outline-variant bg-card px-2 py-1 text-[10px]"
            >
              <span className="text-muted-foreground">{f.label}:</span>
              <span className="font-semibold text-foreground">{f.formatted_value}</span>
            </span>
          ))}
        </div>
      )}
      {insights.recommendedAction && (
        <button
          onClick={() => onPrompt(insights.recommendedAction!.prompt)}
          className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-outline-variant bg-card px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted hover:border-foreground/30"
        >
          {insights.recommendedAction.label}
          <ChevronRight className="size-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

/** The body of a visualization card (everything except the title/subtitle
 *  header): stats strip, chart, insights/explanation, suggested steps. Shared
 *  by the single-chart VisualizationCard and TabbedVisualizationCard's
 *  per-tab content, so chart rendering is never duplicated. */
export function VisualizationBody({ cardData, onPrompt }: { cardData: Record<string, unknown>; onPrompt: (p: string) => void }) {
  const d = cardData;
  const points = Array.isArray(d.points)
    ? (d.points as VisualPoint[]).filter((p) => Number.isFinite(Number(p.value)))
    : [];
  const stats = Array.isArray(d.stats) ? (d.stats as { label: string; value: unknown }[]) : [];
  const explanation = Array.isArray(d.explanation) ? (d.explanation as string[]) : [];
  const insights = d.insights as Insights | undefined;
  const steps = Array.isArray(d.steps) ? (d.steps as Step[]) : [];
  const chartType = str(d.chartType) || 'bar';

  return (
    <>
      <StatStrip stats={stats} chartType={chartType} />
      <ChartBody chartType={chartType} points={points} onPrompt={onPrompt} />

      {insights ? (
        <InsightsBlock insights={insights} onPrompt={onPrompt} />
      ) : (
        explanation.length > 0 && (
          <div className="border-t border-outline-variant bg-surface-container-lowest p-3">
            <p className="mb-1.5 font-mono text-[9px] font-bold uppercase text-muted-foreground">Explanation</p>
            <ul className="space-y-1">
              {explanation.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground/90">
                  <span className="mt-1.5 size-1 rounded-full bg-foreground/60 shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {steps.length > 0 && (
        <div className="space-y-1.5 border-t border-outline-variant bg-surface-container-lowest p-2">
          {steps.map((s, i) => <StepButton key={i} s={s} onPrompt={onPrompt} />)}
        </div>
      )}
    </>
  );
}

export function VisualizationCard({ msg, actions }: VisualizationCardProps) {
  const d = msg.cardData ?? {};
  const chartType = str(d.chartType) || 'bar';
  const meta = CHART_META[chartType] ?? CHART_META.bar;
  const HeaderIcon = meta.icon;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-outline-variant bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-3 py-2.5">
        <div className="min-w-0">
          <span className="font-mono text-[10px] font-bold uppercase text-foreground">
            <HeaderIcon className="inline size-3 mr-1 -mt-0.5 text-primary" />{str(d.title) || 'Visualization'}
          </span>
          {str(d.subtitle) && <p className="mt-0.5 text-[10px] text-muted-foreground">{str(d.subtitle)}</p>}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-outline-variant bg-muted px-2 py-1 font-mono text-[9px] font-bold uppercase text-foreground">
          <TrendingUp className="size-3" /> {meta.label}
        </span>
      </div>

      <VisualizationBody cardData={d} onPrompt={actions.onPrompt} />
    </div>
  );
}
