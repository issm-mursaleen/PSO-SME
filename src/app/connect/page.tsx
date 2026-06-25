'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

export default function CustomerConnect() {
  const {
    customers,
    connectQueue,
    commLogs,
    sendWhatsAppReminder,
    recordPayment,
  } = useApp();

  const [selectedQueueId, setSelectedQueueId] = useState('q-1');
  const [activeFilter, setActiveFilter] = useState<'All' | 'Overdue' | 'Inactive'>('All');
  const [messageContent, setMessageContent] = useState('');
  
  // Communication mode selection: WhatsApp, SMS, or Call
  const [commMode, setCommMode] = useState<'WhatsApp' | 'SMS' | 'Call'>('WhatsApp');

  // Custom theme option (Visual mode)
  const [darkConsoleMode, setDarkConsoleMode] = useState(false);

  // Repayment form modal inside context pane
  const [showRepaymentForm, setShowRepaymentForm] = useState(false);
  const [repaymentAmount, setRepaymentAmount] = useState('');

  // Call simulation modal state
  const [activeCallSimulation, setActiveCallSimulation] = useState<{ active: boolean; seconds: number; loggedText: string } | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Toast message state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Find active queue item
  const activeQueueItem = connectQueue.find((q) => q.id === selectedQueueId) || connectQueue[0] || null;

  // Find active customer info
  const activeCustomer = useMemo(() => {
    if (!activeQueueItem) return null;
    return customers.find((c) => c.id === activeQueueItem.customerId) || null;
  }, [customers, activeQueueItem]);

  // Pre-select a customer's outreach task when arriving via ?customer=<id>
  // (e.g. "Share WhatsApp" from a recorded sale opens their timeline).
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get('customer');
    if (cid) {
      const queued = connectQueue.find((q) => q.customerId === cid);
      if (queued) setSelectedQueueId(queued.id);
    }
    // Read once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync communication mode with customer's default channel
  useEffect(() => {
    if (activeCustomer) {
      if (activeCustomer.channel === 'Call') {
        setCommMode('Call');
      } else if (activeCustomer.channel === 'SMS') {
        setCommMode('SMS');
      } else {
        setCommMode('WhatsApp');
      }
    }
  }, [activeCustomer]);

  // Find communication logs
  const activeLogs = useMemo(() => {
    if (!activeQueueItem) return [];
    return commLogs.filter((log) => log.customerId === activeQueueItem.customerId);
  }, [commLogs, activeQueueItem]);

  // Filter queue list
  const filteredQueue = useMemo(() => {
    return connectQueue.filter((item) => {
      if (activeFilter === 'All') return true;
      if (activeFilter === 'Overdue') {
        return item.reason.toLowerCase().includes('overdue') || item.reason.toLowerCase().includes('failed') || item.reason.toLowerCase().includes('credit');
      }
      if (activeFilter === 'Inactive') {
        return item.reason.toLowerCase().includes('inactivity') || item.reason.toLowerCase().includes('invoiced') || item.reason.toLowerCase().includes('visit');
      }
      return true;
    });
  }, [connectQueue, activeFilter]);

  // Get status count for quick badges
  const queueCounts = useMemo(() => {
    const counts = { All: connectQueue.length, Overdue: 0, Inactive: 0 };
    connectQueue.forEach((item) => {
      const lowerReason = item.reason.toLowerCase();
      if (lowerReason.includes('overdue') || lowerReason.includes('failed') || lowerReason.includes('credit')) {
        counts.Overdue += 1;
      }
      if (lowerReason.includes('inactivity') || lowerReason.includes('invoiced') || lowerReason.includes('visit')) {
        counts.Inactive += 1;
      }
    });
    return counts;
  }, [connectQueue]);

  // Toast trigger helper
  const triggerToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim() || !activeQueueItem) return;

    // Use selected commMode parameter to log channel type (WhatsApp, SMS, Call)
    sendWhatsAppReminder(activeQueueItem.customerId, messageContent, commMode);
    setMessageContent('');
    triggerToast(`${commMode} communication dispatch logged in timeline feed.`, 'success');
  };

  const handleQuickTemplate = (text: string) => {
    setMessageContent(text);
    triggerToast('Template loaded in composer.', 'info');
  };

  // Perform Simulated Client Phone Call
  const startCallSimulation = () => {
    if (!activeQueueItem) return;
    setActiveCallSimulation({ active: true, seconds: 0, loggedText: '' });
    triggerToast(`Dialing client: ${activeQueueItem.phone}`, 'info');
    
    callTimerRef.current = setInterval(() => {
      setActiveCallSimulation((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          seconds: prev.seconds + 1,
        };
      });
    }, 1000);
  };

  const hangUpCallSimulation = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    if (activeCallSimulation) {
      // Simulate logging outcome
      const duration = activeCallSimulation.seconds;
      const logMsg = activeCallSimulation.loggedText.trim() || 'Call connected, client confirmed pending check.';
      
      // Use the helper to log call parameters in context
      sendWhatsAppReminder(
        activeQueueItem.customerId,
        `Call connected (Duration: ${duration}s) - Notes: ${logMsg}`,
        'Call'
      );
      
      triggerToast('Call outcome logged to communication timeline.', 'success');
    }
    setActiveCallSimulation(null);
  };

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

      {/* Dialer Overlay Popup Container */}
      {activeCallSimulation && activeQueueItem && (
        <div className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-stone-900 border border-stone-700 text-white rounded-2xl w-80 p-6 flex flex-col items-center gap-4 shadow-2xl anim-subtle-fade">
            <span className="text-[10px] text-stone-400 font-extrabold uppercase tracking-widest">Active Call Link</span>
            
            {/* Pulsing Dialer Ring */}
            <div className="relative my-2">
              <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white anim-pulse-dot">
                <Icon name="call" className="animate-bounce" size={28} />
              </div>
            </div>

            <div className="text-center">
              <h4 className="font-bold text-sm">{activeQueueItem.customerName}</h4>
              <p className="text-[11px] text-stone-400 mt-1">{activeQueueItem.phone}</p>
              <p className="font-mono text-xs text-stone-400 mt-2">
                Duration: {Math.floor(activeCallSimulation.seconds / 60).toString().padStart(2, '0')}:
                {(activeCallSimulation.seconds % 60).toString().padStart(2, '0')}
              </p>
            </div>

            {/* Inline Note editor for Call Outcome */}
            <div className="w-full mt-2">
              <label className="text-[9px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Call Notes / Outcome</label>
              <input
                type="text"
                placeholder="e.g. Confirmed payment next Tuesday..."
                value={activeCallSimulation.loggedText}
                onChange={(e) => setActiveCallSimulation((prev) => prev ? { ...prev, loggedText: e.target.value } : null)}
                className="w-full text-xs bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white placeholder:text-stone-500 outline-none focus:border-stone-500"
              />
            </div>

            <button
              onClick={hangUpCallSimulation}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg hover:shadow-red-600/10 active:scale-95"
            >
              <Icon name="call_end" size={16} /> End Call & Log Note
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          LEFT COLUMN: OUTREACH TASK QUEUE (320px)
          ======================================================== */}
      <div className={`w-[320px] border-r flex flex-col h-full shrink-0 transition-colors duration-300 ${
        darkConsoleMode ? 'border-[#292524] bg-[#1c1917]' : 'border-outline-variant/60 bg-surface-container-lowest'
      }`}>
        
        {/* Queue Header & Filters */}
        <div className={`p-4 border-b space-y-3 shrink-0 ${darkConsoleMode ? 'border-[#292524]' : 'border-outline-variant/60'}`}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Icon name="hub" className="text-primary" size={20} />
              Outreach Suite
            </h3>
            <span className="text-[9px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
              {queueCounts.All} tasks
            </span>
          </div>
          
          {/* Quick Filters */}
          <div className={`flex p-0.5 rounded-lg text-[10px] border ${
            darkConsoleMode ? 'bg-[#1c1917] border-stone-700' : 'bg-surface-container border-outline-variant/30'
          }`}>
            {(['All', 'Overdue', 'Inactive'] as const).map((filter) => {
              const isActive = activeFilter === filter;
              const count = filter === 'All' ? queueCounts.All : filter === 'Overdue' ? queueCounts.Overdue : queueCounts.Inactive;
              return (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`flex-1 py-1 rounded-md font-bold transition-all flex items-center justify-center gap-1 ${
                    isActive
                      ? darkConsoleMode
                        ? 'bg-stone-800 text-white shadow-sm'
                        : 'bg-white shadow-sm text-primary'
                      : 'text-on-surface-variant hover:opacity-85'
                  }`}
                >
                  {filter}
                  <span className={`px-1 rounded-full text-[8px] ${
                    isActive ? 'bg-primary-fixed text-primary' : 'bg-stone-200/50 text-stone-600'
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Queue Scroll List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-stone-100/10">
          {filteredQueue.length === 0 ? (
            <p className="text-xs opacity-60 italic p-6 text-center">No connect tasks pending in this group.</p>
          ) : (
            filteredQueue.map((item) => {
              const isActive = item.id === selectedQueueId;
              const customerObj = customers.find((c) => c.id === item.customerId);
              const balanceStr = customerObj ? `PKR ${customerObj.balance.toLocaleString()}` : '';
              
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedQueueId(item.id)}
                  className={`p-4 cursor-pointer transition-all border-l-4 select-none relative group ${
                    isActive
                      ? darkConsoleMode
                        ? 'bg-stone-800/60 border-stone-500 shadow-sm text-white'
                        : 'bg-primary-fixed/20 border-primary text-primary font-bold shadow-sm'
                      : darkConsoleMode
                      ? 'border-transparent text-stone-400 hover:bg-[#292524] hover:text-stone-200'
                      : 'border-transparent text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {/* Status Indicator circle */}
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <h4 className="font-extrabold text-[12px] truncate max-w-[170px]">{item.customerName}</h4>
                      <p className="text-[10px] text-tertiary font-bold mt-0.5">{item.reason}</p>
                    </div>
                    
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      item.health === 'critical' 
                        ? 'bg-red-500/15 text-red-500 border border-red-500/20' 
                        : 'bg-amber-500/15 text-amber-500 border border-amber-500/20'
                    }`}>
                      {item.health === 'critical' ? 'Urgent' : 'Alert'}
                    </span>
                  </div>

                  {/* Financial snapshot inside card */}
                  <div className="flex items-center justify-between mt-3 text-[9px] opacity-75 font-semibold">
                    <span className="flex items-center gap-1">
                      <Icon name={item.channel === 'WhatsApp' ? 'chat' : item.channel === 'SMS' ? 'sms' : 'phone_iphone'} size={12} />
                      {item.lastAction}
                    </span>
                    <span className="font-mono font-bold text-stone-800 dark:text-stone-300">{balanceStr}</span>
                  </div>
                </div>
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
                  Phone: {activeQueueItem.phone} • Channel Preference: <span className="font-bold">{activeCustomer.channel}</span>
                </p>
              </div>
            </div>

            {/* Quick Actions Header */}
            <div className="flex items-center gap-2">
              <button
                onClick={startCallSimulation}
                className="px-3 py-1.5 bg-stone-600 text-white font-bold text-xs rounded-lg hover:bg-stone-500 active:scale-95 transition-all flex items-center gap-1 shadow-sm"
              >
                <Icon name="call" size={15} /> Call Client
              </button>
              
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
                          <Icon name={log.type === 'Call' ? 'phone_callback' : log.type === 'SMS' ? 'sms' : 'chat'} size={10} />
                          {log.type === 'Call' ? 'Voice Call Outcome' : log.type === 'SMS' ? 'SMS Outreach' : 'WhatsApp Outreach'}
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
          </div>

          {/* Suggested Quick Outreach Action Templates (text templates are
              irrelevant for voice Calls, so hide them in Call mode) */}
          {commMode !== 'Call' && (
          <div className={`p-4 border-t shrink-0 space-y-3 transition-colors duration-300 ${
            darkConsoleMode ? 'border-[#292524] bg-[#1c1917]' : 'border-outline-variant/60 bg-surface-container-lowest'
          }`}>
            <p className="text-[9px] font-extrabold opacity-60 uppercase tracking-widest">Suggested Outreach Templates</p>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <button
                onClick={() =>
                  handleQuickTemplate(
                    `Salam ${activeCustomer.name} sahib, this is a reminder from ALARA SME. Your pending credit balance is PKR ${activeCustomer.balance.toLocaleString()}. Kindly clear this balance today. Shukriya.`
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
          )}

          {/* Composer & Channel Control Area */}
          <div className={`p-4 border-t shrink-0 space-y-3 transition-colors duration-300 ${
            darkConsoleMode ? 'border-[#292524] bg-[#1c1917]' : 'border-outline-variant/60 bg-surface-container-low'
          }`}>
            
            {/* Communication Channel Mode Selector */}
            <div className="flex gap-2 text-[10px] font-bold">
              {(['WhatsApp', 'SMS', 'Call'] as const).map((mode) => {
                const isSelected = commMode === mode;
                let icon = 'chat';
                if (mode === 'SMS') icon = 'sms';
                if (mode === 'Call') icon = 'call';
                
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
                  commMode === 'Call'
                    ? `Log voice call outcomes for ${activeCustomer.name}...`
                    : commMode === 'SMS'
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
                <Icon name={commMode === 'Call' ? 'call' : commMode === 'SMS' ? 'sms' : 'send'} size={16} /> 
                <span>{commMode === 'Call' ? 'Log Call' : 'Dispatch'}</span>
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
