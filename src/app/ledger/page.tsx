'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Search,
  MessageSquare,
  Info,
  ArrowDownLeft,
  User,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Badge, Card, MetricCard, Table, TBody, Td, Th, THead, TRow, Donut } from '@/components/ui';

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
  const { customers, invoices, recordPayment, transactions, sendWhatsAppReminder } = useApp();
  
  const [selectedCustomerId, setSelectedCustomerId] = useState('cust-riaz');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [sendReceipt, setSendReceipt] = useState(true);
  const [receiptStatus, setReceiptStatus] = useState<string | null>(null);
  
  // Tab-based view control for details to improve UI/UX layout
  const [activeTab, setActiveTab] = useState<'ledger' | 'bills' | 'payments'>('ledger');
  const [reminderSent, setReminderSent] = useState(false);

  // Apply ?customer= once on the client (post-hydration) to avoid a mismatch.
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get('customer');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-hydration URL sync
    if (cid) setSelectedCustomerId(cid);
  }, []);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0] ?? null;

  // Filter customers based on search query
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const query = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.neighborhood.toLowerCase().includes(query) ||
        c.phone.includes(query)
    );
  }, [customers, searchQuery]);

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
        description:
          transaction.type === 'Credit Sale'
            ? 'Saman Becha (Udhar Diya)'
            : isPayment
            ? 'Paise Mile (Wasooli Received)'
            : 'Starting Balance',
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
  
  // Total wasooli amount collected across the system
  const recoveredAmount = transactions
    .filter((transaction) => transaction.type === 'Repayment')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const handleOpenPayment = () => {
    if (!selectedCustomer) return;
    setRepaymentAmount(selectedCustomer.balance > 0 ? selectedCustomer.balance.toString() : '');
    setSendReceipt(true);
    setIsDrawerOpen(true);
  };

  const handleRecordRepayment = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(repaymentAmount);
    if (!selectedCustomer || !Number.isFinite(amount) || amount <= 0 || amount > selectedCustomer.balance) return;
    const remainingBalance = Math.max(0, selectedCustomer.balance - amount);
    recordPayment(selectedCustomer.id, amount);
    if (sendReceipt) {
      const receiptMessage = [
        `Salam ${selectedCustomer.name}, aap ki wasooli receipt:`,
        `Received: ${money(amount)}`,
        `Remaining udhar: ${money(remainingBalance)}`,
        'Shukriya.',
      ].join('\n');
      sendWhatsAppReminder(selectedCustomer.id, receiptMessage, 'WhatsApp');
      setReceiptStatus(`Receipt sent to ${selectedCustomer.name} on WhatsApp.`);
      window.setTimeout(() => setReceiptStatus(null), 4000);
    }
    setRepaymentAmount('');
    setIsDrawerOpen(false);
  };

  const handleSendReminder = () => {
    if (!selectedCustomer) return;
    const msg = `Salam ${selectedCustomer.name}, aap ka khata balance ${money(selectedCustomer.balance)} outstanding hai. Baraye meherbani jald clear karein. Shukriya.`;
    sendWhatsAppReminder(selectedCustomer.id, msg, 'WhatsApp');
    setReminderSent(true);
    setTimeout(() => setReminderSent(false), 3000);
  };

  return (
    <div className="p-gutter space-y-4 max-w-[1600px] mx-auto w-full relative animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-2">
            <BookOpen className="size-5 text-primary animate-pulse" />
            Khata Book (Udhar Ledger)
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
            Track outstanding balances, log payments (wasooli), view credit limits, and check due dates
          </p>
        </div>
      </div>

      {/* Top Cards Section */}
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard
          label="Total Udhar (To Receive)"
          value={money(totalOutstanding)}
          hint={`${creditCustomers.length} active customer khatas`}
          hintIcon={<BookOpen className="size-3.5" />}
          tone="warning"
        />
        <MetricCard
          label="This Customer Owes (Baqi)"
          value={money(selectedBalance)}
          hint={selectedCustomer?.name ?? 'No customer selected'}
          hintIcon={<CreditCard className="size-3.5" />}
          tone={selectedBalance > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Total Wasooli Collected"
          value={money(recoveredAmount)}
          hint={`${paymentHistory.length} payments by this customer`}
          hintIcon={<CheckCircle2 className="size-3.5" />}
          tone="success"
        />
        <MetricCard
          label="Late Payers (Delayed Khatas)"
          value={overdueCustomers}
          hint="Needs follow-up"
          hintIcon={<AlertTriangle className="size-3.5" />}
          tone="danger"
        />
      </section>

      {receiptStatus && (
        <div role="status" className="fixed bottom-5 right-5 z-[110] flex items-center gap-2 rounded-lg border border-success/30 bg-card px-4 py-3 text-xs font-semibold text-success-text shadow-lg animate-fade-in">
          <CheckCircle2 className="size-4" />
          {receiptStatus}
        </div>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        
        {/* Customer Accounts Sidebar (Left - STICKY for superior UX) */}
        <Card className="xl:col-span-3 overflow-hidden flex flex-col xl:sticky xl:top-[20px] max-h-[850px] shadow-sm hover:shadow-md transition-shadow">
          <div className="px-4 py-3.5 border-b border-outline-variant space-y-2.5 bg-surface-container-low/50">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Customer Accounts</h2>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search customer or area..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 border border-outline-variant rounded-lg bg-card focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground transition-all"
              />
            </div>
          </div>
          <div className="p-2 space-y-2 overflow-y-auto custom-scrollbar flex-1 bg-card">
            {filteredCustomers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-6">No customers found</p>
            ) : (
              filteredCustomers.map((customer) => {
                const active = selectedCustomer?.id === customer.id;
                const limitPct = Math.min(100, Math.round((customer.balance / (customer.creditLimit || 1)) * 100));
                return (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => setSelectedCustomerId(customer.id)}
                    className={`w-full text-left rounded-xl border p-3.5 transition-all duration-150 cursor-pointer ${
                      active
                        ? 'border-primary bg-primary/5 text-foreground ring-1 ring-primary/25 shadow-xs translate-x-0.5'
                        : 'border-outline-variant bg-card hover:bg-muted/70 text-foreground hover:translate-x-0.5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-sm font-bold truncate ${active ? 'text-primary' : ''}`}>
                          {customer.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                          {customer.channel === 'WhatsApp' ? (
                            <MessageSquare className="size-3 text-success shrink-0" />
                          ) : (
                            <span className="text-[9px] font-bold text-muted-foreground border border-muted-foreground/30 px-1 rounded shrink-0 leading-none">SMS</span>
                          )}
                          <span>{customer.neighborhood}</span>
                        </p>
                      </div>
                      <Badge tone={customer.balance > 0 ? 'warning' : 'success'}>
                        {customer.balance > 0 ? 'Owes' : 'Clear'}
                      </Badge>
                    </div>

                    <div className="mt-3 flex justify-between items-baseline gap-2">
                      <p className="font-mono text-xs font-bold text-foreground">
                        {money(customer.balance)}
                      </p>
                      {customer.balance > 0 && (
                        <span className="text-[10px] text-muted-foreground font-semibold">
                          {limitPct}% limit used
                        </span>
                      )}
                    </div>

                    {customer.balance > 0 && (
                      <div className="mt-1.5 h-1 w-full bg-surface-container-high rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            limitPct >= 80 ? 'bg-danger' : limitPct >= 50 ? 'bg-warning' : 'bg-success'
                          }`}
                          style={{ width: `${limitPct}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Selected Customer Details & Tabs (Right Column) */}
        <div className="xl:col-span-9 space-y-4">
          
          {/* Premium Overview Card with Donut Chart integration */}
          <Card className="p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col lg:flex-row gap-6 justify-between items-stretch">
              
              {/* Left Details & Quick Actions */}
              <div className="flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <p className="font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Selected Customer Account
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-foreground flex items-center gap-2">
                    <User className="size-5.5 text-primary shrink-0" />
                    {selectedCustomer?.name ?? 'No customer'}
                  </h2>
                  {selectedCustomer && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2.5 flex-wrap">
                      <span className="font-semibold text-foreground px-2 py-0.5 bg-muted rounded">{selectedCustomer.phone}</span>
                      <span>·</span>
                      <span>{selectedCustomer.neighborhood}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        {selectedCustomer.channel === 'WhatsApp' ? (
                          <MessageSquare className="size-3 text-success shrink-0" />
                        ) : (
                          <span className="text-[9px] font-bold text-muted-foreground border border-muted-foreground/30 px-1 rounded shrink-0 leading-none">SMS</span>
                        )}
                        Preferred: {selectedCustomer.channel}
                      </span>
                      <span>·</span>
                      <Badge tone={selectedCustomer.status === 'Active' ? 'success' : 'neutral'} className="normal-case">
                        {selectedCustomer.status}
                      </Badge>
                    </p>
                  )}
                </div>
                
                {/* Micro Stats Row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 shadow-xs">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                      <ArrowDownLeft className="size-3 text-warning shrink-0" />
                      Baqi Owed
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold text-warning-text">{money(selectedBalance)}</p>
                  </div>
                  <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 shadow-xs">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                      <CreditCard className="size-3 text-info shrink-0" />
                      Udhar Limit
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold">{money(creditLimit)}</p>
                  </div>
                  <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 shadow-xs">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                      <ReceiptText className="size-3 text-muted-foreground shrink-0" />
                      Due Bills
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold">{dueInvoices.length} bills</p>
                  </div>
                </div>

                {/* Inline Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Link
                    href={selectedCustomer ? `/record-sale?customer=${selectedCustomer.id}` : '/record-sale'}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-outline-variant bg-card text-foreground text-xs font-semibold hover:bg-muted active:scale-[0.98] transition-all cursor-pointer shadow-xs"
                  >
                    <ReceiptText className="size-3.5" />
                    Record Udhar (Sale)
                  </Link>
                  <button
                    type="button"
                    onClick={handleOpenPayment}
                    disabled={!selectedCustomer}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/85 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground active:scale-[0.98] transition-all cursor-pointer shadow-xs"
                  >
                    <WalletCards className="size-3.5" />
                    Record Wasooli (Payment)
                  </button>
                  <button
                    type="button"
                    onClick={handleSendReminder}
                    disabled={!selectedCustomer || selectedBalance <= 0}
                    className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold active:scale-[0.98] transition-all cursor-pointer shadow-xs border ${
                      reminderSent
                        ? 'bg-success border-success text-success-foreground'
                        : 'bg-card border-outline-variant text-foreground hover:bg-muted'
                    }`}
                  >
                    <MessageSquare className="size-3.5" />
                    {reminderSent ? 'WhatsApp Sent ✓' : 'Send WhatsApp Reminder'}
                  </button>
                </div>
              </div>
              
              {/* Right Side: Credit Limit Gauge (Donut Integration) */}
              <div className="w-full lg:w-[220px] shrink-0 border-t lg:border-t-0 lg:border-l border-outline-variant pt-4 lg:pt-0 lg:pl-6 flex flex-col justify-center items-center bg-muted/10 rounded-xl p-3">
                <Donut
                  segments={[
                    { key: 'owed', label: 'Baqi (Owed)', value: selectedBalance, fill: '#f59e0b', dot: 'bg-warning' },
                    { key: 'available', label: 'Available Limit', value: Math.max(0, creditLimit - selectedBalance), fill: '#4caf79', dot: 'bg-success' }
                  ]}
                  centerValue={`${creditUsage}%`}
                  centerLabel="Limit Used"
                  size={110}
                  legend={false}
                />
                <div className="mt-3 text-center space-y-0.5">
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Udhar Limit Usage</p>
                  <p className="text-xs font-semibold text-foreground">
                    {money(selectedBalance)} / {money(creditLimit)}
                  </p>
                </div>
              </div>

            </div>

            {/* Explanatory sentence based on limit */}
            <div className="pt-3 border-t border-outline-variant/60">
              <p className="text-xs text-muted-foreground">
                {selectedBalance > 0 ? (
                  <>
                    This customer owes <strong className="text-warning-text font-bold">{money(selectedBalance)}</strong> out of their maximum credit limit of <strong className="text-foreground font-bold">{money(creditLimit)}</strong>. They can purchase <strong className="text-foreground font-bold">{money(Math.max(0, creditLimit - selectedBalance))}</strong> more on credit.
                  </>
                ) : (
                  <>
                    This customer has a clean record. They are eligible to buy up to <strong className="text-success-text font-bold">{money(creditLimit)}</strong> on credit (udhar).
                  </>
                )}
              </p>
            </div>
          </Card>

          {/* Quick Glossary Help Box */}
          <div className="bg-info-light/40 border border-info-text/10 rounded-xl p-4 flex items-start gap-3 text-xs text-info-text shadow-xs hover:shadow-md transition-shadow">
            <Info className="size-5 shrink-0 mt-0.5 text-info animate-bounce" />
            <div className="space-y-1.5">
              <p className="font-bold text-foreground">💡 How to Read Your Khata Book:</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                We use simple terms to track balances clearly:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 text-[11px]">
                <div className="bg-white/80 p-2.5 rounded-lg border border-outline-variant/50">
                  <span className="font-bold text-warning-text block mb-1">Udhar Diya (+):</span> 
                  Goods sold to the customer on credit. This increases the total amount they owe you.
                </div>
                <div className="bg-white/80 p-2.5 rounded-lg border border-outline-variant/50">
                  <span className="font-bold text-success-text block mb-1">Wasool Kiya (-):</span> 
                  Cash payment (Wasooli) received from the customer. This reduces their balance.
                </div>
                <div className="bg-white/80 p-2.5 rounded-lg border border-outline-variant/50">
                  <span className="font-bold text-foreground block mb-1">Baqi (Remaining):</span> 
                  The final net amount that the customer currently owes. (Formula: Owed = Previous + Udhar Diya - Wasool Kiya)
                </div>
              </div>
            </div>
          </div>

          {/* Premium Tabbed Navigation Area */}
          <div className="space-y-4">
            
            {/* Tabs Row */}
            <div className="flex border-b border-outline-variant gap-2 mb-2 bg-card rounded-lg p-1.5 shadow-xs border">
              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className={`flex-1 sm:flex-initial py-2 px-4 rounded-md font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'ledger'
                    ? 'text-primary bg-primary/5 font-bold shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <History className="size-3.5" />
                Ledger Timeline
              </button>
              
              <button
                type="button"
                onClick={() => setActiveTab('bills')}
                className={`flex-1 sm:flex-initial py-2 px-4 rounded-md font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'bills'
                    ? 'text-primary bg-primary/5 font-bold shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <CalendarClock className="size-3.5" />
                Pending Bills
                {dueInvoices.length > 0 && (
                  <span className="ml-1 bg-danger-light text-danger-text px-1.5 py-0.5 rounded-full text-[9px] font-bold">
                    {dueInvoices.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('payments')}
                className={`flex-1 sm:flex-initial py-2 px-4 rounded-md font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'payments'
                    ? 'text-primary bg-primary/5 font-bold shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <ReceiptText className="size-3.5" />
                Wasooli History
                {paymentHistory.length > 0 && (
                  <span className="ml-1 bg-success-light text-success-text px-1.5 py-0.5 rounded-full text-[9px] font-bold">
                    {paymentHistory.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab 1: Ledger Table */}
            {activeTab === 'ledger' && (
              <Card className="overflow-hidden border border-outline-variant shadow-sm hover:shadow-md transition-shadow animate-fade-in">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant bg-surface-container-low/50">
                  <div className="flex items-center gap-2">
                    <History className="size-4 text-foreground" />
                    <h2 className="text-sm font-semibold tracking-tight">Detailed Khata Ledger</h2>
                  </div>
                  <Badge tone="info">Baqi = Previous Owed + Udhar Diya - Wasool Kiya</Badge>
                </div>
                
                <div className="overflow-x-auto custom-scrollbar">
                  <Table className="min-w-[820px]">
                    <THead>
                      <tr>
                        <Th>Date & Time</Th>
                        <Th>Transaction Type</Th>
                        <Th>Invoice / Receipt No.</Th>
                        <Th className="text-right">Udhar Diya (You Gave +)</Th>
                        <Th className="text-right">Wasool Kiya (You Got -)</Th>
                        <Th className="text-right">Remaining Owed (Baqi)</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {ledgerEntries.length === 0 ? (
                        <TRow>
                          <Td colSpan={6} className="text-center text-muted-foreground italic py-8">
                            No transactions recorded for this customer.
                          </Td>
                        </TRow>
                      ) : (
                        ledgerEntries.map((entry) => {
                          const isPayment = entry.type === 'Payment';
                          const isOpening = entry.type === 'Opening Balance';
                          return (
                            <TRow key={entry.id} className="hover:bg-muted/30 transition-colors">
                              <Td className="font-mono text-xs text-muted-foreground whitespace-nowrap">{entry.date}</Td>
                              <Td>
                                <div className="flex items-center gap-2">
                                  <Badge tone={isPayment ? 'success' : isOpening ? 'neutral' : 'warning'}>
                                    {isPayment ? 'Wasool Kiya' : isOpening ? 'Pichla Balance' : 'Udhar Diya'}
                                  </Badge>
                                  <span className="text-xs text-foreground font-medium">{entry.description}</span>
                                </div>
                              </Td>
                              <Td className="font-mono text-xs">{entry.ref}</Td>
                              <Td className="text-right font-mono font-semibold text-warning-text bg-warning-light/10">
                                {entry.debit ? money(entry.debit) : '-'}
                              </Td>
                              <Td className="text-right font-mono font-semibold text-success-text bg-success-light/10">
                                {entry.credit ? money(entry.credit) : '-'}
                              </Td>
                              <Td className="text-right font-mono font-bold text-foreground bg-muted/20">
                                {money(entry.balance)}
                              </Td>
                            </TRow>
                          );
                        })
                      )}
                    </TBody>
                  </Table>
                </div>
              </Card>
            )}

            {/* Tab 2: Pending Bills */}
            {activeTab === 'bills' && (
              <Card className="overflow-hidden border border-outline-variant shadow-sm hover:shadow-md transition-shadow animate-fade-in">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant bg-surface-container-low/50">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-warning" />
                    <h2 className="text-sm font-semibold tracking-tight">Pending Invoice Deadlines (Unpaid Bills)</h2>
                  </div>
                  <Badge tone="warning">{dueInvoices.length} Bills Pending</Badge>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                  <Table>
                    <THead>
                      <tr>
                        <Th>Invoice No.</Th>
                        <Th>Due Date (Last Date)</Th>
                        <Th>Payment Status</Th>
                        <Th className="text-right">Total Invoice Amount</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {dueInvoices.length === 0 ? (
                        <TRow>
                          <Td colSpan={4} className="text-center text-muted-foreground italic py-8">
                            No pending unpaid invoices for this customer. All bills are clear!
                          </Td>
                        </TRow>
                      ) : (
                        dueInvoices.map((invoice) => (
                          <TRow key={invoice.id} className="hover:bg-muted/30 transition-colors">
                            <Td>
                              <Link href="/invoices" className="font-mono text-xs font-bold text-primary hover:underline">
                                {invoice.id}
                              </Link>
                            </Td>
                            <Td className="font-mono text-xs text-muted-foreground">{invoice.dueDate}</Td>
                            <Td>
                              <Badge tone={invoice.status === 'Overdue' ? 'danger' : invoice.status === 'Partial' ? 'info' : 'warning'}>
                                {invoice.status === 'Overdue' ? 'Late / Overdue' : invoice.status === 'Partial' ? 'Partially Paid' : 'Unpaid'}
                              </Badge>
                            </Td>
                            <Td className="text-right font-mono font-bold text-foreground">{money(invoice.amount)}</Td>
                          </TRow>
                        ))
                      )}
                    </TBody>
                  </Table>
                </div>
              </Card>
            )}

            {/* Tab 3: Payment History */}
            {activeTab === 'payments' && (
              <Card className="overflow-hidden border border-outline-variant shadow-sm hover:shadow-md transition-shadow animate-fade-in">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant bg-surface-container-low/50">
                  <div className="flex items-center gap-2">
                    <ReceiptText className="size-4 text-success" />
                    <h2 className="text-sm font-semibold tracking-tight">Recent Wasooli Logs (Payments Received)</h2>
                  </div>
                  <Badge tone="success">{paymentHistory.length} Wasooli Logs</Badge>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                  <Table>
                    <THead>
                      <tr>
                        <Th>Date & Time</Th>
                        <Th>Receipt Reference</Th>
                        <Th className="text-right">Amount Received</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {paymentHistory.length === 0 ? (
                        <TRow>
                          <Td colSpan={3} className="text-center text-muted-foreground italic py-8">
                            No payments received for this customer yet. Log a payment using the button above!
                          </Td>
                        </TRow>
                      ) : (
                        paymentHistory.map((payment) => (
                          <TRow key={payment.id} className="hover:bg-muted/30 transition-colors">
                            <Td className="font-mono text-xs text-muted-foreground">{payment.date}</Td>
                            <Td className="font-semibold text-foreground">{payment.ref}</Td>
                            <Td className="text-right font-mono font-bold text-success-text">{money(payment.amount)}</Td>
                          </TRow>
                        ))
                      )}
                    </TBody>
                  </Table>
                </div>
              </Card>
            )}

          </div>

        </div>
      </div>

      {/* Record Wasooli Drawer */}
      {isDrawerOpen && selectedCustomer && typeof document !== 'undefined' && createPortal(
        <>
          <button
            type="button"
            aria-label="Close payment drawer"
            className="fixed inset-0 z-[100] cursor-default bg-inverse-surface/60 backdrop-blur-xs"
            onClick={() => setIsDrawerOpen(false)}
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-wasooli-title"
            className="fixed inset-y-0 right-0 z-[101] flex h-dvh flex-col border-l border-outline-variant bg-white shadow-2xl animate-fade-in"
            style={{ width: 'min(100vw, 28rem)' }}
          >
            <div className="p-5 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <div className="flex items-center gap-2">
                <WalletCards className="size-4.5 text-foreground" />
                <h3 id="record-wasooli-title" className="text-sm font-semibold text-foreground">Record Wasooli / Customer Payment</h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                title="Close"
                onClick={() => setIsDrawerOpen(false)}
                className="text-muted-foreground hover:bg-muted p-1.5 rounded-full transition-colors cursor-pointer text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleRecordRepayment} className="flex-1 p-5 space-y-5 overflow-y-auto custom-scrollbar">
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground font-semibold">Customer Name</span>
                  <span className="font-bold text-right text-foreground">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground font-semibold">Outstanding Balance (Baqi)</span>
                  <span className="font-mono font-bold text-warning-text">{money(selectedCustomer.balance)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground font-semibold">Udhar Limit (Trust Limit)</span>
                  <span className="font-mono font-bold text-foreground">{money(selectedCustomer.creditLimit)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground block">Amount Paid by Customer (PKR)</label>
                <input
                  required
                  type="number"
                  min="1"
                  max={selectedCustomer.balance}
                  disabled={selectedCustomer.balance <= 0}
                  className="w-full border border-outline-variant rounded-lg p-3 text-sm font-mono outline-hidden focus:ring-1 focus:ring-primary focus:border-primary bg-card"
                  placeholder="e.g. 2000"
                  value={repaymentAmount}
                  onChange={(event) => setRepaymentAmount(event.target.value)}
                />
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendReceipt}
                  onChange={(event) => setSendReceipt(event.target.checked)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="block font-semibold text-foreground">Send payment receipt on WhatsApp</span>
                  <span className="mt-0.5 block text-muted-foreground">The customer will receive the paid amount and their updated udhar balance.</span>
                </span>
              </label>

              {selectedCustomer.balance <= 0 && (
                <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success-text">
                  This customer has no outstanding udhar to collect. Select a customer with a balance to record wasooli.
                </p>
              )}

              {repaymentAmount && (
                <div className="border border-dashed border-outline-variant p-4 rounded-xl space-y-2 bg-primary-fixed/10 animate-fade-in">
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                    Wasooli Receipt Preview
                  </p>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Payment Received (-)</span>
                    <span className="font-mono font-bold text-success-text">{money(parseFloat(repaymentAmount) || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-outline-variant/50 pt-2">
                    <span className="text-muted-foreground">New Remaining Balance (Baqi)</span>
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
                  className="flex-1 py-3 border border-outline-variant text-muted-foreground rounded-lg hover:bg-muted transition-all text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={selectedCustomer.balance <= 0 || !repaymentAmount}
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/85 active:scale-95 transition-all text-xs font-bold cursor-pointer"
                >
                  Save Wasooli Payment
                </button>
              </div>
            </form>
          </aside>
        </>,
        document.body,
      )}
    </div>
  );
}
