'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  History,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Badge, Card, MetricCard, Table, TBody, Td, Th, THead, TRow } from '@/components/ui';

type LedgerEntry = {
  id: string;
  date: string;
  type: 'Sale' | 'Payment' | 'Opening Balance';
  description: string;
  debit: number;
  credit: number;
  balance: number;
  ref: string;
};

function money(value: number) {
  return `PKR ${value.toLocaleString()}`;
}

export default function UdharLedger() {
  const { customers, invoices, recordPayment, transactions } = useApp();
  // Default first; the ?customer= param is applied post-mount (see effect below)
  // to avoid a server/client hydration mismatch.
  const [selectedCustomerId, setSelectedCustomerId] = useState('cust-riaz');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Apply ?customer= once on the client (post-hydration) to avoid a mismatch.
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get('customer');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-hydration URL sync
    if (cid) setSelectedCustomerId(cid);
  }, []);
  const [repaymentAmount, setRepaymentAmount] = useState('');

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0] ?? null;

  const customerTransactions = useMemo(() => {
    if (!selectedCustomer) return [];
    return transactions.filter((transaction) => transaction.customerId === selectedCustomer.id);
  }, [selectedCustomer, transactions]);

  const ledgerEntries = useMemo<LedgerEntry[]>(() => {
    return [...customerTransactions].reverse().reduce<LedgerEntry[]>((entries, transaction) => {
      const isPayment = transaction.type === 'Repayment';
      const debit = isPayment ? 0 : transaction.amount;
      const credit = isPayment ? transaction.amount : 0;
      const previousBalance = entries[entries.length - 1]?.balance ?? 0;
      const balance = previousBalance + debit - credit;

      entries.push({
        id: transaction.id,
        date: transaction.date,
        type: transaction.type === 'Credit Sale' ? 'Sale' : isPayment ? 'Payment' : 'Opening Balance',
        description: transaction.type === 'Credit Sale' ? 'Credit sale added to khata' : 'Customer payment received',
        debit,
        credit,
        balance,
        ref: transaction.ref,
      });
      return entries;
    }, []);
  }, [customerTransactions]);

  const paymentHistory = useMemo(
    () => customerTransactions.filter((transaction) => transaction.type === 'Repayment'),
    [customerTransactions],
  );

  const dueInvoices = useMemo(() => {
    if (!selectedCustomer) return [];
    return invoices.filter(
      (invoice) =>
        invoice.customerId === selectedCustomer.id &&
        (invoice.status === 'Unpaid' || invoice.status === 'Partial' || invoice.status === 'Overdue'),
    );
  }, [invoices, selectedCustomer]);

  const totalOutstanding = customers.reduce((sum, customer) => sum + customer.balance, 0);
  const creditCustomers = customers.filter((customer) => customer.balance > 0);
  const selectedBalance = selectedCustomer?.balance ?? 0;
  const creditLimit = selectedCustomer?.creditLimit ?? 1;
  const creditUsage = Math.min(100, Math.round((selectedBalance / creditLimit) * 100));
  const overdueCustomers = creditCustomers.filter((customer) => customer.lastVisitDays > 10).length;
  const recoveredAmount = transactions
    .filter((transaction) => transaction.type === 'Repayment')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const handleOpenPayment = () => {
    if (!selectedCustomer) return;
    setRepaymentAmount(selectedCustomer.balance.toString());
    setIsDrawerOpen(true);
  };

  const handleRecordRepayment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCustomer || !repaymentAmount) return;
    recordPayment(selectedCustomer.id, parseFloat(repaymentAmount));
    setRepaymentAmount('');
    setIsDrawerOpen(false);
  };

  return (
    <div className="p-gutter space-y-4 max-w-[1600px] mx-auto w-full relative animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Ledger / Khata</h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
            Running balance, payment history, credit tracking, and due dates
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenPayment}
          disabled={!selectedCustomer || selectedBalance <= 0}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground active:scale-[0.98] transition-all"
        >
          <WalletCards className="size-3.5" />
          Record Payment
        </button>
      </div>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard
          label="Total Outstanding"
          value={money(totalOutstanding)}
          hint={`${creditCustomers.length} customer khatas open`}
          hintIcon={<BookOpen className="size-3.5" />}
          tone="warning"
        />
        <MetricCard
          label="Selected Balance"
          value={money(selectedBalance)}
          hint={selectedCustomer?.name ?? 'No customer selected'}
          hintIcon={<CreditCard className="size-3.5" />}
        />
        <MetricCard
          label="Payments Collected"
          value={money(recoveredAmount)}
          hint={`${paymentHistory.length} payments for selected khata`}
          hintIcon={<CheckCircle2 className="size-3.5" />}
          tone="success"
        />
        <MetricCard
          label="Overdue Accounts"
          value={overdueCustomers}
          hint="Needs follow-up"
          hintIcon={<AlertTriangle className="size-3.5" />}
          tone="danger"
        />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Card className="xl:col-span-3 overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant">
            <h2 className="text-sm font-semibold tracking-tight">Customer Ledger</h2>
            <p className="text-xs text-muted-foreground mt-1">Select a khata to view its running balance.</p>
          </div>
          <div className="p-3 space-y-2">
            {customers.map((customer) => {
              const active = selectedCustomer?.id === customer.id;
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedCustomerId(customer.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    active
                      ? 'border-foreground bg-muted text-foreground'
                      : 'border-outline-variant bg-card hover:bg-muted text-foreground'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{customer.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{customer.neighborhood}</p>
                    </div>
                    <Badge tone={customer.balance > 0 ? 'warning' : 'success'}>
                      {customer.balance > 0 ? 'Open' : 'Clear'}
                    </Badge>
                  </div>
                  <p className="mt-3 font-mono text-sm font-bold">{money(customer.balance)}</p>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="xl:col-span-9 space-y-4">
          <Card className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Active Khata
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">{selectedCustomer?.name ?? 'No customer'}</h2>
                {selectedCustomer && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedCustomer.phone} · {selectedCustomer.neighborhood}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 min-w-full lg:min-w-[520px]">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Running Balance</p>
                  <p className="mt-1 font-mono text-base font-bold">{money(selectedBalance)}</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Credit Limit</p>
                  <p className="mt-1 font-mono text-base font-bold">{money(creditLimit)}</p>
                </div>
                <div className="rounded-lg bg-muted p-3 col-span-2 sm:col-span-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Due Tracking</p>
                  <p className="mt-1 font-mono text-base font-bold">{dueInvoices.length} open</p>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                <span>Credit used</span>
                <span>{creditUsage}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className={`h-full rounded-full ${creditUsage >= 80 ? 'bg-danger' : creditUsage >= 50 ? 'bg-warning' : 'bg-success'}`}
                  style={{ width: `${creditUsage}%` }}
                />
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <History className="size-4 text-foreground" />
                <h2 className="text-sm font-semibold tracking-tight">Running Balance Ledger</h2>
              </div>
              <Badge tone="info">Sale - Payment = Balance</Badge>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <Table className="min-w-[820px]">
                <THead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Entry</Th>
                    <Th>Reference</Th>
                    <Th className="text-right">Sale</Th>
                    <Th className="text-right">Payment</Th>
                    <Th className="text-right">Balance</Th>
                  </tr>
                </THead>
                <TBody>
                  {ledgerEntries.length === 0 ? (
                    <TRow>
                      <Td colSpan={6} className="text-center text-muted-foreground italic py-8">
                        No khata entries for this customer yet.
                      </Td>
                    </TRow>
                  ) : (
                    ledgerEntries.map((entry) => (
                      <TRow key={entry.id}>
                        <Td className="font-mono text-xs text-muted-foreground whitespace-nowrap">{entry.date}</Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <Badge tone={entry.type === 'Payment' ? 'success' : 'warning'}>{entry.type}</Badge>
                            <span className="text-sm text-foreground">{entry.description}</span>
                          </div>
                        </Td>
                        <Td className="font-mono text-xs">{entry.ref}</Td>
                        <Td className="text-right font-mono font-semibold text-warning-text">
                          {entry.debit ? money(entry.debit) : '-'}
                        </Td>
                        <Td className="text-right font-mono font-semibold text-success-text">
                          {entry.credit ? money(entry.credit) : '-'}
                        </Td>
                        <Td className="text-right font-mono font-bold text-foreground">{money(entry.balance)}</Td>
                      </TRow>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
            <ReceiptText className="size-4 text-success" />
            <h2 className="text-sm font-semibold tracking-tight">Payment History</h2>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <THead>
                <tr>
                  <Th>Date</Th>
                  <Th>Receipt</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </THead>
              <TBody>
                {paymentHistory.length === 0 ? (
                  <TRow>
                    <Td colSpan={3} className="text-center text-muted-foreground italic py-8">
                      No payment received for this khata yet.
                    </Td>
                  </TRow>
                ) : (
                  paymentHistory.map((payment) => (
                    <TRow key={payment.id}>
                      <Td className="font-mono text-xs text-muted-foreground">{payment.date}</Td>
                      <Td className="font-semibold">{payment.ref}</Td>
                      <Td className="text-right font-mono font-bold text-success-text">{money(payment.amount)}</Td>
                    </TRow>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
            <CalendarClock className="size-4 text-warning" />
            <h2 className="text-sm font-semibold tracking-tight">Due Date Tracking</h2>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <THead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Due Date</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </THead>
              <TBody>
                {dueInvoices.length === 0 ? (
                  <TRow>
                    <Td colSpan={4} className="text-center text-muted-foreground italic py-8">
                      No unpaid invoice due dates for this customer.
                    </Td>
                  </TRow>
                ) : (
                  dueInvoices.map((invoice) => (
                    <TRow key={invoice.id}>
                      <Td>
                        <Link href="/invoices" className="font-mono text-xs font-bold text-foreground hover:underline">
                          {invoice.id}
                        </Link>
                      </Td>
                      <Td className="font-mono text-xs text-muted-foreground">{invoice.dueDate}</Td>
                      <Td>
                        <Badge tone={invoice.status === 'Overdue' ? 'danger' : invoice.status === 'Partial' ? 'info' : 'warning'}>
                          {invoice.status}
                        </Badge>
                      </Td>
                      <Td className="text-right font-mono font-bold">{money(invoice.amount)}</Td>
                    </TRow>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </Card>
      </div>

      {isDrawerOpen && selectedCustomer && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-inverse-surface/60 backdrop-blur-sm">
          <button
            aria-label="Close payment drawer"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsDrawerOpen(false)}
          />

          <div className="relative w-full max-w-md bg-white h-screen shadow-2xl border-l border-outline-variant flex flex-col z-10">
            <div className="p-5 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <div className="flex items-center gap-2">
                <WalletCards className="size-4 text-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Record Khata Payment</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="text-muted-foreground hover:bg-muted p-1.5 rounded-full transition-colors"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleRecordRepayment} className="flex-1 p-5 space-y-5 overflow-y-auto custom-scrollbar">
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground font-semibold">Customer</span>
                  <span className="font-bold text-right">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground font-semibold">Current Balance</span>
                  <span className="font-mono font-bold text-warning-text">{money(selectedCustomer.balance)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground font-semibold">Credit Limit</span>
                  <span className="font-mono font-bold">{money(selectedCustomer.creditLimit)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground block">Payment Received (PKR)</label>
                <input
                  required
                  type="number"
                  min="1"
                  className="w-full border border-outline-variant rounded-lg p-3 text-sm font-mono outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="e.g. 2000"
                  value={repaymentAmount}
                  onChange={(event) => setRepaymentAmount(event.target.value)}
                />
              </div>

              {repaymentAmount && (
                <div className="border border-dashed border-outline-variant p-4 rounded-xl space-y-2 bg-primary-fixed/10">
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                    Receipt Preview
                  </p>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Payment</span>
                    <span className="font-mono font-bold text-success-text">{money(parseFloat(repaymentAmount) || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-outline-variant/50 pt-2">
                    <span className="text-muted-foreground">New Balance</span>
                    <span className="font-mono font-bold">
                      {money(Math.max(0, selectedCustomer.balance - (parseFloat(repaymentAmount) || 0)))}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-5 border-t border-outline-variant mt-auto">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="flex-1 py-3 border border-outline-variant text-muted-foreground rounded-lg hover:bg-muted transition-all text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/85 active:scale-95 transition-all text-xs font-bold"
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
