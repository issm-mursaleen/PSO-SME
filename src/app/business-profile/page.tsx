'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

export default function BusinessProfile() {
  const { customers, invoices } = useApp();

  // Local Form state for Business Profile
  const [storeName, setStoreName] = useState('Karachi SME Sales Hub');
  const [proprietor, setProprietor] = useState('Ahmed Khan');
  const [phone, setPhone] = useState('+92 300 1234567');
  const [email, setEmail] = useState('manager@karachihub.alara.pk');
  const [address, setAddress] = useState('Shop 4, Lane 2, DHA Phase 5, Karachi, Pakistan');
  
  // Outreach policy state
  const [inactivityThreshold, setInactivityThreshold] = useState('14');
  const [autoReminderToggle, setAutoReminderToggle] = useState(true);

  // Integrations state
  const [apiConnected, setApiConnected] = useState(true);
  const [bankSynced, setBankSynced] = useState(true);

  // General Interactive States
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // Stats calculation — all real, derived from live customers + sales.
  const totalSalesValue = invoices.reduce((sum, i) => sum + i.amount, 0);
  const totalInvoices = invoices.length;
  const activeCustomerPct = customers.length
    ? Math.round((customers.filter((c) => c.status === 'Active').length / customers.length) * 100)
    : 0;

  const triggerToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !proprietor.trim()) {
      triggerToast('Store Name and Proprietor cannot be blank.', 'info');
      return;
    }

    setIsSaving(true);
    triggerToast('Synchronizing business profiles with Alara ledger node...', 'info');

    setTimeout(() => {
      setIsSaving(false);
      triggerToast('Business Profile settings successfully updated!', 'success');
    }, 1200);
  };

  return (
    <div className="p-6 relative max-w-[1400px] mx-auto space-y-6">
      
      {/* Toast popup */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold bg-white text-stone-900 border-stone-500/20 animate-bounce-dots">
          <Icon name={toast.type === 'success' ? 'check_circle' : 'info'} className="text-stone-500" size={16} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Hero Banner header */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#1a1a18] to-[#292524] p-6 sm:p-8 text-white shadow-md">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            {/* Store Avatar representation */}
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white text-2xl font-extrabold shadow-inner shrink-0">
              {storeName.split(' ').map(n=>n[0]).join('')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">{storeName}</h1>
                <span className="text-[10px] bg-stone-400/20 text-stone-300 font-bold px-2 py-0.5 rounded-full border border-stone-400/30">Verified SME</span>
              </div>
              <p className="text-xs text-white/80 font-medium mt-1">Proprietor: {proprietor} • Karachi Retail Network</p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-center shadow-sm">
              <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider block">Total Sales</span>
              <span className="font-mono text-base font-extrabold block mt-0.5 text-stone-300">PKR {totalSalesValue.toLocaleString()}</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-center shadow-sm">
              <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider block">Active Customers</span>
              <span className="font-mono text-base font-extrabold block mt-0.5 text-stone-300">{activeCustomerPct}%</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Profile Grid */}
      <form onSubmit={handleSaveProfile} className="grid grid-cols-12 gap-6">
        
        {/* Left: Store Identity Details & Integrations (8 columns) */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          
          {/* Identity details */}
          <div className="bg-white rounded-xl border border-outline-variant p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-on-surface flex items-center gap-2 border-b pb-2 border-stone-100">
              <Icon name="store" className="text-primary" size={20} />
              Business Identity Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-on-surface-variant block">Store Registered Name</label>
                <input
                  type="text"
                  required
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full text-xs p-2.5 border border-outline-variant rounded-lg outline-none focus:ring-1 focus:ring-primary focus:border-primary font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-on-surface-variant block">Authorized Proprietor / Manager</label>
                <input
                  type="text"
                  required
                  value={proprietor}
                  onChange={(e) => setProprietor(e.target.value)}
                  className="w-full text-xs p-2.5 border border-outline-variant rounded-lg outline-none focus:ring-1 focus:ring-primary focus:border-primary font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-on-surface-variant block">Primary Contact Phone</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full text-xs p-2.5 border border-outline-variant rounded-lg outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-on-surface-variant block">Business Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-xs p-2.5 border border-outline-variant rounded-lg outline-none focus:ring-1 focus:ring-primary focus:border-primary font-bold"
                />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-[11px] font-bold text-on-surface-variant block">Physical Shop Address</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full text-xs p-2.5 border border-outline-variant rounded-lg outline-none focus:ring-1 focus:ring-primary focus:border-primary font-bold"
                />
              </div>
            </div>
          </div>

          {/* Outreach Policy settings */}
          <div className="bg-white rounded-xl border border-outline-variant p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-on-surface flex items-center gap-2 border-b pb-2 border-stone-100">
              <Icon name="campaign" className="text-primary" size={20} />
              Customer Outreach Policy
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Inactivity threshold */}
              <div className="space-y-1 md:col-span-2">
                <label className="text-[11px] font-bold text-on-surface-variant block">Inactivity Outreach Threshold</label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400 font-mono">Days</span>
                  <input
                    type="number"
                    value={inactivityThreshold}
                    onChange={(e) => setInactivityThreshold(e.target.value)}
                    className="w-full text-xs pl-3 pr-12 py-2.5 border border-outline-variant rounded-lg outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono font-bold"
                  />
                </div>
                <p className="text-[10px] text-on-surface-variant mt-0.5">Customers with no visit beyond this many days are flagged for re-engagement.</p>
              </div>

              {/* Automatic draft switch */}
              <div className="flex items-center justify-between md:col-span-2 py-2 border-y border-dashed border-outline-variant/30">
                <div>
                  <h4 className="font-bold text-xs">Automated Messaging Drafts</h4>
                  <p className="text-[10px] text-on-surface-variant mt-0.5">Let Alara automatically draft outreach inside the Connect suite when a customer goes quiet.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAutoReminderToggle(!autoReminderToggle);
                    triggerToast(`Automated outreach drafts ${!autoReminderToggle ? 'enabled' : 'disabled'}`, 'info');
                  }}
                  className={`w-12 h-6.5 rounded-full p-0.5 transition-colors relative flex items-center shrink-0 ${
                    autoReminderToggle ? 'bg-primary' : 'bg-stone-300'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 transform ${
                    autoReminderToggle ? 'translate-x-5.5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

            </div>
          </div>

        </div>

        {/* Right Panel: Sales Summary & Active credentials (4 columns) */}
        <div className="col-span-12 lg:col-span-4 space-y-6">

          {/* Sales summary */}
          <div className="bg-white rounded-xl border border-outline-variant p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-on-surface flex items-center gap-2 border-b pb-2 border-stone-100">
              <Icon name="pie_chart" className="text-primary" size={20} />
              Sales Summary
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <div className="flex justify-between text-on-surface-variant font-medium mb-1.5">
                  <span>Total Sales Value:</span>
                  <span className="font-bold text-primary">PKR {totalSalesValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-on-surface-variant font-medium">
                  <span>Invoices Issued:</span>
                  <span className="font-bold font-mono">{totalInvoices}</span>
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex justify-between text-[10px] opacity-75 font-bold mb-1.5">
                  <span>Avg Ticket:</span>
                  <span>PKR {(totalInvoices ? Math.round(totalSalesValue / totalInvoices) : 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Connected Channels & APIs */}
          <div className="bg-white rounded-xl border border-outline-variant p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-on-surface flex items-center gap-2 border-b pb-2 border-stone-100">
              <Icon name="hub" className="text-primary" size={20} />
              Integrated SME Gateways
            </h3>

            <div className="space-y-3">
              {/* WhatsApp API */}
              <div className="flex items-center justify-between p-3 bg-stone-50 border border-outline-variant/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <Icon name="verified" className="text-stone-500 font-bold" size={18} />
                  <div>
                    <h4 className="font-extrabold text-[11px]">WhatsApp Business API</h4>
                    <p className="text-[9px] opacity-65">Channel provider status</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setApiConnected(!apiConnected);
                    triggerToast(`WhatsApp API ${!apiConnected ? 'Connected' : 'Disconnected'}`, 'info');
                  }}
                  className={`px-2.5 py-1 text-[9px] font-bold rounded-lg transition-all ${
                    apiConnected 
                      ? 'bg-stone-500/10 text-stone-600 border border-stone-500/20'
                      : 'bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20'
                  }`}
                >
                  {apiConnected ? 'Active' : 'Offline'}
                </button>
              </div>

              {/* Bank Account */}
              <div className="flex items-center justify-between p-3 bg-stone-50 border border-outline-variant/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <Icon name="account_balance" className="text-primary font-bold" size={18} />
                  <div>
                    <h4 className="font-extrabold text-[11px]">Bank Sync Ledger (HBL)</h4>
                    <p className="text-[9px] opacity-65">Real-time payment polling</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBankSynced(!bankSynced);
                    triggerToast(`Bank Ledger Sync ${!bankSynced ? 'Enabled' : 'Disabled'}`, 'info');
                  }}
                  className={`px-2.5 py-1 text-[9px] font-bold rounded-lg transition-all ${
                    bankSynced 
                      ? 'bg-stone-500/10 text-stone-600 border border-stone-500/20'
                      : 'bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20'
                  }`}
                >
                  {bankSynced ? 'Synced' : 'Pause'}
                </button>
              </div>
            </div>
          </div>

          {/* Form Save Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className={`w-full py-4 rounded-xl font-headline-sm flex items-center justify-center gap-2 font-bold shadow-md active:scale-98 transition-all ${
                isSaving 
                  ? 'bg-stone-400 text-stone-100 cursor-not-allowed shadow-none'
                  : 'bg-primary text-white hover:opacity-95'
              }`}
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Synchronizing Ledger settings...
                </>
              ) : (
                <>
                  <Icon name="save" size={18} /> Save Profile &amp; Rules
                </>
              )}
            </button>
          </div>

        </div>

      </form>

    </div>
  );
}
