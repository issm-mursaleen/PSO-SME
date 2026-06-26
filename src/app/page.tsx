'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart, Banknote, UserPlus, Receipt, Megaphone, MessagesSquare,
  TrendingUp, AlertTriangle, CheckCircle2, History, MoreVertical, Lightbulb,
  Plus, BellRing,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, MetricCard, BarTrend, ProgressBar, Table, THead, Th, TBody, TRow, Td, Badge } from '@/components/ui';

export default function Home() {
  const router = useRouter();
  const {
    customers,
    notifications,
    invoices,
    transactions,
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

  // Calculate dynamic stats based on new invoice/payment actions on top of mockup baselines
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
    .filter((txn) => txn.id.startsWith('TXN-') && txn.type === 'Repayment' && txn.ref === 'Cash Receipt')
    .reduce((sum, txn) => sum + txn.amount, 0);

  const sessionTxsCount = invoices.filter((inv) => inv.id.startsWith('INV-3') || inv.id.startsWith('INV-4')).length +
    transactions.filter((txn) => txn.type === 'Repayment' && txn.ref === 'Cash Receipt').length;

  const totalSales = baseSales + sessionSales;
  const totalCashSales = baseCash + sessionCashSales;
  const totalUdharSales = baseUdhar + sessionUdharSales;
  const totalRecovered = baseRecovered + sessionRecovered;
  const totalTxs = baseTxs + sessionTxsCount;
  const totalPendingFollowups = connectQueue.length;


  const cashPercentage = Math.round((totalCashSales / (totalSales || 1)) * 100);
  const udharPercentage = 100 - cashPercentage;

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
          hint="12% higher than yesterday"
          hintIcon={<TrendingUp className="size-3.5" />}
          tone="success"
        />
        <MetricCard
          label="Cash Sales"
          value={`PKR ${totalCashSales.toLocaleString()}`}
          hint={`${cashPercentage}% of total sales`}
          hintIcon={<Banknote className="size-3.5" />}
        />
        <MetricCard
          label="Udhar Sales"
          value={`PKR ${totalUdharSales.toLocaleString()}`}
          hint="Requires follow-up"
          hintIcon={<AlertTriangle className="size-3.5" />}
          tone="warning"
        />
        <MetricCard
          label="Payments Recovered"
          value={`PKR ${totalRecovered.toLocaleString()}`}
          hint="4 recoveries today"
          hintIcon={<CheckCircle2 className="size-3.5" />}
          tone="success"
        />
        <MetricCard
          label="Transactions"
          value={totalTxs}
          hint={`Avg. PKR ${(totalSales / (totalTxs || 1)).toFixed(0)}`}
          hintIcon={<Receipt className="size-3.5" />}
        />
        <MetricCard
          label="Pending Follow-ups"
          value={totalPendingFollowups}
          hint="Urgent alerts active"
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
              data={[40, 65, 55, 85, 70, 95]}
              labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']}
              tooltips={['Mon 12k', 'Tue 19k', 'Wed 16k', 'Thu 25k', 'Fri 21k', `Today ${(totalSales / 1000).toFixed(0)}k`]}
              height={140}
            />
          </Card>

          {/* Cash vs Udhar */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold tracking-tight mb-4">Cash vs Udhar</h3>
            <div className="space-y-4">
              <ProgressBar value={cashPercentage} label="Cash Sales" dotClassName="bg-foreground" barClassName="bg-foreground" />
              <ProgressBar value={udharPercentage} label="Udhar (Credit)" dotClassName="bg-warning" barClassName="bg-warning" />
            </div>
            <div className="mt-5 pt-4 border-t border-outline-variant flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted text-foreground">
                <Lightbulb className="size-4" />
              </div>
              <div>
                <p className="text-[11px] font-bold">Insight</p>
                <p className="text-xs text-muted-foreground">Udhar is lower than the same day last week. Cash liquidity improving.</p>
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
