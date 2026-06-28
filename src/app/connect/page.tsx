'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useApp, type ConnectQueueItem } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';
import receiptBackground from '@/assets/payment-receipt-placeholder.png';

const PREBUILT_DRAFTS = [
  {
    id: 'balance-reminder',
    label: 'Balance reminder',
    channel: 'WhatsApp' as const,
    text: 'Salam, aap ka udhar balance baqi hai. Baraye meherbani apni sahulat ke mutabiq payment confirm kar dein. Shukriya.',
  },
  {
    id: 'payment-receipt',
    label: 'Payment receipt',
    channel: 'WhatsApp' as const,
    text: 'Salam, aap ki payment receive ho gayi hai. Updated khata balance aur receipt yahan confirm kar di gayi hai. Shukriya.',
  },
  {
    id: 'stock-offer',
    label: 'Stock offer',
    channel: 'WhatsApp' as const,
    text: 'Salam, aaj fresh stock aur special trade offer available hai. Agar aap ko items chahiye hon to reply kar dein.',
  },
  {
    id: 'delivery-update',
    label: 'Delivery update',
    channel: 'SMS' as const,
    text: 'Your order is ready for delivery. Please reply with your preferred delivery time.',
  },
] as const;

const PAYMENT_PROOF_REPLIES = [
  { customerId: 'cust-riaz', amount: 'PKR 5,000', date: '26 Jun 2026 · 11:42 AM', note: 'Payment sent. Screenshot attached for confirmation.' },
  { customerId: 'cust-iqbal', amount: 'PKR 2,500', date: '25 Jun 2026 · 04:18 PM', note: 'EasyPaisa transfer complete. Please update my khata.' },
] as const;

