'use client';

// OpenAI credits used by the chat — daily / weekly / monthly counters, sourced
// from the backend /api/usage rollup (real cost from token usage on LLM calls).

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Coins, Calendar, CalendarDays, CalendarRange, Hash, WifiOff } from 'lucide-react';
import { fetchUsage, type UsageSummary, type UsageBucket } from '@/lib/api';

const safeNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const fmtPKR = (n: unknown) => {
  const value = safeNumber(n);
  return `Rs ${value < 1 ? value.toFixed(4) : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};
const fmtUSD = (n: unknown) => safeNumber(n).toFixed(4);
const fmtNum = (n: unknown) => safeNumber(n).toLocaleString();
const USAGE_CACHE_KEY = 'alara-usage-cache-v1';

const ZERO: UsageBucket = { cost: 0, cost_usd: 0, tokens: 0, requests: 0 };
function emptySummary(): UsageSummary {
  const today = new Date();
  const series = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (13 - i));
    return { date: d.toISOString().slice(0, 10), cost: 0, cost_usd: 0, requests: 0 };
  });
  return {
    today: ZERO,
    week: ZERO,
    month: ZERO,
    total: ZERO,
    series,
    model: '—',
    currency: 'PKR',
    llm_enabled: false,
    total_budget_usd: 10,
    total_budget_pkr: 2800,
    remaining_usd: 10,
    remaining_pkr: 2800,
  };
}

const normalizeBucket = (bucket: Partial<UsageBucket> | null | undefined): UsageBucket => ({
  cost: safeNumber(bucket?.cost),
  cost_usd: safeNumber(bucket?.cost_usd),
  tokens: safeNumber(bucket?.tokens),
  requests: safeNumber(bucket?.requests),
});

const normalizeSummary = (summary: Partial<UsageSummary> | null | undefined): UsageSummary => {
  const fallback = emptySummary();
  const series = Array.isArray(summary?.series)
    ? summary.series.map((entry) => ({
        date: String(entry?.date ?? ''),
        cost: safeNumber(entry?.cost),
        cost_usd: safeNumber(entry?.cost_usd),
        requests: safeNumber(entry?.requests),
      }))
    : fallback.series;

  return {
    today: normalizeBucket(summary?.today),
    week: normalizeBucket(summary?.week),
    month: normalizeBucket(summary?.month),
    total: normalizeBucket(summary?.total),
    series,
    model: String(summary?.model ?? fallback.model),
    currency: String(summary?.currency ?? fallback.currency),
    llm_enabled: Boolean(summary?.llm_enabled),
    total_budget_usd: safeNumber(summary?.total_budget_usd, fallback.total_budget_usd),
    total_budget_pkr: safeNumber(summary?.total_budget_pkr, fallback.total_budget_pkr),
    remaining_usd: safeNumber(summary?.remaining_usd, fallback.remaining_usd),
    remaining_pkr: safeNumber(summary?.remaining_pkr, fallback.remaining_pkr),
  };
};

function StatCard({
  label, bucket, Icon,
}: { label: string; bucket: UsageBucket; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-outline-variant bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground tabular-nums">{fmtPKR(bucket.cost)}</p>
      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">${fmtUSD(bucket.cost_usd)}</p>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Hash className="size-3" />{fmtNum(bucket.tokens)} tok</span>
        <span className="tabular-nums">{fmtNum(bucket.requests)} calls</span>
      </div>
    </div>
  );
}

export function UsagePanel() {
  const [data, setData] = useState<UsageSummary | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = normalizeSummary(await fetchUsage());
      setData(fresh);
      setOffline(false);
      try { window.localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify(fresh)); } catch { /* ignore */ }
    } catch {
      // Backend down → show the last cached numbers (or zeros), never a dead screen.
      setOffline(true);
      let cached: UsageSummary | null = null;
      try {
        const raw = window.localStorage.getItem(USAGE_CACHE_KEY);
        if (raw) cached = normalizeSummary(JSON.parse(raw) as Partial<UsageSummary>);
      } catch { /* ignore */ }
      setData(cached ?? emptySummary());
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch usage on mount
  useEffect(() => { load(); }, [load]);

  const maxCost = data ? Math.max(...data.series.map((d) => safeNumber(d.cost)), 0.000001) : 1;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hidden px-6 pt-8 pb-10">
      <div className="w-full max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Coins className="size-4 text-foreground" />
            <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-foreground">OpenAI Credits</h2>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-outline-variant text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {!data ? (
          <p className="text-sm text-muted-foreground">Loading usage…</p>
        ) : (
          <>
            {offline ? (
              <div className="mb-4 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-[11px] text-muted-foreground">
                <p className="flex items-center gap-2 font-medium text-warning-text">
                  <WifiOff className="size-3.5 shrink-0" /> Usage backend offline — last saved numbers dikha rahe hain.
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">
                  Backend chalayein: <span className="text-foreground">cd backend &amp;&amp; uvicorn app.main:app --port 8000</span>
                </p>
              </div>
            ) : !data.llm_enabled ? (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-warning-light px-3 py-2 text-[11px] font-medium text-warning-text">
                <WifiOff className="size-3.5 shrink-0" />
                LLM offline (no API key) — chat fallback parser bilkul free hai, is liye counters 0 reh sakte hain.
              </div>
            ) : null}

            {/* API Key Balance Card */}
            <div className="mb-5 rounded-lg border border-outline-variant bg-card p-4 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Coins className="size-4 text-primary" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">API Key Balance</span>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded border border-outline-variant text-muted-foreground uppercase tracking-widest bg-muted/30">
                  Model: {data.model}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Kept in Key</p>
                  <p className="text-lg font-bold text-foreground mt-0.5 tabular-nums">
                    {fmtPKR(data.total_budget_pkr)} <span className="text-xs text-muted-foreground font-normal">(${safeNumber(data.total_budget_usd).toFixed(2)})</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Spent</p>
                  <p className="text-lg font-bold text-foreground mt-0.5 tabular-nums">
                    {fmtPKR(data.total.cost)} <span className="text-xs text-muted-foreground font-normal">(${fmtUSD(data.total.cost_usd)})</span>
                  </p>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Balance Left</p>
                  <p className="text-lg font-extrabold text-success-text mt-0.5 tabular-nums">
                    {fmtPKR(data.remaining_pkr)} <span className="text-xs text-success-text/80 font-normal">(${fmtUSD(data.remaining_usd)})</span>
                  </p>
                </div>
              </div>

              {/* Visual budget usage progress bar */}
              <div className="mt-4">
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-outline-variant/30">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        (safeNumber(data.total.cost_usd) / Math.max(safeNumber(data.total_budget_usd), 0.000001)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground mt-1.5 font-bold uppercase tracking-wider">
                  <span>{((safeNumber(data.total.cost_usd) / Math.max(safeNumber(data.total_budget_usd), 0.000001)) * 100).toFixed(1)}% Used</span>
                  <span>{((safeNumber(data.remaining_usd) / Math.max(safeNumber(data.total_budget_usd), 0.000001)) * 100).toFixed(1)}% Left</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Today" bucket={data.today} Icon={Calendar} />
              <StatCard label="This Week" bucket={data.week} Icon={CalendarDays} />
              <StatCard label="This Month" bucket={data.month} Icon={CalendarRange} />
              <StatCard label="All Time" bucket={data.total} Icon={Coins} />
            </div>

            {/* 14-day cost trend */}
            <div className="mt-5 rounded-lg border border-outline-variant bg-card p-4 shadow-card">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
                Last 14 days
              </p>
              <div className="flex items-end gap-1.5 h-28">
                {data.series.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full flex items-end h-24">
                      <div
                        className="w-full rounded-t-sm bg-foreground/80 group-hover:bg-foreground transition-all min-h-[2px]"
                        style={{ height: `${Math.max((safeNumber(d.cost) / maxCost) * 100, safeNumber(d.cost) > 0 ? 4 : 0)}%` }}
                        title={`${d.date}: ${fmtPKR(d.cost)} ($${fmtUSD(d.cost_usd)}) · ${fmtNum(d.requests)} calls`}
                      />
                    </div>
                    <span className="font-mono text-[8px] text-muted-foreground">{d.date.slice(8)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
