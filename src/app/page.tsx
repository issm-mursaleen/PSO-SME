'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart, Banknote, UserPlus, Receipt, Megaphone, MessagesSquare,
  TrendingUp, CheckCircle2, History, MoreVertical, Lightbulb,
  Plus, BellRing,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, MetricCard, BarTrend, ProgressBar, Table, THead, Th, TBody, TRow, Td, Badge } from '@/components/ui';

function money(value: number) { return `PKR ${Math.round(value).toLocaleString()}`; }

/** Parses the dataset's date strings: "YYYY-MM-DD" or "YYYY-MM-DD h:mm AM/PM". */
function parseDate(raw: string): Date {
  const [datePart, ...timeParts] = raw.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  if (timeParts.length === 0) return new Date(y, m - 1, d);
  const match = timeParts.join(' ').match(/(\d+):(\d+)\s*(AM|PM)/i);
  let hour = 0, minute = 0;
  if (match) {
    hour = Number(match[1]) % 12;
    minute = Number(match[2]);
    if (/PM/i.test(match[3])) hour += 12;
  }
  return new Date(y, m - 1, d, hour, minute);
}
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function isSameDay(a: Date, b: Date) { return startOfDay(a).getTime() === startOfDay(b).getTime(); }

export default function Home() {
  const router = useRouter();
  const {
    customers,
    notifications,
    invoices,
    connectQueue,
  } = useApp();

  // Resolve a customer id from an alert's name against the full roster.
  const resolveCustomerId = (name: string): string | null => {
    const exact = customers.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact.id;
    const partial = customers.find(
      (c) => c.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.name.toLowerCase()),
    );
    if (partial) return partial.id;
    const token = name.toLowerCase().split(' ')[0];
    return customers.find((c) => c.name.toLowerCase().startsWith(token))?.id ?? null;
  };

  // Click an alert → open that exact customer's card.
  const openCustomerCard = (name: string) => {
    const id = resolveCustomerId(name);
    if (id) router.push(`/customers/${id}`);
  };

  // "Today" is anchored to the most recent date actually present in the
  // sales record — the demo data is dated 2023, so anchoring to the real wall
  // clock would always show zero. Every figure below is a real sum, no
  // baseline padding.
  const anchor = React.useMemo(() => {
    const dates = invoices.map((i) => parseDate(i.date)).filter((d) => !Number.isNaN(d.getTime()));
    return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date();
  }, [invoices]);
  const yesterday = React.useMemo(() => { const d = new Date(anchor); d.setDate(d.getDate() - 1); return d; }, [anchor]);

  const todayInvoices = React.useMemo(() => invoices.filter((i) => isSameDay(parseDate(i.date), anchor)), [invoices, anchor]);
  const yesterdaySales = React.useMemo(
    () => invoices.filter((i) => isSameDay(parseDate(i.date), yesterday)).reduce((s, i) => s + i.amount, 0),
    [invoices, yesterday],
  );

  const totalSales = todayInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const totalTxs = todayInvoices.length;
  const avgTicket = totalTxs ? Math.round(totalSales / totalTxs) : 0;
  const activeCustomers = customers.filter((c) => c.status === 'Active').length;
  const totalPendingFollowups = connectQueue.length;

  const salesVsYesterdayPct = yesterdaySales > 0 ? Math.round(((totalSales - yesterdaySales) / yesterdaySales) * 100) : null;

  // Top products today (by sales value) — from real invoice line items.
  const topProducts = React.useMemo(() => {
    const totals: Record<string, number> = {};
    for (const inv of todayInvoices) {
      for (const it of inv.items) {
        totals[it.name] = (totals[it.name] ?? 0) + it.total;
      }
    }
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [todayInvoices]);
  const topProductsMax = Math.max(...topProducts.map((p) => p.value), 1);

  // Last 6 days ending the anchor — real daily sales for the trend chart.
  const weekTrend = React.useMemo(() => {
    const days: { label: string; total: number }[] = [];
    for (let d = 5; d >= 0; d--) {
      const day = new Date(anchor); day.setDate(day.getDate() - d);
      const dStart = startOfDay(day), dEnd = endOfDay(day);
      const total = invoices.filter((i) => { const dt = parseDate(i.date); return dt >= dStart && dt <= dEnd; }).reduce((s, i) => s + i.amount, 0);
      days.push({ label: day.toLocaleDateString('en-US', { weekday: 'short' }), total });
    }
    return days;
  }, [invoices, anchor]);
  const maxWeekTotal = Math.max(...weekTrend.map((d) => d.total), 1);

  const quickActions = [
    { href: '/record-sale', icon: ShoppingCart, label: 'Record Sale' },
    { href: '/ledger', icon: Banknote, label: 'Record Payment' },
    { href: '/add-customer', icon: UserPlus, label: 'Add Customer' },
    { href: '/new-invoice', icon: Receipt, label: 'Create Invoice' },
    { href: '/connect', icon: Megaphone, label: 'Send Offer' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto p-gutter space-y-4 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Overview</h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
            Today Dashboard · Karachi Hub
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {quickActions.map((a) => {
            const Ico = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-outline-variant bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Ico className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="hidden lg:inline">{a.label}</span>
              </Link>
            );
          })}
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all"
          >
            <MessagesSquare className="size-3.5" />
            <span className="hidden lg:inline">Alara Chat</span>
          </Link>
        </div>
      </div>

      {/* Summary metrics */}
      <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard
          label="Today's Sales"
          value={`PKR ${totalSales.toLocaleString()}`}
          hint={salesVsYesterdayPct === null ? 'No sales yesterday to compare' : `${salesVsYesterdayPct >= 0 ? '+' : ''}${salesVsYesterdayPct}% vs yesterday`}
          hintIcon={<TrendingUp className="size-3.5" />}
          tone="success"
        />
        <MetricCard
          label="Transactions"
          value={totalTxs}
          hint={`Avg. PKR ${avgTicket.toLocaleString()}`}
          hintIcon={<Receipt className="size-3.5" />}
        />
        <MetricCard
          label="Avg Ticket"
          value={`PKR ${avgTicket.toLocaleString()}`}
          hint="Per sale today"
          hintIcon={<Banknote className="size-3.5" />}
        />
        <MetricCard
          label="Active Customers"
          value={activeCustomers}
          hint="Across the directory"
          hintIcon={<CheckCircle2 className="size-3.5" />}
          tone="success"
        />
        <MetricCard
          label="Total Customers"
          value={customers.length}
          hint="Verified profiles"
          hintIcon={<Receipt className="size-3.5" />}
        />
        <MetricCard
          label="Pending Follow-ups"
          value={totalPendingFollowups}
          hint="Outreach queue"
          hintIcon={<History className="size-3.5" />}
          tone="danger"
        />
      </section>

      {/* Body grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Today's Attention */}
        <div className="xl:col-span-2">
          <Card className="overflow-hidden flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <BellRing className="size-4 text-foreground" />
                <h3 className="text-sm font-semibold tracking-tight">Today&apos;s Attention</h3>
              </div>
              <Link href="/notifications" className="text-xs font-semibold text-foreground hover:underline">
                View all alerts
              </Link>
            </div>
            <div className="overflow-x-auto flex-1 custom-scrollbar">
              <Table>
                <THead>
                  <tr>
                    <Th>Urgency</Th>
                    <Th>Customer</Th>
                    <Th>Explanation</Th>
                    <Th className="text-right">Next Step</Th>
                  </tr>
                </THead>
                <TBody>
                  {notifications.map((item) => (
                    <TRow
                      key={item.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => openCustomerCard(item.customerName)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openCustomerCard(item.customerName);
                        }
                      }}
                      className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <Td>
                        <Badge tone={item.urgency === 'HIGH' ? 'danger' : item.urgency === 'MEDIUM' ? 'info' : 'neutral'}>
                          {item.urgency}
                        </Badge>
                      </Td>
                      <Td className="font-semibold whitespace-nowrap group-hover:text-primary group-hover:underline">{item.customerName}</Td>
                      <Td className="text-muted-foreground">{item.description}</Td>
                      <Td className="text-right text-xs font-semibold text-muted-foreground group-hover:text-foreground whitespace-nowrap">
                        View Card →
                      </Td>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            </div>
          </Card>
        </div>

        {/* Analytics column */}
        <div className="space-y-4">
          {/* Revenue Trends */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold tracking-tight">Revenue Trends</h3>
              <MoreVertical className="size-4 text-muted-foreground cursor-pointer" />
            </div>
            <BarTrend
              data={weekTrend.map((d) => Math.round((d.total / maxWeekTotal) * 100))}
              labels={weekTrend.map((d) => d.label)}
              tooltips={weekTrend.map((d) => `${d.label} ${money(d.total)}`)}
              height={140}
            />
          </Card>

          {/* Top Products Today */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold tracking-tight mb-4">Top Products Today</h3>
            {topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">No sales recorded yet today.</p>
            ) : (
              <div className="space-y-4">
                {topProducts.map((p) => (
                  <ProgressBar
                    key={p.name}
                    value={Math.round((p.value / topProductsMax) * 100)}
                    label={`${p.name} · ${money(p.value)}`}
                    dotClassName="bg-foreground"
                    barClassName="bg-foreground"
                  />
                ))}
              </div>
            )}
            <div className="mt-5 pt-4 border-t border-outline-variant flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted text-foreground">
                <Lightbulb className="size-4" />
              </div>
              <div>
                <p className="text-[11px] font-bold">Insight</p>
                <p className="text-xs text-muted-foreground">
                  {topProducts.length === 0
                    ? 'Record a sale to see your best-selling products here.'
                    : `${topProducts[0].name} is today's top seller — keep it well stocked.`}
                </p>
              </div>
            </div>
          </Card>

          {/* Promo */}
          <Card className="relative h-32 overflow-hidden group p-0">
            <div className="absolute inset-0 bg-linear-to-br from-inverse-surface to-foreground" />
            <div className="absolute inset-0 flex flex-col justify-center p-4 text-inverse-on-surface">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/60">Business Growth</p>
              <h4 className="text-sm font-bold text-white mt-1">Connect with 200+ Vendors</h4>
              <Link href="/connect" className="mt-2 text-xs font-bold text-white hover:underline w-fit">
                Explore Hub →
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* Floating action button */}
      <Link
        href="/record-sale"
        className="fixed bottom-8 right-8 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all group"
      >
        <Plus className="size-6 group-hover:rotate-90 transition-transform" />
      </Link>

    </div>
  );
}