export default function CustomerConnect() {
  const {
    customers,
    connectQueue,
    commLogs,
    sendWhatsAppReminder,
    recordCustomerReply,
    recordPayment,
  } = useApp();

  // NOTE: URL params (?customer=&draft=) are read in an effect AFTER mount, not
  // in these initializers. Reading window.location during render makes the first
  // client render differ from the server render → hydration mismatch.
  const [selectedQueueId, setSelectedQueueId] = useState('q-1');
  const [queueTab, setQueueTab] = useState<'drafts' | 'sent'>('drafts');
  const [queueSearch, setQueueSearch] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [dashboardDraft, setDashboardDraft] = useState('');
  const [draftChannel, setDraftChannel] = useState<'WhatsApp' | 'SMS'>('WhatsApp');
  const [alertQueueItem, setAlertQueueItem] = useState<ConnectQueueItem | null>(null);
  const [typingCustomerIds, setTypingCustomerIds] = useState<Record<string, boolean>>({});

  // Hydrate from the URL once on the client (post-hydration, so SSR markup matches).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cid = params.get('customer');
    const customerName = params.get('customerName');
    const draft = params.get('draft');
    /* eslint-disable react-hooks/set-state-in-effect -- intentional one-time sync of client-only URL params post-hydration */
    if (cid) {
      const queued = connectQueue.find((q) => q.customerId === cid);
      if (queued) {
        setSelectedQueueId(queued.id);
      } else if (customerName) {
        const customer = customers.find((entry) => entry.id === cid || entry.name === customerName);
        const alertItem: ConnectQueueItem = {
          id: `alert-${cid}`,
          customerId: cid,
          customerName,
          phone: customer?.phone || 'No phone saved',
          reason: 'Dashboard alert follow-up',
          dueDays: 0,
          lastAction: 'Opened from dashboard alert',
          health: 'warning',
          channel: customer?.channel || 'WhatsApp',
        };

        setAlertQueueItem(alertItem);
        setSelectedQueueId(alertItem.id);
      }
    }
    if (draft) {
      setDashboardDraft(draft);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const [commMode, setCommMode] = useState<'WhatsApp' | 'SMS'>('WhatsApp');

  // Custom theme option (Visual mode)
  const [darkConsoleMode, setDarkConsoleMode] = useState(false);

  // Repayment form modal inside context pane
  const [showRepaymentForm, setShowRepaymentForm] = useState(false);
  const [repaymentAmount, setRepaymentAmount] = useState('');

  // Toast message state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Find active queue item
  const activeQueueItem = connectQueue.find((q) => q.id === selectedQueueId) || (alertQueueItem?.id === selectedQueueId ? alertQueueItem : null) || connectQueue[0] || null;

  // Find active customer info
  const activeCustomer = useMemo(() => {
    if (!activeQueueItem) return null;
    return customers.find((c) => c.id === activeQueueItem.customerId) || null;
  }, [customers, activeQueueItem]);

  // Sync communication mode with customer's default channel
  /* eslint-disable react-hooks/set-state-in-effect -- Channel follows the selected customer's saved outreach preference. */
  useEffect(() => {
    if (activeCustomer) {
      if (activeCustomer.channel === 'SMS') {
        setCommMode('SMS');
      } else {
        setCommMode('WhatsApp');
      }
    }
  }, [activeCustomer]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Find communication logs
  const activeLogs = useMemo(() => {
    if (!activeQueueItem) return [];
    return commLogs.filter((log) => log.customerId === activeQueueItem.customerId && log.type !== 'Call');
  }, [commLogs, activeQueueItem]);
  const isCustomerTyping = activeQueueItem ? Boolean(typingCustomerIds[activeQueueItem.customerId]) : false;

  // Drafts queue — pending outreach items, filtered by the search box.
  const searchedDrafts = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    return connectQueue.filter(
      (item) => !q || item.customerName.toLowerCase().includes(q) || item.reason.toLowerCase().includes(q),
    );
  }, [connectQueue, queueSearch]);

  // Sent log — outreach the store has already dispatched (newest first).
  const sentLog = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    return commLogs
      .filter((log) => log.sender === 'Store' && log.type !== 'Call')
      .filter(
        (log) =>
          !q ||
          log.content.toLowerCase().includes(q) ||
          (customers.find((c) => c.id === log.customerId)?.name.toLowerCase().includes(q) ?? false),
      )
      .slice()
      .reverse();
  }, [commLogs, customers, queueSearch]);

  // Toast trigger helper
  const triggerToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const scheduleCustomerReply = (
    customerId: string,
    channel: 'WhatsApp' | 'SMS',
    sentText: string
  ) => {
    const lowerText = sentText.toLowerCase();
    let reply = 'Ji, message received. I will confirm shortly.';

    if (lowerText.includes('payment') || lowerText.includes('pending') || lowerText.includes('balance') || lowerText.includes('clear')) {
      reply = 'Ji, I saw this. I will arrange the payment and update you soon.';
    } else if (lowerText.includes('delivery') || lowerText.includes('items')) {
      reply = 'Ji, please keep the items ready. I will confirm delivery timing.';
    } else if (lowerText.includes('visit')) {
      reply = 'Ji, I will confirm a suitable visit time shortly.';
    } else if (lowerText.includes('confirmation') || lowerText.includes('status')) {
      reply = 'I will check and send confirmation shortly.';
    }

    window.setTimeout(() => {
      setTypingCustomerIds((prev) => ({ ...prev, [customerId]: true }));

      window.setTimeout(() => {
        setTypingCustomerIds((prev) => ({ ...prev, [customerId]: false }));
        recordCustomerReply(customerId, reply, channel);
      }, 3000);
    }, 5000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim() || !activeQueueItem) return;

    const sentText = messageContent.trim();
    // Log the selected written outreach channel in the timeline.
    sendWhatsAppReminder(activeQueueItem.customerId, sentText, commMode);
    scheduleCustomerReply(activeQueueItem.customerId, commMode, sentText);
    setMessageContent('');
    triggerToast(`${commMode} communication dispatch logged in timeline feed.`, 'success');
  };

  const handleSendDashboardDraft = () => {
    if (!dashboardDraft.trim() || !activeQueueItem) return;
    const sentText = dashboardDraft.trim();
    sendWhatsAppReminder(activeQueueItem.customerId, sentText, draftChannel);
    scheduleCustomerReply(activeQueueItem.customerId, draftChannel, sentText);
    setDashboardDraft('');
    triggerToast(`${draftChannel} draft dispatched from outreach chat.`, 'success');
  };

  const handleQuickTemplate = (text: string) => {
    setMessageContent(text);
    triggerToast('Template loaded in composer.', 'info');
  };

  const loadPrebuiltDraft = (draft: (typeof PREBUILT_DRAFTS)[number]) => {
    setDashboardDraft(draft.text);
    setDraftChannel(draft.channel);
    triggerToast(`${draft.label} loaded for review.`, 'info');
  };

  const paymentProofReply = activeCustomer
    ? PAYMENT_PROOF_REPLIES.find((reply) => reply.customerId === activeCustomer.id)
    : undefined;

  // Log Repayment from Side Panel
  const handleLogRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repaymentAmount || !activeCustomer) return;
    const amt = parseFloat(repaymentAmount);
    if (isNaN(amt) || amt <= 0) {
      triggerToast('Invalid cash amount.', 'error');
      return;
    }

    recordPayment(activeCustomer.id, amt);
    setRepaymentAmount('');
    setShowRepaymentForm(false);
    triggerToast(`Logged repayment of PKR ${amt.toLocaleString()} for ${activeCustomer.name}!`, 'success');
  };

  return (
    <div className={`flex h-[calc(100vh-64px)] overflow-hidden transition-colors duration-300 relative ${
      darkConsoleMode ? 'bg-[#1c1917] text-stone-100' : 'bg-background text-on-surface'
    }`}>

      {/* Styled Toast Notification */}
      {toast && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold bg-white text-stone-900 border-stone-500/20 animate-bounce-dots">
          <Icon name={toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'cancel' : 'info'} className="text-stone-500" size={16} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Embedded Animations & Audio Recording Waveforms */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
        }
        @keyframes subtle-fade {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .anim-pulse-dot {
          animation: pulse-dot 2s infinite;
        }
        .anim-subtle-fade {
          animation: subtle-fade 0.25s ease-out forwards;
        }
      `}} />

      {/* ========================================================
          LEFT COLUMN: OUTREACH TASK QUEUE (320px)
          ======================================================== */}
      <div className={`w-[320px] border-r flex flex-col h-full shrink-0 transition-colors duration-300 ${
        darkConsoleMode ? 'border-[#292524] bg-[#1c1917]' : 'border-outline-variant/60 bg-surface-container-lowest'
      }`}>
        
        {/* Workspace header + tabs */}
        <div className={`px-4 pt-4 shrink-0 ${darkConsoleMode ? 'border-[#292524]' : 'border-outline-variant/60'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-mono text-sm font-bold uppercase tracking-widest">Outreach Workspace</h3>
            <span className="font-mono text-[8px] font-bold px-2 py-0.5 rounded border border-outline-variant text-muted-foreground uppercase tracking-widest">
              Alara Intel
            </span>
          </div>
          <div className={`flex gap-5 border-b ${darkConsoleMode ? 'border-[#292524]' : 'border-outline-variant/60'}`}>
            {([
              ['drafts', 'Drafts Queue', searchedDrafts.length],
              ['sent', 'Sent Log', sentLog.length],
            ] as const).map(([key, label, count]) => {
              const active = queueTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setQueueTab(key)}
                  className={`-mb-px border-b-2 pb-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className={`p-3 border-b shrink-0 ${darkConsoleMode ? 'border-[#292524]' : 'border-outline-variant/60'}`}>
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              value={queueSearch}
              onChange={(e) => setQueueSearch(e.target.value)}
              placeholder="Search queue..."
              className={`w-full h-9 pl-9 pr-3 rounded-lg border text-xs outline-none transition-all focus:ring-1 focus:ring-ring/40 ${
                darkConsoleMode
                  ? 'bg-[#1c1917] border-stone-700 text-stone-200 placeholder:text-stone-500'
                  : 'bg-surface-container-low border-outline-variant text-foreground placeholder:text-muted-foreground focus:bg-card'
              }`}
            />
          </div>
        </div>

        {queueTab === 'drafts' && (
          <div className={`border-b p-3 ${darkConsoleMode ? 'border-[#292524] bg-stone-900/30' : 'border-outline-variant/60 bg-surface-container-low'}`}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">Prebuilt drafts</p>
              <span className="text-[9px] font-mono text-success-text">Ready to personalize</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {PREBUILT_DRAFTS.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => loadPrebuiltDraft(draft)}
                  className={`rounded-md border px-2 py-2 text-left text-[10px] font-semibold transition-colors ${
                    darkConsoleMode
                      ? 'border-stone-700 bg-stone-800 text-stone-200 hover:bg-stone-700'
                      : 'border-outline-variant bg-card text-foreground hover:border-primary/30 hover:bg-primary-fixed/30'
                  }`}
                >
                  <span className="block truncate">{draft.label}</span>
                  <span className="mt-0.5 block font-mono text-[8px] font-normal text-muted-foreground">{draft.channel}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* List */}
        <div className={`flex-1 overflow-y-auto custom-scrollbar divide-y ${darkConsoleMode ? 'divide-[#292524]' : 'divide-outline-variant/60'}`}>
          {queueTab === 'drafts' ? (
            searchedDrafts.length === 0 ? (
              <p className="text-xs opacity-60 italic p-6 text-center">No drafts match your search.</p>
            ) : (
              searchedDrafts.map((item) => {
                const isActive = item.id === selectedQueueId;
                const initials = item.customerName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                const urgency =
                  item.health === 'critical'
                    ? { label: 'HIGH', cls: 'bg-danger-light text-danger-text' }
                    : item.health === 'warning'
                    ? { label: 'MEDIUM', cls: 'bg-warning-light text-warning-text' }
                    : { label: 'LOW', cls: 'bg-muted text-muted-foreground' };
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedQueueId(item.id)}
                    className={`w-full text-left p-4 flex items-start gap-3 transition-colors ${
                      isActive
                        ? darkConsoleMode ? 'bg-stone-800/60' : 'bg-muted/60'
                        : darkConsoleMode ? 'hover:bg-[#292524]' : 'hover:bg-muted/40'
                    }`}
                  >
                    <span className="size-9 rounded-full bg-foreground text-background flex items-center justify-center text-[11px] font-bold shrink-0">
                      {initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-foreground truncate">{item.customerName}</p>
                        <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${urgency.cls}`}>
                          {urgency.label}
                        </span>
                      </div>
                      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
                        {item.channel} First
                      </p>
                      <p className="text-xs italic text-muted-foreground mt-1.5 truncate">{item.reason}</p>
                    </div>
                  </button>
                );
              })
            )
          ) : sentLog.length === 0 ? (
            <p className="text-xs opacity-60 italic p-6 text-center">No outreach has been sent yet.</p>
          ) : (
            sentLog.map((log) => {
              const cust = customers.find((c) => c.id === log.customerId);
              const name = cust?.name ?? 'Customer';
              const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
              const queued = connectQueue.find((q) => q.customerId === log.customerId);
              return (
                <button
                  key={log.id}
                  onClick={() => queued && setSelectedQueueId(queued.id)}
                  className={`w-full text-left p-4 flex items-start gap-3 transition-colors ${
                    darkConsoleMode ? 'hover:bg-[#292524]' : 'hover:bg-muted/40'
                  }`}
                >
                  <span className="size-9 rounded-full bg-foreground text-background flex items-center justify-center text-[11px] font-bold shrink-0">
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-foreground truncate">{name}</p>
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-success-light text-success-text">
                        Sent
                      </span>
                    </div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
                      {log.type} · {log.timestamp}
                    </p>
                    <p className="text-xs italic text-muted-foreground mt-1.5 truncate">{log.content}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================
          CENTER COLUMN: COMM WORKSPACE (Fluid)
          ======================================================== */}
      {activeQueueItem && activeCustomer ? (
        <div className={`flex-1 flex flex-col h-full relative border-r transition-colors duration-300 ${
          darkConsoleMode ? 'bg-[#1c1917] border-[#292524]' : 'bg-white border-outline-variant/60'
        }`}>
          
          {/* Workspace Header */}
          <div className={`p-4 border-b flex justify-between items-center shrink-0 transition-colors duration-300 ${
            darkConsoleMode ? 'border-[#292524] bg-[#1c1917]' : 'border-outline-variant/60 bg-surface-container-low'
          }`}>
            <div className="flex items-center gap-3">
              {/* Initials Avatar */}
              <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm uppercase shadow-sm">
                {activeCustomer.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h3 className="font-bold text-sm">{activeQueueItem.customerName}</h3>
                <p className="text-[10px] opacity-75">
                  Phone: {activeQueueItem.phone} • Channel Preference: <span className="font-bold">{activeCustomer.channel === 'SMS' ? 'SMS' : 'WhatsApp'}</span>
                </p>
              </div>
            </div>

            {/* Quick Actions Header */}
            <div className="flex items-center gap-2">
              <Link
                href={`/customers`}
                title="Open Ledger directory"
                className={`px-3 py-1.5 border font-bold text-xs rounded-lg transition-all flex items-center gap-1 ${
                  darkConsoleMode 
                    ? 'border-stone-700 hover:bg-stone-800 text-stone-200' 
                    : 'border-outline-variant/60 text-primary hover:bg-primary-fixed/20'
                }`}
              >
                <Icon name="menu_book" size={15} /> Profile
              </Link>

              {/* Layout mode toggle */}
              <button
                onClick={() => setDarkConsoleMode(!darkConsoleMode)}
                title={darkConsoleMode ? 'Switch to Light Workspace' : 'Switch to Dark Workspace'}
                className={`p-2 rounded-lg border transition-all ${
                  darkConsoleMode ? 'bg-[#292524] border-stone-700 text-yellow-400' : 'bg-surface-container-lowest border-outline-variant/60 text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                <Icon name={darkConsoleMode ? 'light_mode' : 'dark_mode'} size={15} />
              </button>
            </div>
          </div>

          {/* Conversation Timeline Thread */}
          <div className={`flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4 transition-colors duration-300 ${
            darkConsoleMode ? 'bg-[#1c1917]' : 'bg-[#f5f4f0]'
          }`}>
            <div className="text-center">
              <span className={`px-2.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border ${
                darkConsoleMode ? 'bg-stone-800 border-stone-700/50 text-stone-400' : 'bg-surface-container-high border-outline-variant/30 text-outline'
              }`}>
                Outreach History Timeline
              </span>
            </div>

            {paymentProofReply && (
              <div className="flex justify-start animate-fade-in">
                <div className="max-w-[75%] space-y-1 sm:max-w-[65%]">
                  <div className={`rounded-2xl rounded-tl-none border p-3 shadow-sm ${darkConsoleMode ? 'border-stone-700 bg-stone-800' : 'border-emerald-200 bg-white'}`}>
                    <div className="mb-2 flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wider text-emerald-700">
                      <Icon name="chat" size={10} /> WhatsApp · customer reply
                    </div>
                    <p className="mb-2 text-[12px] leading-relaxed">{paymentProofReply.note}</p>
                    <div className="relative h-44 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50">
                      <Image
                        src={receiptBackground}
                        alt="EasyPaisa-style payment receipt attachment"
                        fill
                        className="object-cover opacity-30"
                        sizes="(max-width: 640px) 75vw, 320px"
                      />
                      <div className="relative flex h-full flex-col justify-between p-3 text-emerald-950">
                        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider">
                          <span>EasyPaisa receipt</span>
                          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-white">Paid</span>
                        </div>
                        <div>
                          <p className="font-mono text-xl font-extrabold tracking-tight">{paymentProofReply.amount}</p>
                          <p className="mt-1 text-[10px] font-semibold">{paymentProofReply.date}</p>
                          <p className="mt-1 text-[9px] text-emerald-800">Payment confirmation attached via WhatsApp</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeLogs.length === 0 ? (
              <p className="text-xs opacity-60 italic text-center py-8">
                No past logs recorded for this client. Utilize quick templates to initiate payment outreach.
              </p>
            ) : (
              activeLogs.map((log) => {
                const isCustomer = log.sender === 'Customer';
                return (
                  <div
                    key={log.id}
                    className={`flex ${isCustomer ? 'justify-start' : 'justify-end'} anim-subtle-fade`}
                  >
                    <div className="space-y-1 max-w-[75%] sm:max-w-[65%]">
                      {/* Bubble */}
                      <div
                        className={`p-3.5 rounded-2xl shadow-sm border text-[12px] leading-relaxed relative ${
                          isCustomer
                            ? darkConsoleMode
                              ? 'bg-[#292524] border-stone-800 text-stone-100 rounded-tl-none'
                              : 'bg-white border-outline-variant/50 text-on-surface rounded-tl-none'
                            : darkConsoleMode
                            ? 'bg-gradient-to-tr from-stone-700 to-stone-900 border-stone-800 text-white rounded-tr-none'
                            : 'bg-gradient-to-tr from-primary to-[#292524] border-primary/20 text-white rounded-tr-none'
                        }`}
                      >
                        {/* Channel Badge Indicator */}
                        <div className="flex items-center gap-1.5 mb-1.5 opacity-60 text-[8px] font-bold uppercase tracking-wider">
                          <Icon name={log.type === 'SMS' ? 'sms' : 'chat'} size={10} />
                          {log.type === 'SMS' ? 'SMS Outreach' : 'WhatsApp Outreach'}
                        </div>

                        <p>{log.content}</p>
                        
                        {/* Status Checkmark & Timestamp */}
                        <div className="flex justify-end items-center gap-1 mt-2 opacity-60 text-[8px] font-mono text-right">
                          <span>{log.timestamp}</span>
                          {!isCustomer && (
                            <Icon name="done_all" className="text-stone-300" size={11} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {isCustomerTyping && (
              <div className="flex justify-start anim-subtle-fade" aria-live="polite" aria-label={`${activeQueueItem.customerName} is typing`}>
                <div className="space-y-1 max-w-[75%] sm:max-w-[65%]">
                  <div
                    className={`p-3.5 rounded-2xl rounded-tl-none shadow-sm border text-[12px] leading-relaxed relative ${
                      darkConsoleMode
                        ? 'bg-[#292524] border-stone-800 text-stone-100'
                        : 'bg-white border-outline-variant/50 text-on-surface'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5 opacity-60 text-[8px] font-bold uppercase tracking-wider">
                      <Icon name="chat" size={10} />
                      Customer typing
                    </div>
                    <div className="flex items-center gap-1.5 h-4">
                      {[0, 1, 2].map((dot) => (
                        <span
                          key={dot}
                          className={`size-1.5 rounded-full animate-bounce ${
                            darkConsoleMode ? 'bg-stone-300' : 'bg-stone-500'
                          }`}
                          style={{ animationDelay: `${dot * 120}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Composer & Channel Control Area */}
          <div className={`p-4 border-t shrink-0 space-y-3 transition-colors duration-300 ${
            darkConsoleMode ? 'border-[#292524] bg-[#1c1917]' : 'border-outline-variant/60 bg-surface-container-low'
          }`}>
            {dashboardDraft.trim() && (
              <div
                className={`rounded-xl border p-3 space-y-3 ${
                  draftChannel === 'WhatsApp'
                    ? darkConsoleMode
                      ? 'border-emerald-700 bg-emerald-950/30'
                      : 'border-emerald-200 bg-emerald-50'
                    : darkConsoleMode
                    ? 'border-sky-700 bg-sky-950/30'
                    : 'border-sky-200 bg-sky-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p
                      className={`text-[10px] font-extrabold uppercase tracking-widest ${
                        draftChannel === 'WhatsApp' ? 'text-emerald-700' : 'text-sky-700'
                      }`}
                    >
                      Dashboard Alert Draft
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Edit this draft here, then send it from the outreach chat.
                    </p>
                  </div>
                  <div className="flex rounded-lg bg-white/70 border border-white/70 p-0.5 text-[10px] font-bold">
                    {(['WhatsApp', 'SMS'] as const).map((channel) => (
                      <button
                        key={channel}
                        type="button"
                        onClick={() => setDraftChannel(channel)}
                        className={`px-3 py-1.5 rounded-md transition-all ${
                          draftChannel === channel
                            ? channel === 'WhatsApp'
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-sky-500 text-white shadow-sm'
                            : channel === 'WhatsApp'
                            ? 'text-emerald-700 hover:bg-emerald-100'
                            : 'text-sky-700 hover:bg-sky-100'
                        }`}
                      >
                        {channel}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  rows={3}
                  value={dashboardDraft}
                  onChange={(event) => setDashboardDraft(event.target.value)}
                  className={`w-full resize-none rounded-lg border px-3 py-2 text-xs leading-relaxed outline-none ${
                    draftChannel === 'WhatsApp'
                      ? 'border-emerald-200 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200'
                      : 'border-sky-200 bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-200'
                  }`}
                />

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDashboardDraft('')}
                    className="h-8 px-3 rounded-lg border border-outline-variant bg-white/70 text-[10px] font-bold text-muted-foreground hover:bg-white hover:text-foreground transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSendDashboardDraft}
                    className={`h-8 px-4 rounded-lg text-[10px] font-bold text-white transition-all active:scale-95 ${
                      draftChannel === 'WhatsApp'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-sky-500 hover:bg-sky-600'
                    }`}
                  >
                    Send {draftChannel} Draft
                  </button>
                </div>
              </div>
            )}

            <div className={`rounded-xl border p-3 space-y-3 transition-colors duration-300 ${
                darkConsoleMode ? 'border-stone-800 bg-stone-900/40' : 'border-outline-variant/60 bg-surface-container-lowest'
              }`}>
                <p className="text-[9px] font-extrabold opacity-60 uppercase tracking-widest">Suggested Outreach Templates</p>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickTemplate(
                        `Salam ${activeCustomer.name} sahib, this is a reminder from PSO SME. Your pending credit balance is PKR ${activeCustomer.balance.toLocaleString()}. Kindly clear this balance today. Shukriya.`
                      )
                    }
                    className={`border rounded px-3 py-1.5 font-bold transition-all active:scale-95 flex items-center gap-1 ${
                      darkConsoleMode
                        ? 'bg-stone-800 border-stone-700 text-stone-400 hover:bg-stone-700'
                        : 'bg-surface-container hover:bg-surface-container-high border-outline-variant text-primary'
                    }`}
                  >
                    <Icon name="payments" size={12} />
                    Send Balance Due Reminder
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickTemplate(
                        `Salam ${activeCustomer.name} sahib, we have received fresh premium stock of your preferred grocery lines at a discount today! Let us know if you want delivery. Shukriya.`
                      )
                    }
                    className={`border rounded px-3 py-1.5 font-bold transition-all active:scale-95 flex items-center gap-1 ${
                      darkConsoleMode
                        ? 'bg-stone-800 border-stone-700 text-stone-400 hover:bg-stone-700'
                        : 'bg-surface-container hover:bg-surface-container-high border-outline-variant text-primary'
                    }`}
                  >
                    <Icon name="inventory_2" size={12} />
                    Stock / Promotional Offer
                  </button>
                </div>
            </div>
            
            {/* Communication Channel Mode Selector */}
            <div className="flex gap-2 text-[10px] font-bold">
              {(['WhatsApp', 'SMS'] as const).map((mode) => {
                const isSelected = commMode === mode;
                let icon = 'chat';
                if (mode === 'SMS') icon = 'sms';
                
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setCommMode(mode);
                      triggerToast(`Outreach channel set to ${mode}`, 'info');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all active:scale-95 ${
                      isSelected
                        ? darkConsoleMode
                          ? 'bg-stone-600 border-stone-500 text-white shadow-md'
                          : 'bg-primary border-primary text-white shadow-sm'
                        : darkConsoleMode
                        ? 'border-stone-700 bg-stone-800 text-stone-400 hover:text-stone-200'
                        : 'border-outline-variant/60 bg-white text-on-surface-variant hover:bg-stone-50'
                    }`}
                  >
                    <Icon name={icon} size={13} />
                    <span>{mode}</span>
                  </button>
                );
              })}
            </div>

            {/* Composer Input Form */}
            <form onSubmit={handleSendMessage} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => triggerToast('Invoice drafts attachments successfully synced. Select a quick action.', 'info')}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  darkConsoleMode ? 'hover:bg-stone-800 text-stone-400 hover:text-stone-200' : 'hover:bg-surface-container text-on-surface-variant hover:text-primary'
                }`}
                title="Attach ledger invoices document"
              >
                <Icon name="attach_file" size={20} />
              </button>
              
              <input
                required
                type="text"
                placeholder={
                  commMode === 'SMS'
                    ? `Write SMS template to ${activeCustomer.name}...`
                    : `Write WhatsApp message to ${activeCustomer.name}...`
                }
                className={`flex-1 rounded-xl px-4 py-2.5 outline-none text-[12px] transition-all border ${
                  darkConsoleMode
                    ? 'bg-[#1c1917] border-stone-700 text-stone-100 placeholder:text-stone-500 focus:border-stone-500/50'
                    : 'bg-white border-outline-variant text-on-surface focus:ring-1 focus:ring-primary/20 focus:border-primary'
                }`}
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
              />
              
              <button
                type="submit"
                className="px-4 py-2.5 bg-primary text-white rounded-xl hover:opacity-90 active:scale-95 transition-all flex items-center gap-1 text-[12px] font-bold hover:shadow-lg shadow-sm"
              >
                <Icon name={commMode === 'SMS' ? 'sms' : 'send'} size={16} /> 
                <span>Dispatch</span>
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-background text-on-surface-variant italic text-xs gap-2">
          <Icon name="forum" className="opacity-45" size={48} />
          Select an outreach client task from the suite queue to start communication.
        </div>
      )}

      {/* ========================================================
          RIGHT COLUMN: CONTEXT METRICS DRAWER (300px)
          ======================================================== */}
      {activeCustomer && (
        <div className={`w-[300px] border-l flex flex-col h-full shrink-0 p-4 space-y-5 overflow-y-auto custom-scrollbar transition-colors duration-300 ${
          darkConsoleMode ? 'border-[#292524] bg-[#1c1917]' : 'border-outline-variant/60 bg-surface-container-lowest'
        }`}>
          
          {/* Dynamic Credit Risk Gauge using Circular SVG */}
          <div className="text-center border-b pb-4 flex flex-col items-center border-stone-100/10">
            <h4 className="text-[10px] opacity-75 font-bold uppercase tracking-wider text-left w-full mb-3">Credit Risk Health</h4>
            
            <div className="relative flex items-center justify-center my-1.5">
              {/* Circular SVG representation */}
              <svg className="w-24 h-24 transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="38"
                  stroke={darkConsoleMode ? '#292524' : '#f0efeb'}
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="38"
                  stroke={
                    activeCustomer.healthScore > 80 
                      ? '#4caf79' 
                      : activeCustomer.healthScore > 50 
                      ? '#f59e0b' 
                      : '#ef4444'
                  }
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray="238.76"
                  strokeDashoffset={238.76 - (238.76 * activeCustomer.healthScore) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              {/* Score text absolute overlay */}
              <div className="absolute flex flex-col items-center">
                <span className="font-extrabold text-[18px] font-mono leading-none">{activeCustomer.healthScore}%</span>
                <span className="text-[7px] opacity-60 font-bold uppercase tracking-widest mt-0.5">Rating</span>
              </div>
            </div>

            <p className="text-[11px] font-bold mt-2">
              {activeCustomer.healthScore > 80 
                ? 'Low risk / Good creditor' 
                : activeCustomer.healthScore > 50 
                ? 'Warning risk category' 
                : 'High risk credit breach'}
            </p>
          </div>

          {/* Customer Financial Profile */}
          <div className="space-y-3">
            <h4 className="text-[10px] opacity-75 font-bold uppercase tracking-wider">Ledger Balance Summary</h4>
            <div className={`p-3.5 rounded-xl border space-y-2.5 text-xs ${
              darkConsoleMode ? 'bg-[#1c1917] border-stone-700/80' : 'bg-surface-container-low border-outline-variant/30'
            }`}>
              <div className="flex justify-between py-0.5">
                <span className="opacity-75">Outstanding Balance:</span>
                <span className="font-bold text-tertiary">PKR {activeCustomer.balance.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="opacity-75">Credit Limit Status:</span>
                <span className="font-bold font-mono text-[11px]">PKR {activeCustomer.creditLimit.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="opacity-75">Overdue Days Counter:</span>
                <span className="font-extrabold text-red-500">{activeCustomer.lastVisitDays} days overdue</span>
              </div>

              {/* Progress bar comparison */}
              <div className="pt-1.5">
                <div className="flex justify-between text-[8px] opacity-60 font-bold mb-1">
                  <span>Credit Utilized</span>
                  <span>{Math.round((activeCustomer.balance / (activeCustomer.creditLimit || 1)) * 100)}%</span>
                </div>
                <div className="w-full bg-stone-300/40 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      activeCustomer.balance > activeCustomer.creditLimit ? 'bg-red-500' : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(100, (activeCustomer.balance / (activeCustomer.creditLimit || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Cash Repayment Panel */}
          <div className="border-t border-stone-100/10 pt-4">
            {showRepaymentForm ? (
              <form onSubmit={handleLogRepayment} className={`p-3 rounded-xl border space-y-2.5 anim-subtle-fade ${
                darkConsoleMode ? 'bg-[#231f1c] border-stone-800' : 'bg-surface-container-low border-outline-variant/40'
              }`}>
                <p className="text-[10px] font-bold text-primary">Log Repayment Cash Amount</p>
                <div className="relative">
                  <input
                    required
                    type="number"
                    placeholder="Enter PKR amount..."
                    value={repaymentAmount}
                    onChange={(e) => setRepaymentAmount(e.target.value)}
                    className="w-full text-xs p-2 pr-9 border rounded-lg bg-white text-stone-900 border-outline outline-none"
                  />
                  <span className="absolute right-2.5 top-2 text-[9px] font-bold text-stone-500 font-mono">PKR</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-primary text-white font-bold py-1.5 rounded-lg text-[10px] hover:opacity-90 active:scale-95"
                  >
                    Log Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRepaymentForm(false)}
                    className="px-2.5 py-1.5 border border-stone-300 hover:bg-stone-200/50 rounded-lg text-[10px] text-stone-700 dark:text-stone-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                disabled={activeCustomer.balance <= 0}
                onClick={() => setShowRepaymentForm(true)}
                className={`w-full py-2.5 rounded-xl border font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                  activeCustomer.balance <= 0
                    ? 'border-stone-300 text-stone-400 bg-stone-100 cursor-not-allowed dark:bg-stone-800 dark:border-stone-700/50'
                    : 'bg-primary text-white hover:opacity-95 hover:shadow-lg active:scale-95'
                }`}
              >
                <Icon name="payments" size={15} />
                Log Cash Collection
              </button>
            )}
          </div>

          {/* Product Purchasing Habits */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] opacity-75 font-bold uppercase tracking-wider">Buying Preference Matrix</h4>
            <div className="space-y-2 text-xs">
              {activeCustomer.preferredProducts && activeCustomer.preferredProducts.length > 0 ? (
                activeCustomer.preferredProducts.map((p) => (
                  <div key={p.name} className={`p-2.5 rounded-lg border ${
                    darkConsoleMode ? 'bg-[#1c1917] border-stone-800' : 'bg-surface-container-low border-outline-variant/30'
                  }`}>
                    <div className="flex justify-between items-center text-[10px] mb-1 font-bold">
                      <span>{p.name}</span>
                      <span className="font-mono text-outline">{p.pct}%</span>
                    </div>
                    {/* Visual progress line */}
                    <div className="w-full bg-stone-300/40 rounded-full h-1">
                      <div className="bg-primary h-full rounded-full" style={{ width: `${p.pct}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[10px] opacity-60 italic">No buying pattern logged.</p>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
