'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import {
  AlertTriangle,
  Activity,
  Sparkles,
  Phone,
  CheckCircle2,
  PackageSearch,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  ComposedChart,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, MetricCard, ChartCard, chartTooltip, CHART_COLORS, AXIS, GRID } from '@/components/ui';

type Timeframe = 'daily' | 'weekly' | 'monthly';

function money(value: number) {
  return `PKR ${Math.round(value).toLocaleString()}`;
}

/** Parses the dataset's date strings: "YYYY-MM-DD" or "YYYY-MM-DD h:mm AM/PM". */
function parseDate(raw: string): Date {
  const [datePart, ...timeParts] = raw.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  if (timeParts.length === 0) return new Date(y, m - 1, d);
  const match = timeParts.join(' ').match(/(\d+):(\d+)\s*(AM|PM)/i);
  let hour = 0;
  let minute = 0;
  if (match) {
    hour = Number(match[1]) % 12;
    minute = Number(match[2]);
    if (/PM/i.test(match[3])) hour += 12;
  }
  return new Date(y, m - 1, d, hour, minute);
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function shortLabel(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

export default function Insights() {
  const { invoices, customers, inventory } = useApp();
  const [timeframe, setTimeframe] = useState<Timeframe>('weekly');

  // Anchor "now" to the most recent date actually present in the data — the
  // demo data is dated 2023, so anchoring to the real wall clock would make
  // every "daily/weekly" window empty. This keeps every figure below a real
  // aggregate of real records, just measured relative to the latest entry.
  const anchor = useMemo(() => {
    const dates = invoices.map((i) => parseDate(i.date)).filter((d) => !Number.isNaN(d.getTime()));
    if (!dates.length) return new Date();
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [invoices]);

  const windowRange = useMemo(() => {
    const end = endOfDay(anchor);
    const days = timeframe === 'daily' ? 0 : timeframe === 'weekly' ? 6 : 29;
    const start = startOfDay(anchor);
    start.setDate(start.getDate() - days);
    return { start, end };
  }, [anchor, timeframe]);

  const windowInvoices = useMemo(
    () => invoices.filter((i) => { const d = parseDate(i.date); return d >= windowRange.start && d <= windowRange.end; }),
    [invoices, windowRange],
  );

  const salesVal = useMemo(() => windowInvoices.reduce((s, i) => s + i.amount, 0), [windowInvoices]);
  const txsCountVal = windowInvoices.length;

  const activeCustomers = useMemo(() => customers.filter((c) => c.status === 'Active').length, [customers]);
  const activeCustomerPct = customers.length ? Math.round((activeCustomers / customers.length) * 100) : 0;
  const repeatRate = useMemo(() => {
    if (!customers.length) return 0;
    const repeat = customers.filter((c) => invoices.filter((i) => i.customerId === c.id).length > 1).length;
    return Math.round((repeat / customers.length) * 100);
  }, [customers, invoices]);

  // ── Customer recency — real roster bucketed by days since last visit ──
  const recencyValues = useMemo(() => {
    let active = 0, cooling = 0, lapsed = 0;
    customers.forEach((c) => {
      if (c.lastVisitDays >= 14) lapsed += 1;
      else if (c.lastVisitDays >= 7) cooling += 1;
      else active += 1;
    });
    return { active, cooling, lapsed, sum: active + cooling + lapsed };
  }, [customers]);
  const recencyData = [
    { name: '0–6 days', value: recencyValues.active, fill: '#4caf79' },
    { name: '7–13 days', value: recencyValues.cooling, fill: '#f59e0b' },
    { name: '14+ days', value: recencyValues.lapsed, fill: '#ef4444' },
  ];

  // ── Trend: real day buckets (or week buckets for monthly), ending anchor ──
  const trendData = useMemo(() => {
    const buckets: { label: string; sales: number; orders: number }[] = [];
    if (timeframe === 'monthly') {
      for (let w = 3; w >= 0; w--) {
        const end = endOfDay(anchor); end.setDate(end.getDate() - w * 7);
        const start = startOfDay(end); start.setDate(start.getDate() - 6);
        const inWin = invoices.filter((i) => { const d = parseDate(i.date); return d >= start && d <= end; });
        buckets.push({ label: `${shortLabel(start)}–${shortLabel(end)}`, sales: inWin.reduce((s, i) => s + i.amount, 0), orders: inWin.length });
      }
    } else {
      const days = timeframe === 'daily' ? 1 : 7;
      for (let d = days - 1; d >= 0; d--) {
        const day = new Date(anchor); day.setDate(day.getDate() - d);
        const dStart = startOfDay(day), dEnd = endOfDay(day);
        const inWin = invoices.filter((i) => { const dt = parseDate(i.date); return dt >= dStart && dt <= dEnd; });
        buckets.push({ label: shortLabel(day), sales: inWin.reduce((s, i) => s + i.amount, 0), orders: inWin.length });
      }
    }
    return buckets;
  }, [timeframe, invoices, anchor]);

  // A real reference line: the average sales amount per bucket across the
  // whole trend series (not an invented "target").
  const avgSalesPerBucket = useMemo(() => {
    if (!trendData.length) return 0;
    return trendData.reduce((s, b) => s + b.sales, 0) / trendData.length;
  }, [trendData]);
  const salesTrendData = trendData.map((b) => ({ label: b.label, sales: b.sales, average: Math.round(avgSalesPerBucket) }));

  // Sales split by customer type (real, from invoices joined to the roster).
  const typeMix = useMemo(() => {
    const byType = new Map<string, number>();
    for (const inv of windowInvoices) {
      const cust = customers.find((c) => c.id === inv.customerId);
      const type = cust?.type ?? 'Walk-in';
      byType.set(type, (byType.get(type) ?? 0) + inv.amount);
    }
    return Array.from(byType.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((m) => m.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [windowInvoices, customers]);

  const topProducts = useMemo(() => {
    const byName = new Map<string, number>();
    for (const inv of windowInvoices) {
      for (const item of inv.items) byName.set(item.name, (byName.get(item.name) ?? 0) + item.quantity);
    }
    return Array.from(byName.entries())
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [windowInvoices]);

  const lowStockItems = useMemo(() => inventory.filter((i) => i.current <= i.reorder), [inventory]);
  const inventoryHealthPct = inventory.length
    ? Math.round(((inventory.length - lowStockItems.length) / inventory.length) * 100)
    : 100;
  // Engagement = share of customers seen within the last 7 days.
  const engagementPct = customers.length
    ? Math.round((customers.filter((c) => c.lastVisitDays < 7).length / customers.length) * 100)
    : 0;
  // Sales momentum = latest bucket vs series average (0–100, clamped).
  const salesMomentumPct = avgSalesPerBucket > 0 && trendData.length
    ? Math.max(0, Math.min(100, Math.round((trendData[trendData.length - 1].sales / avgSalesPerBucket) * 50)))
    : 0;

  const healthRadar = [
    { dim: 'Active Customers', score: activeCustomerPct },
    { dim: 'Engagement', score: engagementPct },
    { dim: 'Sales Momentum', score: salesMomentumPct },
    { dim: 'Repeat Customers', score: repeatRate },
    { dim: 'Inventory Health', score: inventoryHealthPct },
  ];

  // ── Data-derived suggestions (no invented names/numbers) ───────────────────
  const lifetimeOf = (id: string) => invoices.filter((i) => i.customerId === id).reduce((s, i) => s + i.amount, 0);
  const mostValuableLapsed = useMemo(
    () => customers.filter((c) => c.lastVisitDays >= 14 && lifetimeOf(c.id) > 0).sort((a, b) => lifetimeOf(b.id) - lifetimeOf(a.id))[0] ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, invoices],
  );
  const mostInactive = useMemo(
    () => customers.slice().sort((a, b) => b.lastVisitDays - a.lastVisitDays)[0] ?? null,
    [customers],
  );

  return (
    <div className="p-gutter space-y-4 max-w-[1600px] mx-auto w-full animate-fade-in">

      {/* Header with Global Timeframe selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-outline-variant pb-3 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Analytics Insights</h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
            Sales performance &amp; customer engagement
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1 shadow-2xs w-full sm:w-auto justify-between sm:justify-start">
            {(['daily', 'weekly', 'monthly'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`flex-1 sm:flex-initial py-1 px-4 rounded-lg text-[10px] uppercase font-bold tracking-wider cursor-pointer transition-all ${
                  timeframe === tf
                    ? 'bg-card text-foreground shadow-2xs font-extrabold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <Link
            href="/chat"
            className="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/85 active:scale-[0.98] transition-all w-full sm:w-auto"
          >
            <Sparkles className="size-3.5" />
            Ask Alara
          </Link>
        </div>
      </div>

      {/* KPI row (updates dynamically based on timeframe) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          label={`Revenue (${timeframe.toUpperCase()})`}
          value={money(salesVal)}
          hint={`${windowInvoices.length} invoices in window`}
          tone="success"
        />
        <MetricCard label="Active Customers" value={`${activeCustomerPct}%`} hint={`${activeCustomers} of ${customers.length}`} />
        <MetricCard
          label="Engagement"
          value={`${engagementPct}%`}
          hint="Seen in last 7 days"
          tone="success"
        />
        <MetricCard
          label="Avg Basket"
          value={txsCountVal > 0 ? money(salesVal / txsCountVal) : '—'}
          hint={`${txsCountVal} sales`}
        />
        <MetricCard label="Repeat Rate" value={`${repeatRate}%`} hint="Customers with 2+ orders" tone="info" />
      </div>

      {/* Row 1 — Cash gauge + Revenue/Recovery trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Customer Engagement"
          subtitle="Share of customers seen in the last 7 days."
          info="Engaged customers as a percentage of the whole roster. A higher ratio means a livelier, more loyal customer base."
          className="h-[300px] items-center"
        >
          <div className="relative flex items-center justify-center w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Engaged', value: engagementPct || 1 },
                    { name: 'Quiet', value: 100 - engagementPct || (engagementPct > 0 ? 0 : 1) },
                  ]}
                  innerRadius={62}
                  outerRadius={84}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  stroke="none"
                  animationDuration={1200}
                >
                  <Cell fill="#1a1a18" />
                  <Cell fill="#ededea" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-4xl font-black text-foreground font-mono tracking-tighter">{engagementPct}%</span>
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1 text-success-text">Engaged</span>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title={`Sales Trend (${timeframe.toUpperCase()})`}
          subtitle={timeframe === 'daily' ? 'Sales for the latest day on record.' : timeframe === 'weekly' ? 'Daily sales, last 7 days on record.' : 'Weekly sales, last 4 weeks on record.'}
          info="Sales booked over time vs this series' own average — spot momentum and slow periods at a glance."
          className="lg:col-span-2 h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={salesTrendData} margin={{ top: 10, right: 15, left: -8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...chartTooltip} formatter={(v) => [money(Number(v ?? 0)), '']} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Line type="monotone" dataKey="sales" name="Sales" stroke="#1a1a18" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="average" name="Series Average" stroke="#4caf79" strokeWidth={2} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2 — Sales by type + Top products + Customer recency */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title={`Sales by Customer Type (${timeframe.toUpperCase()})`}
          subtitle="Revenue split by customer category."
          info="How revenue breaks down across customer types (Household, Retailer, Hotel, etc.) in this period."
          className="h-[300px]"
        >
          {typeMix.length === 0 ? (
            <p className="flex h-full items-center justify-center text-xs text-muted-foreground italic">No sales recorded in this window.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={typeMix} dataKey="value" innerRadius={45} outerRadius={80} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                  {typeMix.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...chartTooltip} formatter={(v) => [money(Number(v ?? 0)), '']} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title={`Top Selling Products (${timeframe.toUpperCase()})`}
          subtitle="Units moved, by product."
          info="Ranked volume of the fastest-moving SKUs from real invoice line items — drives reorder and upsell decisions."
          className="h-[300px]"
        >
          {topProducts.length === 0 ? (
            <p className="flex h-full items-center justify-center text-xs text-muted-foreground italic">No itemised sales in this window.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" {...AXIS} />
                <YAxis type="category" dataKey="name" {...AXIS} width={72} />
                <Tooltip {...chartTooltip} formatter={(v) => [`${v ?? 0} units`, '']} cursor={{ fill: '#f0efeb' }} />
                <Bar dataKey="qty" radius={[0, 4, 4, 0]} fill="#1a1a18" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Customer Recency"
          subtitle={`${recencyValues.sum} customers by last visit`}
          info="Customers bucketed by days since last visit. The 14+ days slice is the highest re-engagement priority."
          className="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={recencyData} margin={{ top: 5, right: 10, left: -8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip {...chartTooltip} formatter={(v) => [`${v ?? 0} customers`, '']} cursor={{ fill: '#f0efeb' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {recencyData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3 — Health radar + Sales vs average composed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Business Health Radar"
          subtitle="Performance shape across five real business metrics."
          info="Each spoke is a 0–100 score computed from live data: active-customer share, engagement, sales momentum, repeat-customer share and inventory health."
          className="h-[320px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={healthRadar} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
              <PolarGrid stroke="#e5e4e0" />
              <PolarAngleAxis dataKey="dim" stroke="#787776" fontSize={9} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#cbcac6" fontSize={8} tickFormatter={(v) => `${v}`} />
              <Tooltip {...chartTooltip} formatter={(v) => [`${v ?? 0}`, 'Score']} />
              <Radar dataKey="score" stroke="#1a1a18" fill="#1a1a18" fillOpacity={0.18} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={`Sales vs Average (${timeframe.toUpperCase()})`}
          subtitle="Bars show actual sales per period; the line is this series' own average."
          info="Bars show real sales amounts; the reference line is the average of this same series — not an external target."
          className="lg:col-span-2 h-[320px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={salesTrendData} margin={{ top: 5, right: 10, left: -8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...chartTooltip} formatter={(v) => [money(Number(v ?? 0)), '']} cursor={{ fill: '#f0efeb' }} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="sales" name="Sales" radius={[4, 4, 0, 0]} fill="#1a1a18" />
              <Line type="monotone" dataKey="average" name="Series Average" stroke="#4caf79" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Data-derived suggested actions */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4 border-b border-outline-variant pb-3">
          <Activity className="size-4 text-foreground" />
          <h3 className="text-sm font-semibold tracking-tight">Suggested Actions ({timeframe.toUpperCase()})</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {mostValuableLapsed ? (
            <Link
              href={`/customers/${mostValuableLapsed.id}`}
              className="flex gap-3 items-start p-3 bg-danger-light/30 border border-danger-light rounded-xl hover:shadow-xs transition-shadow"
            >
              <AlertTriangle className="size-4 shrink-0 text-danger mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Win Back a Valuable Customer</p>
                <p className="text-muted-foreground mt-0.5">
                  {mostValuableLapsed.name} ({money(lifetimeOf(mostValuableLapsed.id))} lifetime) hasn&apos;t visited in {mostValuableLapsed.lastVisitDays} days. Send a win-back offer today.
                </p>
              </div>
            </Link>
          ) : (
            <div className="flex gap-3 items-start p-3 bg-success-light/30 border border-success-light rounded-xl">
              <CheckCircle2 className="size-4 shrink-0 text-success mt-0.5" />
              <p className="text-muted-foreground">All high-value customers have visited recently.</p>
            </div>
          )}

          {mostInactive ? (
            <Link
              href={`/customers/${mostInactive.id}`}
              className="flex gap-3 items-start p-3 bg-info-light/30 border border-info-light rounded-xl hover:shadow-xs transition-shadow"
            >
              <Phone className="size-4 shrink-0 text-info mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Re-engage Inactive Customer</p>
                <p className="text-muted-foreground mt-0.5">
                  {mostInactive.name} has not visited in {mostInactive.lastVisitDays} days
                  {mostInactive.preferredProducts?.[0] ? ` — usually buys ${mostInactive.preferredProducts[0].name}` : ''}. Send a check-in message.
                </p>
              </div>
            </Link>
          ) : (
            <div className="flex gap-3 items-start p-3 bg-success-light/30 border border-success-light rounded-xl">
              <CheckCircle2 className="size-4 shrink-0 text-success mt-0.5" />
              <p className="text-muted-foreground">All customers have visited recently.</p>
            </div>
          )}

          {lowStockItems.length > 0 ? (
            <Link
              href="/inventory"
              className="flex gap-3 items-start p-3 bg-warning-light/30 border border-warning-light rounded-xl hover:shadow-xs transition-shadow"
            >
              <PackageSearch className="size-4 shrink-0 text-warning mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Inventory Depletion Risk</p>
                <p className="text-muted-foreground mt-0.5">
                  {lowStockItems.map((i) => `${i.product} (${i.current})`).join(', ')} {lowStockItems.length > 1 ? 'are' : 'is'} at or below reorder threshold.
                </p>
              </div>
            </Link>
          ) : (
            <div className="flex gap-3 items-start p-3 bg-success-light/30 border border-success-light rounded-xl">
              <CheckCircle2 className="size-4 shrink-0 text-success mt-0.5" />
              <p className="text-muted-foreground">All stock levels are healthy.</p>
            </div>
          )}

          {recencyValues.lapsed > 0 && (
            <div className="flex gap-3 items-start p-3 bg-muted/40 border border-outline-variant/60 rounded-xl">
              <AlertTriangle className="size-4 shrink-0 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Re-engagement Campaign</p>
                <p className="text-muted-foreground mt-0.5">
                  {recencyValues.lapsed} of {customers.length} customers haven&apos;t visited in 14+ days. Consider a bulk win-back offer via Connect.
                </p>
              </div>
            </div>
          )}

          {topProducts[0] && (
            <div className="flex gap-3 items-start p-3 bg-success-light/30 border border-success-light rounded-xl">
              <TrendingUp className="size-4 shrink-0 text-success mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Volume Discount Strategy</p>
                <p className="text-muted-foreground mt-0.5">
                  {topProducts[0].name} led sales with {topProducts[0].qty} units this {timeframe} window — consider a bulk offer.
                </p>
              </div>
            </div>
          )}

          {salesVal > 0 && (
            <div className="flex gap-3 items-start p-3 bg-info-light/30 border border-info-light rounded-xl">
              {salesMomentumPct >= 50 ? (
                <TrendingUp className="size-4 shrink-0 text-info mt-0.5" />
              ) : (
                <TrendingDown className="size-4 shrink-0 text-info mt-0.5" />
              )}
              <div>
                <p className="font-semibold text-foreground">Sales Momentum</p>
                <p className="text-muted-foreground mt-0.5">
                  {repeatRate}% of customers are repeat buyers and {engagementPct}% have visited in the last 7 days this {timeframe} window.
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
