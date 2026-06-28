'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp, type Customer } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

type RecoType = 'overdue' | 'inactive' | 'upsell';
type TabKey = 'summary' | 'ledger' | 'communication' | 'recommendations';

function getRecoType(c: Customer): RecoType {
  if (c.balance > c.creditLimit * 0.8 || (c.balance > 0 && c.lastVisitDays > 10)) return 'overdue';
  if (c.lastVisitDays > 7) return 'inactive';
  return 'upsell';
}

const RECOMMENDATIONS: Record<RecoType, { title: string; detail: (c: Customer) => string }> = {
  overdue: {
    title: 'Recover Outstanding Udhar',
    detail: (c) =>
      `${c.name} owes PKR ${c.balance.toLocaleString()} and hasn't been seen in ${c.lastVisitDays} days. Send a polite payment reminder before extending more credit.`,
  },
  inactive: {
    title: 'Re-engage Inactive Customer',
    detail: (c) =>
      `${c.name} hasn't purchased in ${c.lastVisitDays} days. Send a personalized offer on their preferred products to win them back.`,
  },
  upsell: {
    title: 'Upsell Opportunity',
    detail: (c) =>
      `${c.name} is a healthy, reliable account. Recommend a premium bundle of ${c.preferredProducts?.[0]?.name ?? 'their regular items'}.`,
  },
};

function generateDraft(type: RecoType, channel: 'WhatsApp' | 'SMS', c: Customer): string {
  const top = c.preferredProducts?.[0]?.name ?? 'your regular items';
  const sign = channel === 'SMS' ? '- ALARA SME' : 'Shukriya, ALARA SME 🙏';
  if (type === 'overdue')
    return `Salam ${c.name}, ye ALARA SME se reminder hai. Aap ka PKR ${c.balance.toLocaleString()} udhar baqi hai jo ${c.lastVisitDays} din se due hai. Baraye meherbani jald clear karein. ${sign}`;
  if (type === 'inactive')
    return `Salam ${c.name}, kaafi din se aap tashreef nahi laaye. Aaj ${top} par khaas discount offer hai — bataiye to delivery arrange kar dein. ${sign}`;
  return `Salam ${c.name}, aap ke liye premium ${top} ka naya stock aaya hai special rate par. Order ke liye reply karein. ${sign}`;
}

function generateReply(type: RecoType): string {
  if (type === 'overdue') return 'Walaikum salam. Ji theek hai, main 2 din mein aa kar payment clear kar deta hoon. Shukriya.';
  if (type === 'inactive') return 'Salam! Ji bilkul, offer achi hai. Kal main dukan aata hoon, mere liye rakh lijiyega.';
  return 'Walaikum salam. Theek hai, mujhe ek packet bhej dein. Rate confirm kar dein please.';
}

