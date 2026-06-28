'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp, type Customer } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

type RecoType = 'lapsed' | 'inactive' | 'upsell';
type TabKey = 'summary' | 'ledger' | 'communication' | 'recommendations';

function getRecoType(c: Customer): RecoType {
  if (c.lastVisitDays >= 14) return 'lapsed';
  if (c.lastVisitDays >= 7) return 'inactive';
  return 'upsell';
}

const RECOMMENDATIONS: Record<RecoType, { title: string; detail: (c: Customer) => string }> = {
  lapsed: {
    title: 'Win Back a Lapsed Customer',
    detail: (c) =>
      `${c.name} hasn't visited in ${c.lastVisitDays} days. Send a strong win-back offer on ${c.preferredProducts?.[0]?.name ?? 'their favourite products'} before they switch shops.`,
  },
  inactive: {
    title: 'Re-engage Inactive Customer',
    detail: (c) =>
      `${c.name} hasn't purchased in ${c.lastVisitDays} days. Send a personalized offer on their preferred products to win them back.`,
  },
  upsell: {
    title: 'Upsell Opportunity',
    detail: (c) =>
      `${c.name} is an active, engaged customer. Recommend a premium bundle of ${c.preferredProducts?.[0]?.name ?? 'their regular items'}.`,
  },
};

function generateDraft(type: RecoType, channel: 'WhatsApp' | 'SMS', c: Customer): string {
  const top = c.preferredProducts?.[0]?.name ?? 'your regular items';
  const sign = channel === 'SMS' ? '- ALARA SME' : 'Shukriya, ALARA SME 🙏';
  if (type === 'lapsed')
    return `Salam ${c.name}, kaafi arsa ho gaya aap tashreef nahi laaye. Aap ke liye ${top} par khaas win-back offer rakha hai — zaroor aaiye. ${sign}`;
  if (type === 'inactive')
    return `Salam ${c.name}, kaafi din se aap tashreef nahi laaye. Aaj ${top} par khaas discount offer hai — bataiye to delivery arrange kar dein. ${sign}`;
  return `Salam ${c.name}, aap ke liye premium ${top} ka naya stock aaya hai special rate par. Order ke liye reply karein. ${sign}`;
}

function generateReply(type: RecoType): string {
  if (type === 'lapsed') return 'Walaikum salam! Achi baat hai, main is hafte zaroor aata hoon. Shukriya yaad rakhne ka.';
  if (type === 'inactive') return 'Salam! Ji bilkul, offer achi hai. Kal main dukan aata hoon, mere liye rakh lijiyega.';
  return 'Walaikum salam. Theek hai, mujhe ek packet bhej dein. Rate confirm kar dein please.';
}

