'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart, Banknote, UserPlus, Receipt, Megaphone, MessagesSquare,
  TrendingUp, AlertTriangle, CheckCircle2, History, MoreVertical, Lightbulb,
  Plus, X, MessageSquare, Phone, BellRing,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, MetricCard, BarTrend, ProgressBar, Table, THead, Th, TBody, TRow, Td, Badge } from '@/components/ui';

export default function Home() {
  const router = useRouter();
  const {
    notifications,
    invoices,
    transactions,
    connectQueue,
    recordPayment,
  } = useApp();

  const [activePaymentCustomer, setActivePaymentCustomer] = useState<{ id: string; name: string } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

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

  const handleOpenPaymentModal = (customerName: string) => {
    let customerId = '';
    if (customerName.includes('Riaz')) customerId = 'cust-riaz';
    else if (customerName.includes('Malik')) customerId = 'cust-malik';
    else if (customerName.includes('Sana')) customerId = 'cust-sana';
    else if (customerName.includes('Iqbal')) customerId = 'cust-iqbal';

    if (customerId) {
      setActivePaymentCustomer({ id: customerId, name: customerName });
    }
  };

  const handleRecordPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activePaymentCustomer && paymentAmount) {
      recordPayment(activePaymentCustomer.id, parseFloat(paymentAmount));
      setActivePaymentCustomer(null);
      setPaymentAmount('');
    }
  };

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
                    <Th className="text-right">Actions</Th>
                  </tr>
                </THead>
                <TBody>
                  {notifications.map((item) => (
                    <TRow key={item.id} className="group">
                      <Td>
                        <Badge tone={item.urgency === 'HIGH' ? 'danger' : item.urgency === 'MEDIUM' ? 'info' : 'neutral'}>
                          {item.urgency}
                        </Badge>
                      </Td>
                      <Td className="font-semibold whitespace-nowrap">{item.customerName}</Td>
                      <Td className="text-muted-foreground">{item.description}</Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.actions.some((a) => a.actionType === 'chat') && (
                            <Link href="/chat" className="p-1.5 rounded-lg border border-outline-variant text-muted-foreground hover:bg-muted hover:text-foreground transition-all" title="Message">
                              <MessageSquare className="size-4" />
                            </Link>
                          )}
                          {item.actions.some((a) => a.actionType === 'call') && (
                            <Link href="/connect" className="p-1.5 rounded-lg border border-outline-variant text-muted-foreground hover:bg-muted hover:text-foreground transition-all" title="Call">
                              <Phone className="size-4" />
                            </Link>
                          )}
                          {item.actions.some((a) => a.actionType === 'promo') && (
                            <Link href="/connect" className="px-3 py-1.5 rounded-lg border border-outline-variant text-foreground text-xs font-medium hover:bg-muted transition-all">
                              Send Promo
                            </Link>
                          )}
                          {item.actions.some((a) => a.actionType === 'remind') && (
                            <button onClick={() => router.push(`/chat?query=Draft+reminder+for+${item.customerName}`)} className="px-3 py-1.5 rounded-lg border border-outline-variant text-muted-foreground text-xs font-medium hover:bg-muted transition-all">
                              Remind
                            </button>
                          )}
                          {item.actions.some((a) => a.actionType === 'payment') && (
                            <button onClick={() => handleOpenPaymentModal(item.customerName)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all">
                              Record Payment
                            </button>
                          )}
                          {item.actions.some((a) => a.actionType === 'verify') && (
                            <button onClick={() => handleOpenPaymentModal(item.customerName)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-all">
                              Re-Verify
                            </button>
                          )}
                        </div>
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

      {/* Quick Record Payment Modal */}
      {activePaymentCustomer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/50 backdrop-blur-sm px-4">
          <div className="bg-card rounded-2xl w-full max-w-md overflow-hidden shadow-lg border border-outline-variant animate-fade-in">
            <form onSubmit={handleRecordPaymentSubmit} className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-semibold text-foreground tracking-tight">Record Payment</h3>
                <button
                  type="button"
                  onClick={() => setActivePaymentCustomer(null)}
                  className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                Recording payment received from <strong className="text-foreground">{activePaymentCustomer.name}</strong>.
              </p>
              <div className="space-y-1">
                <label className="font-mono text-[10px] font-semibold text-muted-foreground uppercase tracking-widest block">Amount Received (PKR)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 5000"
                  className="w-full border border-outline-variant rounded-lg p-3 text-sm outline-none focus:ring-1 focus:ring-ring/40 focus:border-foreground transition-all"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActivePaymentCustomer(null)}
                  className="px-4 py-2 rounded-lg border border-outline-variant text-muted-foreground text-sm hover:bg-muted transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85 active:scale-[0.98] transition-all"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