export default function CustomerDetail({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(paramsPromise);
  const {
    customers,
    invoices,
    transactions,
    commLogs,
    sendWhatsAppReminder,
    recordCustomerReply,
    recordPayment,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [messageText, setMessageText] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [businessPeriod, setBusinessPeriod] = useState<'day' | 'week' | 'month'>('month');
  const [draftChannel, setDraftChannel] = useState<'WhatsApp' | 'SMS'>('WhatsApp');
  const [draftText, setDraftText] = useState<string | null>(null); // null → use generated default

  // Open a specific tab when navigated with ?tab= (e.g. from an alert card).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'recommendations' || t === 'ledger' || t === 'communication' || t === 'summary') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(t);
    }
  }, []);

  // Find customer
  const customer = customers.find((c) => c.id === id);

  if (!customer) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-bold text-error">Customer Profile Not Found</h2>
        <p className="text-on-surface-variant mt-2">The requested customer record does not exist in the database.</p>
        <Link href="/customers" className="mt-4 inline-block text-primary hover:underline font-bold">
          ← Back to Customers List
        </Link>
      </div>
    );
  }

  // Filter invoices for this customer
  const customerInvoices = invoices.filter((inv) => inv.customerId === customer.id);

  // Filter transactions for this customer
  const customerTransactions = transactions.filter((txn) => txn.customerId === customer.id);

  // Filter communication logs for this customer
  const customerLogs = commLogs.filter((log) => log.customerId === customer.id);

  // Financial calculations
  const totalBilled = customerTransactions
    .filter((t) => t.type === 'Credit Sale' || t.type === 'Opening Balance')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPaid = customerTransactions
    .filter((t) => t.type === 'Repayment')
    .reduce((sum, t) => sum + t.amount, 0);

  const outstandingBalance = customer.balance;

  // Business done with this customer (total volume), split across the selected
  // period. Deterministic split so day/week/month always show a figure.
  const totalVolume = totalBilled + totalPaid;
  const periodFactor = { day: 0.12, week: 0.45, month: 1 } as const;
  const businessAmount = Math.round(totalVolume * periodFactor[businessPeriod]);
  const businessCount =
    businessPeriod === 'day'
      ? Math.max(1, Math.round(customerTransactions.length * 0.2))
      : businessPeriod === 'week'
        ? Math.max(1, Math.round(customerTransactions.length * 0.6))
        : customerTransactions.length;

  // Next-best-action recommendation + AI draft for this customer.
  const recoType = getRecoType(customer);
  const recommendation = RECOMMENDATIONS[recoType];
  const defaultDraft = generateDraft(recoType, draftChannel, customer);
  const draftValue = draftText ?? defaultDraft;

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    sendWhatsAppReminder(customer.id, messageText);
    setMessageText('');
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentAmount) return;
    recordPayment(customer.id, parseFloat(paymentAmount));
    setShowPaymentModal(false);
    setPaymentAmount('');
  };

  // Send the AI draft on the chosen channel, schedule a reply, then jump to the
  // outreach console where the conversation (and the reply 5s later) appears.
  const handleSendDraft = () => {
    const text = draftValue.trim();
    if (!text) return;
    sendWhatsAppReminder(customer.id, text, draftChannel);
    window.setTimeout(() => {
      recordCustomerReply(customer.id, generateReply(recoType), draftChannel);
    }, 5000);
    router.push(`/connect?customer=${customer.id}&customerName=${encodeURIComponent(customer.name)}`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-label-md text-on-surface-variant text-xs font-bold">
        <Link href="/customers" className="hover:text-primary">
          Customers
        </Link>
        <Icon name="chevron_right" size={14} />
        <span className="text-primary font-bold">{customer.name}</span>
      </nav>

      {/* Grid container */}
      <div className="grid grid-cols-12 gap-6 max-w-[1600px] mx-auto">
        
        {/* Left Column: Primary Content (8 Columns) */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          
          {/* Customer Profile Header */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary-fixed text-primary flex items-center justify-center font-bold text-xl">
                  {customer.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{customer.name}</h2>
                    {customer.balance === 0 ? (
                      <span className="bg-primary-fixed text-on-primary-fixed-variant px-2 py-0.5 rounded text-[10px] font-bold uppercase">Settled</span>
                    ) : customer.lastVisitDays > 10 ? (
                      <span className="bg-error-container text-on-error-container px-2 py-0.5 rounded text-[10px] font-bold uppercase">Overdue</span>
                    ) : (
                      <span className="bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded text-[10px] font-bold uppercase">Active Credit</span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant font-medium mt-1">
                    {customer.type} • {customer.neighborhood} • Preferred Channel: {customer.channel}
                  </p>
                  <p className="text-xs text-outline mt-0.5">Phone: {customer.phone}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="px-4 py-2 bg-primary text-on-primary font-bold text-xs rounded-lg hover:opacity-90 active:scale-95 transition-all flex items-center gap-1"
                >
                  <Icon name="payments" size={16} />
                  Record Payment
                </button>
                <Link
                  href={`/record-sale?customer=${customer.id}`}
                  className="px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface-variant font-bold text-xs rounded-lg hover:bg-surface-container transition-all flex items-center gap-1"
                >
                  <Icon name="add_shopping_cart" size={16} />
                  Record Sale
                </Link>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex border-b border-outline-variant mt-6">
              {([
                ['summary', 'Summary'],
                ['recommendations', 'AI Recommendations'],
                ['ledger', 'Ledger'],
                ['communication', 'Communication'],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                    activeTab === tab
                      ? 'border-primary text-primary font-bold'
                      : 'border-transparent text-on-surface-variant hover:text-primary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* TAB 1: Summary Dashboard */}
          {activeTab === 'summary' && (
            <div className="space-y-6">

              {/* Business done with this customer */}
              <div className="bg-surface-container-lowest p-5 border border-outline-variant rounded-xl shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">
                    Business Done with {customer.name.split(' ')[0]}
                  </h3>
                  <div className="flex p-0.5 rounded-lg bg-surface-container border border-outline-variant/40 text-[10px] font-bold">
                    {(['day', 'week', 'month'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setBusinessPeriod(p)}
                        className={`px-3 py-1 rounded-md capitalize transition-all ${
                          businessPeriod === p
                            ? 'bg-white text-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-primary'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-2xl font-bold text-foreground tracking-tight tabular-nums">
                      PKR {businessAmount.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      {businessCount} transaction{businessCount !== 1 ? 's' : ''} this {businessPeriod}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-right">
                    <div>
                      <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">Total Sales</p>
                      <p className="text-sm font-bold text-primary mt-0.5 tabular-nums">PKR {totalBilled.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">Total Paid</p>
                      <p className="text-sm font-bold text-secondary mt-0.5 tabular-nums">PKR {totalPaid.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Revenue Trends and opportunities */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Revenue trends placeholder */}
                <div className="bg-surface-container-lowest p-5 border border-outline-variant rounded-xl shadow-sm">
                  <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-4">Billing Trend</h3>
                  <div className="h-32 flex items-end justify-between gap-3 px-2">
                    <div className="w-full bg-surface-container relative group h-full">
                      <div className="absolute bottom-0 left-0 right-0 bg-primary-fixed rounded-t-sm" style={{ height: '30%' }}></div>
                      <span className="absolute bottom-[-18px] left-1/2 -translate-x-1/2 text-[9px] text-outline font-bold">Aug</span>
                    </div>
                    <div className="w-full bg-surface-container relative group h-full">
                      <div className="absolute bottom-0 left-0 right-0 bg-primary-fixed rounded-t-sm" style={{ height: '55%' }}></div>
                      <span className="absolute bottom-[-18px] left-1/2 -translate-x-1/2 text-[9px] text-outline font-bold">Sep</span>
                    </div>
                    <div className="w-full bg-surface-container relative group h-full">
                      <div className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-sm" style={{ height: '80%' }}></div>
                      <span className="absolute bottom-[-18px] left-1/2 -translate-x-1/2 text-[9px] text-outline font-bold">Oct</span>
                    </div>
                  </div>
                  <div className="mt-8 text-center text-xs text-on-surface-variant">
                    Average purchase ticket: <strong>PKR {(totalBilled / (customerInvoices.length || 1)).toFixed(0)}</strong>
                  </div>
                </div>

                {/* Suggested opportunities */}
                <div className="bg-surface-container-lowest p-5 border border-outline-variant rounded-xl shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-3">AI Recommendations</h3>
                    <div className="space-y-3">
                      <div className="flex gap-2 items-start text-xs">
                        <Icon name="lightbulb" className="text-primary" size={18} />
                        <p className="text-on-surface-variant">
                          Recommend premium <strong>Basmati Rice bundle</strong> next visit. High recurring product margin.
                        </p>
                      </div>
                      <div className="flex gap-2 items-start text-xs">
                        <Icon name="campaign" className="text-secondary" size={18} />
                        <p className="text-on-surface-variant">
                          Preferred delivery time is **evening (6 PM - 8 PM)** based on purchase history.
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/chat?query=Draft+reminder+for+${customer.name}`)}
                    className="mt-4 w-full bg-surface-container-high border border-outline-variant py-2 rounded-lg font-bold text-xs text-primary hover:bg-primary-fixed transition-colors"
                  >
                    Generate WhatsApp Outreach
                  </button>
                </div>

              </div>

              {/* Recent Activity timeline */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm">
                <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-4">Recent Activity</h3>
                <div className="relative pl-6 border-l border-outline-variant space-y-6">
                  {customerTransactions.map((txn) => (
                    <div key={txn.id} className="relative">
                      <span className={`absolute left-[-29px] top-0 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                        txn.type === 'Repayment' ? 'bg-primary' : 'bg-tertiary'
                      }`}></span>
                      <div className="text-xs">
                        <p className="font-bold text-on-surface">
                          {txn.type} of <strong>PKR {txn.amount.toLocaleString()}</strong> ({txn.ref})
                        </p>
                        <p className="text-on-surface-variant text-[10px] mt-0.5">{txn.date}</p>
                      </div>
                    </div>
                  ))}
                  {customerLogs.map((log) => (
                    <div key={log.id} className="relative">
                      <span className="absolute left-[-29px] top-0 w-4 h-4 rounded-full border-2 border-white bg-secondary flex items-center justify-center"></span>
                      <div className="text-xs">
                        <p className="font-bold text-on-surface">
                          {log.type} Message {log.sender === 'Store' ? 'sent' : 'received'}
                        </p>
                        <p className="text-on-surface-variant italic mt-0.5">"{log.content}"</p>
                        <p className="text-on-surface-variant text-[10px] mt-0.5">{log.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Buying Patterns */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm">
                <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-4">Buying Patterns</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-surface-container-low rounded-lg">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Avg Ticket</p>
                    <p className="text-sm font-bold text-primary mt-1 font-numeric-data">PKR {(totalBilled / (customerInvoices.length || 1)).toFixed(0)}</p>
                  </div>
                  <div className="p-3 bg-surface-container-low rounded-lg">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Frequency</p>
                    <p className="text-sm font-bold text-primary mt-1">Every 6 days</p>
                  </div>
                  <div className="p-3 bg-surface-container-low rounded-lg">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Preferred Method</p>
                    <p className="text-sm font-bold text-primary mt-1">Cash / Credit</p>
                  </div>
                  <div className="p-3 bg-surface-container-low rounded-lg">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Trust Rating</p>
                    <p className="text-sm font-bold text-primary mt-1">{customer.healthScore > 85 ? 'Excellent' : 'Good'}</p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB: AI Recommendations */}
          {activeTab === 'recommendations' && (
            <div className="space-y-6">
              {/* Next best action */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-7 h-7 rounded-md bg-foreground text-background flex items-center justify-center">
                    <Icon name="smart_toy" size={16} />
                  </span>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant">Next Best Action</p>
                    <h3 className="text-sm font-bold text-foreground">{recommendation.title}</h3>
                  </div>
                  <span className={`ml-auto text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    recoType === 'overdue' ? 'bg-error-container text-on-error-container'
                      : recoType === 'inactive' ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-primary-fixed text-on-primary-fixed-variant'
                  }`}>
                    {recoType === 'overdue' ? 'High Priority' : recoType === 'inactive' ? 'Medium' : 'Opportunity'}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">{recommendation.detail(customer)}</p>
              </div>

              {/* AI-generated draft */}
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Icon name="lightbulb" size={15} className="text-primary" /> AI-Generated Draft
                  </h3>
                  <div className="flex items-center gap-2">
                    {/* Channel selector */}
                    <div className="flex p-0.5 rounded-lg bg-surface-container border border-outline-variant/40 text-[10px] font-bold">
                      {(['WhatsApp', 'SMS'] as const).map((ch) => (
                        <button
                          key={ch}
                          onClick={() => { setDraftChannel(ch); setDraftText(null); }}
                          className={`px-3 py-1 rounded-md transition-all ${
                            draftChannel === ch ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'
                          }`}
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setDraftText(generateDraft(recoType, draftChannel, customer))}
                      title="Regenerate draft"
                      className="h-7 px-2.5 rounded-lg border border-outline-variant text-[10px] font-bold text-on-surface-variant hover:bg-surface-container transition-colors flex items-center gap-1"
                    >
                      <Icon name="history" size={13} /> Regenerate
                    </button>
                  </div>
                </div>
                <textarea
                  value={draftValue}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={5}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-3 outline-none text-xs leading-relaxed resize-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
                <div className="flex items-center justify-between gap-2 pt-1">
                  <p className="text-[10px] text-on-surface-variant">
                    Sends on <strong className="text-foreground">{draftChannel}</strong>, then opens the Outreach console.
                  </p>
                  <button
                    onClick={handleSendDraft}
                    className="h-9 px-4 rounded-lg bg-primary text-on-primary text-xs font-bold hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <Icon name={draftChannel === 'SMS' ? 'sms' : 'send'} size={15} />
                    Send via {draftChannel}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Ledger Transactions */}
          {activeTab === 'ledger' && (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-variant text-label-md text-on-surface-variant border-b border-outline-variant">
                    <tr>
                      <th className="px-5 py-3">Transaction Date</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3 text-right">Debit (PKR)</th>
                      <th className="px-5 py-3 text-right">Credit (PKR)</th>
                      <th className="px-5 py-3">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant text-xs font-numeric-data">
                    {customerTransactions.map((txn) => (
                      <tr key={txn.id} className="hover:bg-surface-container transition-colors">
                        <td className="px-5 py-3">{txn.date}</td>
                        <td className="px-5 py-3 font-sans font-bold">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            txn.type === 'Repayment' ? 'bg-primary-fixed text-on-primary-fixed-variant' : 'bg-error-container text-on-error-container'
                          }`}>
                            {txn.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-tertiary">
                          {txn.type !== 'Repayment' ? `PKR ${txn.amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-primary">
                          {txn.type === 'Repayment' ? `PKR ${txn.amount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-5 py-3 text-on-surface-variant font-sans font-medium">{txn.ref}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Communication logs */}
          {activeTab === 'communication' && (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-2">Message History</h3>
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {customerLogs.length === 0 ? (
                  <p className="text-xs text-on-surface-variant italic text-center py-6">No communication records found.</p>
                ) : (
                  customerLogs.map((log) => (
                    <div key={log.id} className={`p-3 rounded-lg border text-xs ${
                      log.sender === 'Customer' ? 'bg-surface-container-low border-outline-variant' : 'bg-primary-fixed/20 border-primary/20'
                    }`}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-bold text-primary">{log.sender === 'Customer' ? customer.name : 'Store Manager (WhatsApp)'}</span>
                        <span className="text-[10px] text-outline">{log.timestamp}</span>
                      </div>
                      <p className="text-on-surface-variant">{log.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Context Panel (4 Columns) */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          
          {/* Health Score Card */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm text-center">
            <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-4 text-left">Credit Risk Health</h3>
            <div className="relative inline-flex items-center justify-center mb-2">
              {/* Circular health indicator */}
              <svg className="w-24 h-24 transform -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="#f0efeb" strokeWidth="8" fill="transparent" />
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke={customer.healthScore > 80 ? '#1a1a18' : customer.healthScore > 50 ? '#787776' : '#ba1a1a'}
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * customer.healthScore) / 100}
                />
              </svg>
              <span className="absolute text-xl font-bold text-on-surface">{customer.healthScore}%</span>
            </div>
            <p className="text-xs font-bold mt-2">
              {customer.healthScore > 80 ? 'Excellent Standing' : customer.healthScore > 50 ? 'Medium Risk Alert' : 'Critical Credit Overdue'}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1">
              {customer.healthScore > 80
                ? 'Consistently clears ledger within 7 days. High limit creditworthy.'
                : 'Ledger has been overdue for more than 15 days. Restrict new credit.'}
            </p>
          </div>

          {/* Financial Summary */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Financial Snapshot</h3>
            <div className="space-y-3 text-xs font-numeric-data">
              <div className="flex justify-between items-center py-1.5 border-b border-outline-variant">
                <span className="font-sans text-on-surface-variant font-medium">Credit Limit</span>
                <span className="font-bold">PKR {customer.creditLimit.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-outline-variant">
                <span className="font-sans text-on-surface-variant font-medium">Outstanding Balance</span>
                <span className={`font-bold ${outstandingBalance > 0 ? 'text-tertiary' : 'text-primary'}`}>
                  PKR {outstandingBalance.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-outline-variant">
                <span className="font-sans text-on-surface-variant font-medium">Total Credit Sales</span>
                <span className="font-bold">PKR {totalBilled.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="font-sans text-on-surface-variant font-medium">Total Paid</span>
                <span className="font-bold text-primary">PKR {totalPaid.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Preferred Products */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Preferred Products</h3>
            <div className="space-y-3">
              {(customer.preferredProducts && customer.preferredProducts.length > 0) ? (
                customer.preferredProducts.map((p) => (
                  <div key={p.name} className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="font-bold text-on-surface">{p.name}</span>
                      <span className="font-numeric-data text-outline font-bold">{p.pct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${p.pct}%` }}></div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-on-surface-variant italic">No items purchase history recorded yet.</p>
              )}
            </div>
          </div>

          {/* Communication outreach */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span> WhatsApp Reminder
            </h3>
            <p className="text-[11px] text-on-surface-variant">
              Quickly dispatch an outstanding credit notification reminder via WhatsApp.
            </p>
            <form onSubmit={handleSendMessage} className="space-y-3">
              <textarea
                className="w-full h-20 bg-surface-container-low border border-outline-variant rounded-lg p-2.5 outline-none text-xs resize-none focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder="Draft message content..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              ></textarea>
              <button
                type="submit"
                className="w-full bg-primary text-on-primary font-bold text-xs py-2 rounded-lg hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1"
              >
                <Icon name="share" size={16} /> Send WhatsApp
              </button>
            </form>
          </div>

        </div>

      </div>

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl w-full max-w-112 overflow-hidden shadow-xl border border-outline-variant">
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-headline-sm font-bold text-primary text-base">Record Payment Receipt</h3>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              <p className="text-xs text-on-surface-variant">
                Submit a new cash repayment for <strong>{customer.name}</strong>. Outstanding: <strong>PKR {outstandingBalance.toLocaleString()}</strong>.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant block">Amount Received (PKR)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 5000"
                  className="w-full border border-outline-variant rounded-lg p-3 outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm font-numeric-data"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-outline-variant text-on-surface-variant rounded-lg hover:bg-surface-container transition-all text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 active:scale-95 transition-all text-xs font-bold"
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
