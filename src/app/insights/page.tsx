'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { AlertTriangle, History, Activity, Sparkles } from 'lucide-react';
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

export default function Insights() {
  const { invoices, customers, transactions } = useApp();

  // Baseline data from mockup
  const baseSales = 46850;
  const baseCash = 31200;
  const baseUdhar = 15650;
  const baseRecovered = 8000;
  const baseTxs = 27;

  const sessionSales = invoices
    .filter((inv) => inv.id.startsWith('INV-3') || inv.id.startsWith('INV-4') || inv.id.startsWith('INV-5'))
    .reduce((sum, inv) => sum + inv.amount, 0);
  const sessionCashSales = invoices
    .filter((inv) => inv.id.startsWith('INV-3') || inv.id.startsWith('INV-4') || inv.id.startsWith('INV-5'))
    .filter((inv) => inv.paymentType === 'Cash')
    .reduce((sum, inv) => sum + inv.amount, 0);
  const sessionUdharSales = invoices
    .filter((inv) => inv.id.startsWith('INV-3') || inv.id.startsWith('INV-4') || inv.id.startsWith('INV-5'))
    .filter((inv) => inv.paymentType === 'Udhar')
    .reduce((sum, inv) => sum + inv.amount, 0);
  const sessionRecovered = transactions
    .filter((txn) => txn.type === 'Repayment' && txn.ref === 'Cash Receipt')
    .reduce((sum, txn) => sum + txn.amount, 0);
  const sessionTxsCount = invoices.filter((inv) => inv.id.startsWith('INV-3') || inv.id.startsWith('INV-4')).length +
    transactions.filter((txn) => txn.type === 'Repayment' && txn.ref === 'Cash Receipt').length;

  const totalSales = baseSales + sessionSales;
  const totalCashSales = baseCash + sessionCashSales;
  const totalUdharSales = baseUdhar + sessionUdharSales;
  const totalRecovered = baseRecovered + sessionRecovered;
  const totalTxs = baseTxs + sessionTxsCount;

  const cashPercentage = Math.round((totalCashSales / (totalSales || 1)) * 100);
  const udharPercentage = 100 - cashPercentage;

  // Udhar aging
  const agingValues = useMemo(() => {
    let overdue1to7 = 4500;
    let overdue8to15 = 12000;
    let overdue15plus = 15000;
    customers.forEach((c) => {
      if (c.balance > 0) {
        if (c.lastVisitDays > 15) overdue15plus += c.balance;
        else if (c.lastVisitDays > 7) overdue8to15 += c.balance;
        else overdue1to7 += c.balance;
      }
    });
    const sum = overdue1to7 + overdue8to15 + overdue15plus;
    return { overdue1to7, overdue8to15, overdue15plus, sum };
  }, [customers]);

  // ── Chart datasets ──────────────────────────────────────────
  const trendData = useMemo(
    () => [
      { label: 'Mon', sales: 32, recovery: 8 },
      { label: 'Tue', sales: 41, recovery: 12 },
      { label: 'Wed', sales: 36, recovery: 10 },
      { label: 'Thu', sales: 52, recovery: 18 },
      { label: 'Fri', sales: 47, recovery: 21 },
      { label: 'Today', sales: Math.round(totalSales / 1000), recovery: Math.round(totalRecovered / 1000) },
    ],
    [totalSales, totalRecovered],
  );

  const paymentMix = useMemo(() => {
    const cash = totalCashSales;
    const udhar = totalUdharSales;
    const partial = invoices.filter((i) => i.paymentType === 'Partial').reduce((s, i) => s + i.amount, 0) + 3200;
    return [
      { name: 'Cash', value: cash },
      { name: 'Udhar', value: udhar },
      { name: 'Partial', value: partial },
    ];
  }, [totalCashSales, totalUdharSales, invoices]);

  const topProducts = useMemo(
    () => [
      { name: 'Dal Chana', qty: 450 },
      { name: 'Sugar', qty: 380 },
      { name: 'Basmati Rice', qty: 290 },
      { name: 'Milkpak', qty: 180 },
      { name: 'Cooking Oil', qty: 140 },
    ],
    [],
  );

  const agingData = [
    { name: '1–7 days', value: agingValues.overdue1to7, fill: '#4caf79' },
    { name: '8–15 days', value: agingValues.overdue8to15, fill: '#f59e0b' },
    { name: '15+ days', value: agingValues.overdue15plus, fill: '#ef4444' },
  ];

  const recoveryData = useMemo(
    () => [
      { label: 'Mon', recovered: 6, target: 10 },
      { label: 'Tue', recovered: 9, target: 10 },
      { label: 'Wed', recovered: 7, target: 10 },
      { label: 'Thu', recovered: 12, target: 12 },
      { label: 'Fri', recovered: 15, target: 12 },
      { label: 'Sat', recovered: Math.max(8, Math.round(totalRecovered / 1000)), target: 12 },
    ],
    [totalRecovered],
  );

  const healthRadar = useMemo(() => {
    const avgHealth = customers.length
      ? Math.round(customers.reduce((s, c) => s + (c.healthScore ?? 70), 0) / customers.length)
      : 72;
    return [
      { dim: 'Sales', score: 88 },
      { dim: 'Recovery', score: 74 },
      { dim: 'Loyalty', score: 84 },
      { dim: 'Activity', score: avgHealth },
      { dim: 'Credit Health', score: 100 - udharPercentage },
      { dim: 'Growth', score: 79 },
    ];
  }, [customers, udharPercentage]);

  return (
    <div className="p-gutter space-y-4 max-w-[1600px] mx-auto w-full animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Analytics Insights</h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
            Sales performance &amp; credit-risk forecasting
          </p>
        </div>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all"
        >
          <Sparkles className="size-3.5" />
          Ask Alara
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="Total Revenue" value={`PKR ${totalSales.toLocaleString()}`} hint="+12% vs yesterday" tone="success" />
        <MetricCard label="Cash / Udhar" value={`${cashPercentage} / ${udharPercentage}`} hint="Payment split %" />
        <MetricCard label="Recovered Udhar" value={`PKR ${totalRecovered.toLocaleString()}`} hint="4 accounts cleared" tone="success" />
        <MetricCard label="Avg Basket" value={`PKR ${(totalSales / (totalTxs || 1)).toFixed(0)}`} hint="Per-customer ticket" />
        <MetricCard label="Repeat Rate" value="84.5%" hint="Customer loyalty" tone="info" />
      </div>

      {/* Row 1 — Cash gauge + Revenue/Recovery trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Cash Collection Rate"
          subtitle="Share of today's sales settled in cash vs credit (udhar)."
          info="Cash sales as a percentage of total sales today. A higher ratio means stronger liquidity and lower credit exposure."
          className="h-[300px] items-center"
        >
          <div className="relative flex items-center justify-center w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Cash', value: cashPercentage },
                    { name: 'Udhar', value: udharPercentage },
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
              <span className="text-4xl font-black text-foreground font-mono tracking-tighter">{cashPercentage}%</span>
              <span className="text-[10px] font-bold uppercase tracking-widest mt-1 text-success-text">Cash settled</span>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Revenue & Recovery Trend"
          subtitle="Daily sales vs udhar recovered this week (PKR thousands)."
          info="Two lines on one chart: sales booked and credit recovered each day. Watch for recovery tracking below sales — a widening gap grows outstanding udhar."
          className="lg:col-span-2 h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 15, left: -22, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={(v) => `${v}k`} />
              <Tooltip {...chartTooltip} formatter={(v: any) => [`PKR ${v}k`, '']} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Line type="monotone" dataKey="sales" name="Sales" stroke="#1a1a18" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="recovery" name="Recovery" stroke="#4caf79" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2 — Payment mix donut + Top products + Udhar aging */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Payment Mix"
          subtitle="Revenue split by settlement type."
          info="How today's revenue breaks down across Cash, Udhar (credit) and Partial settlements."
          className="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={paymentMix} dataKey="value" innerRadius={45} outerRadius={80} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                {paymentMix.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...chartTooltip} formatter={(v: any) => [`PKR ${v.toLocaleString()}`, '']} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Top Selling Products"
          subtitle="Units moved this week, by product."
          info="Ranked volume of the fastest-moving SKUs — drives reorder and upsell decisions."
          className="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" {...AXIS} />
              <YAxis type="category" dataKey="name" {...AXIS} width={72} />
              <Tooltip {...chartTooltip} formatter={(v: any) => [`${v} units`, '']} cursor={{ fill: '#f0efeb' }} />
              <Bar dataKey="qty" radius={[0, 4, 4, 0]} fill="#1a1a18" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Outstanding Udhar Aging"
          subtitle={`Total debts: PKR ${agingValues.sum.toLocaleString()}`}
          info="Outstanding credit bucketed by age. The 15+ days slice is the highest collection priority."
          className="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agingData} margin={{ top: 5, right: 10, left: -8, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...chartTooltip} formatter={(v: any) => [`PKR ${v.toLocaleString()}`, '']} cursor={{ fill: '#f0efeb' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {agingData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3 — Health radar + Recovery efficiency composed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard
          title="Portfolio Health Radar"
          subtitle="Performance shape across six business dimensions."
          info="Each spoke is a 0–100 score. A balanced, full shape signals an all-round healthy portfolio; a collapsed spoke flags a specific weak area."
          className="h-[320px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={healthRadar} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
              <PolarGrid stroke="#e5e4e0" />
              <PolarAngleAxis dataKey="dim" stroke="#787776" fontSize={9} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#cbcac6" fontSize={8} tickFormatter={(v) => `${v}`} />
              <Tooltip {...chartTooltip} formatter={(v: any) => [`${v}`, 'Score']} />
              <Radar dataKey="score" stroke="#1a1a18" fill="#1a1a18" fillOpacity={0.18} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Recovery Efficiency"
          subtitle="Daily udhar recovered (bars) vs target (line), PKR thousands."
          info="Bars show actual collections; the line is the daily target. Bars above the line are over-performing days."
          className="lg:col-span-2 h-[320px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={recoveryData} margin={{ top: 5, right: 10, left: -18, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} tickFormatter={(v) => `${v}k`} />
              <Tooltip {...chartTooltip} formatter={(v: any) => [`PKR ${v}k`, '']} cursor={{ fill: '#f0efeb' }} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="recovered" name="Recovered" radius={[4, 4, 0, 0]} fill="#4caf79" />
              <Line type="monotone" dataKey="target" name="Target" stroke="#1a1a18" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* AI suggested actions */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="size-4 text-foreground" />
          <h3 className="text-sm font-semibold tracking-tight">AI Suggested Actions</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="flex gap-3 items-start">
            <AlertTriangle className="size-4 shrink-0 text-danger mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">Urgent: Credit Default Risk</p>
              <p className="text-muted-foreground mt-0.5">Riaz Ahmed exceeded credit limit by 18 days. Pause future credit sales.</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <History className="size-4 shrink-0 text-info mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">Customer Inactivity</p>
              <p className="text-muted-foreground mt-0.5">Sana Bibi not seen in 9 days. Draft a Nestle Milkpak promo.</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <Activity className="size-4 shrink-0 text-foreground mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">Liquidity Forecast</p>
              <p className="text-muted-foreground mt-0.5">Repayments projected +10% this week. Cash assets healthy.</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