export default function CustomerDetail({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(paramsPromise);
  const {
    customers,
    invoices,
    commLogs,
    sendWhatsAppReminder,
    recordCustomerReply,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [messageText, setMessageText] = useState('');
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

  // Filter invoices (sales) for this customer
  const customerInvoices = invoices.filter((inv) => inv.customerId === customer.id);

  // Filter communication logs for this customer
  const customerLogs = commLogs.filter((log) => log.customerId === customer.id);

  // Sales calculations — lifetime sales value and order count from real invoices.
  const totalBilled = customerInvoices.reduce((sum, i) => sum + i.amount, 0);
  const orderCount = customerInvoices.length;

  // Business done with this customer in the selected window — anchored to the
  // most recent invoice date on record (the demo data is dated 2023, so
  // anchoring to the real wall clock would always show zero).
  const saleDates = customerInvoices.map((i) => new Date(i.date.split(' ')[0])).filter((d) => !Number.isNaN(d.getTime()));
  const customerAnchor = saleDates.length ? new Date(Math.max(...saleDates.map((d) => d.getTime()))) : new Date();
  const periodDays = { day: 0, week: 6, month: 29 } as const;
  const windowStart = new Date(customerAnchor);
  windowStart.setDate(windowStart.getDate() - periodDays[businessPeriod]);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(customerAnchor);
  windowEnd.setHours(23, 59, 59, 999);
  const salesInWindow = customerInvoices.filter((i) => {
    const d = new Date(i.date.split(' ')[0]);
    return d >= windowStart && d <= windowEnd;
  });
  const businessAmount = salesInWindow.reduce((sum, i) => sum + i.amount, 0);
  const businessCount = salesInWindow.length;

  // Real last-3-months sales totals, ending the customer's anchor month.
  const monthlyTrend = (() => {
    const months: { label: string; total: number; isLatest: boolean }[] = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(customerAnchor.getFullYear(), customerAnchor.getMonth() - i, 1);
      const total = customerInvoices
        .filter((inv) => {
          const td = new Date(inv.date.split(' ')[0]);
          return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
        })
        .reduce((sum, inv) => sum + inv.amount, 0);
      months.push({ label: d.toLocaleDateString('en-US', { month: 'short' }), total, isLatest: i === 0 });
    }
    return months.some((m) => m.total > 0) ? months : [];
  })();
  const monthlyTrendMax = Math.max(...monthlyTrend.map((m) => m.total), 1);

  // Real purchase cadence: average days between this customer's invoices.
  const purchaseFrequencyLabel = (() => {
    const dates = customerInvoices
      .map((i) => new Date(i.date.split(' ')[0]))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length < 2) return 'Not enough data';
    const spanDays = (dates[dates.length - 1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24);
    const avgDays = Math.round(spanDays / (dates.length - 1));
    return avgDays <= 0 ? 'Multiple orders/day' : `Every ${avgDays} day${avgDays === 1 ? '' : 's'}`;
  })();

  // Preferred contact channel for this customer.
  const preferredChannel = customer.channel || 'WhatsApp';

  // Engagement score derived from recency (no credit involved).
  const engagementScore = Math.max(0, Math.min(100, 100 - customer.lastVisitDays * 5));

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
                    {customer.lastVisitDays >= 14 ? (
                      <span className="bg-error-container text-on-error-container px-2 py-0.5 rounded text-[10px] font-bold uppercase">Lapsed</span>
                    ) : customer.lastVisitDays >= 7 ? (
                      <span className="bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded text-[10px] font-bold uppercase">Needs Outreach</span>
                    ) : (
                      <span className="bg-primary-fixed text-on-primary-fixed-variant px-2 py-0.5 rounded text-[10px] font-bold uppercase">Active</span>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant font-medium mt-1">
                    {customer.type} • {customer.neighborhood} • Preferred Channel: {customer.channel}
                  </p>
                  <p className="text-xs text-outline mt-0.5">Phone: {customer.phone}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/record-sale?customer=${customer.id}`}
                  className="px-4 py-2 bg-primary text-on-primary font-bold text-xs rounded-lg hover:opacity-90 active:scale-95 transition-all flex items-center gap-1"
                >
                  <Icon name="add_shopping_cart" size={16} />
                  Record Sale
                </Link>
                <Link
                  href={`/connect?customer=${customer.id}`}
                  className="px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface-variant font-bold text-xs rounded-lg hover:bg-surface-container transition-all flex items-center gap-1"
                >
                  <Icon name="campaign" size={16} />
                  Send Outreach
                </Link>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex border-b border-outline-variant mt-6">
              {([
                ['summary', 'Summary'],
                ['recommendations', 'AI Recommendations'],
                ['ledger', 'Sales History'],
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
                      {businessCount} sale{businessCount !== 1 ? 's' : ''} this {businessPeriod}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-right">
                    <div>
                      <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">Lifetime Sales</p>
                      <p className="text-sm font-bold text-primary mt-0.5 tabular-nums">PKR {totalBilled.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider">Orders</p>
                      <p className="text-sm font-bold text-secondary mt-0.5 tabular-nums">{orderCount}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Revenue Trends and opportunities */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Revenue trend — real monthly totals from this customer's transactions */}
                <div className="bg-surface-container-lowest p-5 border border-outline-variant rounded-xl shadow-sm">
                  <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-4">Billing Trend</h3>
                  {monthlyTrend.length === 0 ? (
                    <p className="h-32 flex items-center justify-center text-xs text-on-surface-variant italic">No billing history yet.</p>
                  ) : (
                    <div className="h-32 flex items-end justify-between gap-3 px-2">
                      {monthlyTrend.map((m) => (
                        <div key={m.label} className="w-full bg-surface-container relative group h-full">
                          <div
                            className={`absolute bottom-0 left-0 right-0 rounded-t-sm ${m.isLatest ? 'bg-primary' : 'bg-primary-fixed'}`}
                            style={{ height: `${Math.max(4, Math.round((m.total / monthlyTrendMax) * 100))}%` }}
                          />
                          <span className="absolute bottom-[-18px] left-1/2 -translate-x-1/2 text-[9px] text-outline font-bold">{m.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-8 text-center text-xs text-on-surface-variant">
                    Average purchase ticket: <strong>PKR {(totalBilled / (customerInvoices.length || 1)).toFixed(0)}</strong>
                  </div>
                </div>

                {/* Suggested opportunities */}
                <div className="bg-surface-container-lowest p-5 border border-outline-variant rounded-xl shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-3">AI Recommendations</h3>
                    <div className="space-y-3">
                      {customer.preferredProducts?.[0] ? (
                        <div className="flex gap-2 items-start text-xs">
                          <Icon name="lightbulb" className="text-primary" size={18} />
                          <p className="text-on-surface-variant">
                            <strong>{customer.preferredProducts[0].name}</strong> makes up {customer.preferredProducts[0].pct}% of their purchases — recommend a bundle on their next visit.
                          </p>
                        </div>
                      ) : (
                        <div className="flex gap-2 items-start text-xs">
                          <Icon name="lightbulb" className="text-primary" size={18} />
                          <p className="text-on-surface-variant">No preferred-product data recorded yet for this customer.</p>
                        </div>
                      )}
                      <div className="flex gap-2 items-start text-xs">
                        <Icon name="campaign" className="text-secondary" size={18} />
                        <p className="text-on-surface-variant">
                          {customer.lastVisitDays >= 10
                            ? `${customer.name} was last seen ${customer.lastVisitDays} days ago — a friendly re-engagement message is due.`
                            : `${customer.name} was last seen ${customer.lastVisitDays} days ago and is actively engaged.`}
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
                  {customerInvoices.map((inv) => (
                    <div key={inv.id} className="relative">
                      <span className="absolute left-[-29px] top-0 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center bg-primary"></span>
                      <div className="text-xs">
                        <p className="font-bold text-on-surface">
                          Sale of <strong>PKR {inv.amount.toLocaleString()}</strong> ({inv.id})
                        </p>
                        <p className="text-on-surface-variant text-[10px] mt-0.5">{inv.date}</p>
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
                        <p className="text-on-surface-variant italic mt-0.5">&ldquo;{log.content}&rdquo;</p>
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
                    <p className="text-sm font-bold text-primary mt-1">{purchaseFrequencyLabel}</p>
                  </div>
                  <div className="p-3 bg-surface-container-low rounded-lg">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Preferred Channel</p>
                    <p className="text-sm font-bold text-primary mt-1">{preferredChannel}</p>
                  </div>
                  <div className="p-3 bg-surface-container-low rounded-lg">
                    <p className="text-[10px] text-on-surface-variant font-bold uppercase">Engagement</p>
                    <p className="text-sm font-bold text-primary mt-1">{customer.lastVisitDays <= 7 ? 'Active' : customer.lastVisitDays <= 14 ? 'Cooling' : 'Lapsed'}</p>
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
                    recoType === 'lapsed' ? 'bg-error-container text-on-error-container'
                      : recoType === 'inactive' ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-primary-fixed text-on-primary-fixed-variant'
                  }`}>
                    {recoType === 'lapsed' ? 'High Priority' : recoType === 'inactive' ? 'Medium' : 'Opportunity'}
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

          {/* TAB 2: Sales History */}
          {activeTab === 'ledger' && (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-surface-variant text-label-md text-on-surface-variant border-b border-outline-variant">
                    <tr>
                      <th className="px-5 py-3">Sale Date</th>
                      <th className="px-5 py-3">Invoice</th>
                      <th className="px-5 py-3">Items</th>
                      <th className="px-5 py-3 text-right">Amount (PKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant text-xs font-numeric-data">
                    {customerInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-on-surface-variant italic font-sans">
                          No sales recorded for this customer yet.
                        </td>
                      </tr>
                    ) : (
                      customerInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-surface-container transition-colors">
                          <td className="px-5 py-3">{inv.date}</td>
                          <td className="px-5 py-3 font-sans font-bold text-primary">{inv.id}</td>
                          <td className="px-5 py-3 text-on-surface-variant font-sans font-medium">
                            {inv.items.map((it) => it.name).join(', ') || '—'}
                          </td>
                          <td className="px-5 py-3 text-right font-bold text-primary">PKR {inv.amount.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
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
          
          {/* Engagement Score Card */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm text-center">
            <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-4 text-left">Engagement</h3>
            <div className="relative inline-flex items-center justify-center mb-2">
              {/* Circular engagement indicator */}
              <svg className="w-24 h-24 transform -rotate-90">
                <circle cx="48" cy="48" r="40" stroke="#f0efeb" strokeWidth="8" fill="transparent" />
                <circle
                  cx="48"
                  cy="48"
                  r="40"
                  stroke={engagementScore > 80 ? '#1a1a18' : engagementScore > 50 ? '#787776' : '#ba1a1a'}
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * engagementScore) / 100}
                />
              </svg>
              <span className="absolute text-xl font-bold text-on-surface">{engagementScore}%</span>
            </div>
            <p className="text-xs font-bold mt-2">
              {engagementScore > 80 ? 'Highly Engaged' : engagementScore > 50 ? 'Cooling Off' : 'Lapsed — Re-engage'}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1">
              {engagementScore > 80
                ? 'Visits regularly — keep them delighted with offers on their favourites.'
                : `Last visit ${customer.lastVisitDays} days ago. Send a friendly check-in or offer.`}
            </p>
          </div>

          {/* Sales Summary */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Sales Snapshot</h3>
            <div className="space-y-3 text-xs font-numeric-data">
              <div className="flex justify-between items-center py-1.5 border-b border-outline-variant">
                <span className="font-sans text-on-surface-variant font-medium">Lifetime Sales</span>
                <span className="font-bold">PKR {totalBilled.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-outline-variant">
                <span className="font-sans text-on-surface-variant font-medium">Orders</span>
                <span className="font-bold">{orderCount}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-outline-variant">
                <span className="font-sans text-on-surface-variant font-medium">Avg Ticket</span>
                <span className="font-bold">PKR {(orderCount ? Math.round(totalBilled / orderCount) : 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="font-sans text-on-surface-variant font-medium">Last Visit</span>
                <span className="font-bold text-primary">{customer.lastVisitDays} days ago</span>
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
              Quickly dispatch a friendly outreach message via WhatsApp.
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

    </div>
  );
}
