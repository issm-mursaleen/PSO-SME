'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useApp, Invoice } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

type InvoiceFilter = 'All' | 'Paid' | 'Unpaid' | 'Partial' | 'Overdue';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatMoney = (value: number) => `PKR ${value.toLocaleString()}`;

const buildInvoiceHtml = (invoice: Invoice) => {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.total, 0);
  const rows = invoice.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td class="center">${item.quantity} ${escapeHtml(item.unit)}</td>
          <td class="right">${formatMoney(item.price)}</td>
          <td class="right strong">${formatMoney(item.total)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.id)} Invoice</title>
  <style>
    body { margin: 0; background: #f5f4f0; color: #1a1a18; font-family: Arial, sans-serif; }
    .page { width: 760px; margin: 32px auto; background: #fff; border: 1px solid #e5e4e0; padding: 32px; }
    .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #e5e4e0; padding-bottom: 18px; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 20px; letter-spacing: 0.12em; }
    h2 { font-size: 18px; text-align: right; }
    .muted { color: #787776; font-size: 12px; line-height: 1.7; }
    .bill { margin: 24px 0; font-size: 13px; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #ededea; color: #787776; text-align: left; padding: 10px; }
    td { border-bottom: 1px solid #e5e4e0; padding: 10px; }
    .center { text-align: center; }
    .right { text-align: right; }
    .strong { font-weight: 700; }
    .totals { width: 320px; margin-left: auto; margin-top: 24px; font-size: 13px; }
    .line { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #e5e4e0; }
    .grand { font-size: 17px; font-weight: 800; }
    .notes { margin-top: 24px; background: #f0efeb; padding: 14px; font-size: 12px; color: #44433f; line-height: 1.6; }
    @media print { body { background: #fff; } .page { margin: 0; width: auto; border: 0; } }
  </style>
</head>
<body>
  <main class="page">
    <section class="top">
      <div>
        <h1>PSO SME</h1>
        <p class="muted">Retailer - Clifton, Karachi<br/>Phone: +92 300 0000000</p>
      </div>
      <div>
        <h2>INVOICE</h2>
        <p class="muted">#${escapeHtml(invoice.id)}<br/>Date: ${escapeHtml(invoice.date)}<br/>Due: ${escapeHtml(invoice.dueDate)}</p>
      </div>
    </section>
    <section class="bill">
      <p class="muted strong">BILL TO</p>
      <p class="strong">${escapeHtml(invoice.customerName)}</p>
      <p class="muted">Payment Type: ${escapeHtml(invoice.paymentType)} | Status: ${escapeHtml(invoice.status)}</p>
    </section>
    <table>
      <thead>
        <tr><th>Item</th><th class="center">Qty</th><th class="right">Price</th><th class="right">Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <section class="totals">
      <div class="line"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
      <div class="line"><span>Discount</span><span>${formatMoney(invoice.discount)}</span></div>
      <div class="line grand"><span>Grand Total</span><span>${formatMoney(invoice.amount)}</span></div>
    </section>
    <section class="notes"><strong>Notes:</strong><br/>${escapeHtml(invoice.notes)}</section>
  </main>
</body>
</html>`;
};

const downloadInvoiceFile = (invoice: Invoice) => {
  const blob = new Blob([buildInvoiceHtml(invoice)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${invoice.id}-${invoice.customerName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const printInvoice = (invoice: Invoice) => {
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(buildInvoiceHtml(invoice));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
};

export default function InvoicesList() {
  const { invoices, recordPayment, sendWhatsAppReminder } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<InvoiceFilter>('All');
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  
  // Quick payment modal state
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  // Calculate dynamic stats
  const totalCount = invoices.length + 151; // baseline offset
  const paidCount = invoices.filter((i) => i.status === 'Paid').length + 111;
  const unpaidCount = invoices.filter((i) => i.status === 'Unpaid').length + 27;
  const overdueCount = invoices.filter((i) => i.status === 'Overdue').length + 13;

  const filterCounts: Record<InvoiceFilter, number> = {
    All: invoices.length,
    Paid: invoices.filter((i) => i.status === 'Paid').length,
    Unpaid: invoices.filter((i) => i.status === 'Unpaid').length,
    Partial: invoices.filter((i) => i.status === 'Partial').length,
    Overdue: invoices.filter((i) => i.status === 'Overdue').length,
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.customerName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        activeFilter === 'All' || inv.status === activeFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invoices, searchTerm, activeFilter]);

  const handleOpenPayment = (invoice: Invoice) => {
    setPaymentInvoice(invoice);
    setPaymentAmount(invoice.amount.toString()); // default to remaining
  };

  const triggerToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleShareInvoice = (invoice: Invoice) => {
    const message = `Salam ${invoice.customerName}, invoice ${invoice.id} total is PKR ${invoice.amount.toLocaleString()} and due date is ${invoice.dueDate}. Please clear payment on time. Shukriya.`;
    if (invoice.customerId === 'walk-in') {
      navigator.clipboard?.writeText(message);
      triggerToast('Invoice message copied for walk-in customer.', 'success');
      return;
    }
    sendWhatsAppReminder(invoice.customerId, message, 'WhatsApp');
    triggerToast(`Invoice ${invoice.id} added to ${invoice.customerName}'s WhatsApp timeline.`, 'success');
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentInvoice && paymentAmount) {
      recordPayment(paymentInvoice.customerId, parseFloat(paymentAmount));
      setPaymentInvoice(null);
      setPaymentAmount('');
      triggerToast(`Payment recorded for ${paymentInvoice.id}. Ledger updated.`, 'success');
    }
  };

  return (
    <div className="p-gutter space-y-6 max-w-[1600px] mx-auto w-full">
      {toast && (
        <div className="fixed top-4 right-4 z-[120] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold bg-white text-stone-900 border-stone-500/20">
          <Icon name={toast.type === 'error' ? 'cancel' : toast.type === 'info' ? 'info' : 'check_circle'} className={toast.type === 'error' ? 'text-error' : 'text-stone-500'} size={16} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">Invoices</h2>
          <p className="text-body-md text-on-surface-variant text-sm mt-1">
            Track customer bills, cash receipts, and pending credit balances.
          </p>
        </div>
        <Link
          href="/new-invoice"
          className="px-6 py-2.5 bg-primary text-on-primary font-bold text-body-md rounded-lg shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 self-start md:self-auto text-sm"
        >
          <Icon name="add_notes" size={18} />
          Create Invoice
        </Link>
      </div>

      {/* Metrics Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Total Bills</p>
          <h3 className="text-headline-lg font-bold text-on-surface">{totalCount}</h3>
          <p className="text-[10px] text-primary font-bold mt-2">Billed transactions</p>
        </div>
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Paid Invoices</p>
          <h3 className="text-headline-lg font-bold text-primary">{paidCount}</h3>
          <p className="text-[10px] text-primary font-bold mt-2">Cash cleared ledgers</p>
        </div>
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Unpaid Bills</p>
          <h3 className="text-headline-lg font-bold text-tertiary">{unpaidCount}</h3>
          <p className="text-[10px] text-tertiary font-bold mt-2">Pending payment collections</p>
        </div>
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Overdue Notices</p>
          <h3 className="text-headline-lg font-bold text-error">{overdueCount}</h3>
          <p className="text-[10px] text-error font-bold mt-2">Exceeded credit days limit</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm">
        {/* Status filters */}
        <div className="flex bg-surface-container p-1 rounded-lg w-full md:w-auto overflow-x-auto select-none scrollbar-hide">
          {(['All', 'Paid', 'Unpaid', 'Partial', 'Overdue'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-md font-label-md transition-all text-xs whitespace-nowrap font-bold ${
                activeFilter === filter ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {filter}
              <span className={`ml-2 rounded px-1.5 py-0.5 text-[9px] ${
                activeFilter === filter ? 'bg-primary/10 text-primary' : 'bg-white/70 text-on-surface-variant'
              }`}>
                {filterCounts[filter]}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
          <input
            className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 outline-none text-body-md text-sm"
            placeholder="Search invoice # or customer..."
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Table area */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-surface-variant text-label-md text-on-surface-variant border-b border-outline-variant">
              <tr>
                <th className="px-md py-sm">Invoice ID</th>
                <th className="px-md py-sm">Customer</th>
                <th className="px-md py-sm">Billing Date</th>
                <th className="px-md py-sm">Grand Total</th>
                <th className="px-md py-sm">Type</th>
                <th className="px-md py-sm">Status</th>
                <th className="px-md py-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-md py-8 text-center text-on-surface-variant italic">
                    No invoices match search/filter requirements.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-container transition-colors">
                    <td className="px-md py-md font-bold font-numeric-data text-primary">{inv.id}</td>
                    <td className="px-md py-md">
                      <Link href={`/customers/${inv.customerId}`} className="font-bold hover:underline">
                        {inv.customerName}
                      </Link>
                    </td>
                    <td className="px-md py-md font-numeric-data text-on-surface-variant">{inv.date}</td>
                    <td className="px-md py-md font-numeric-data font-bold">PKR {inv.amount.toLocaleString()}</td>
                    <td className="px-md py-md">
                      <span className="inline-block px-2 py-0.5 bg-surface-container text-on-surface-variant text-[11px] rounded font-medium">
                        {inv.paymentType}
                      </span>
                    </td>
                    <td className="px-md py-md">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          inv.status === 'Paid'
                            ? 'bg-primary-fixed text-on-primary-fixed-variant'
                            : inv.status === 'Overdue'
                            ? 'bg-error-container text-on-error-container'
                            : inv.status === 'Partial'
                            ? 'bg-secondary-container text-on-secondary-container'
                            : 'bg-surface-variant text-on-surface-variant'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-md py-md text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setPreviewInvoice(inv)}
                          className="p-1.5 rounded-lg border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                          title="Preview"
                        >
                          <Icon name="visibility" size={18} />
                        </button>
                        <button
                          onClick={() => printInvoice(inv)}
                          className="p-1.5 rounded-lg border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                          title="Print / Save PDF"
                        >
                          <Icon name="print" size={18} />
                        </button>
                        <button
                          onClick={() => downloadInvoiceFile(inv)}
                          className="p-1.5 rounded-lg border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                          title="Download"
                        >
                          <Icon name="download" size={18} />
                        </button>
                        <button
                          onClick={() => handleShareInvoice(inv)}
                          className="p-1.5 rounded-lg border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                          title="Share WhatsApp"
                        >
                          <Icon name="share" size={18} />
                        </button>
                        <Link
                          href={`/ledger?customer=${inv.customerId}`}
                          className="p-1.5 rounded-lg border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                          title="Open Ledger"
                        >
                          <Icon name="menu_book" size={18} />
                        </Link>
                        <Link
                          href={`/connect?customer=${inv.customerId}`}
                          className="p-1.5 rounded-lg border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                          title="Follow Up"
                        >
                          <Icon name="forum" size={18} />
                        </Link>

                        {(inv.status === 'Unpaid' || inv.status === 'Overdue' || inv.status === 'Partial') && (
                          <button
                            onClick={() => handleOpenPayment(inv)}
                            className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md hover:opacity-90 transition-all text-xs font-bold"
                          >
                            Record Payment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contextual Info Card */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm flex flex-col md:flex-row gap-6 justify-between items-center bg-gradient-to-r from-surface-container-low to-white">
        <div className="flex gap-4 items-start">
          <div className="w-12 h-12 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
            <Icon name="receipt_long" size={24} />
          </div>
          <div>
            <h4 className="font-headline-sm text-label-md text-on-surface font-bold text-sm">Automated Billing Integrations</h4>
            <p className="text-xs text-on-surface-variant mt-1">
              Connect invoice statuses directly with Pakistani digital payment pathways (Easypaisa, JazzCash, HBL Netbanking).
            </p>
          </div>
        </div>
        <button
          onClick={() => triggerToast('Payment settings will connect to business profile in the next setup step.', 'info')}
          className="px-4 py-2 border border-primary text-primary font-bold text-xs rounded-lg hover:bg-primary-container hover:text-on-primary-container transition-all whitespace-nowrap"
        >
          Configure Payments
        </button>
      </section>

      {/* Record Payment Modal */}
      {paymentInvoice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl w-full max-w-112 overflow-hidden shadow-xl border border-outline-variant">
            <form onSubmit={handleSavePayment} className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-headline-sm font-bold text-primary text-base">Clear Invoice Payment</h3>
                <button
                  type="button"
                  onClick={() => setPaymentInvoice(null)}
                  className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              <p className="text-xs text-on-surface-variant">
                Confirm payment receipt for Invoice <strong>#{paymentInvoice.id}</strong>. Customer: <strong>{paymentInvoice.customerName}</strong>. Total value: <strong>PKR {paymentInvoice.amount.toLocaleString()}</strong>.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant block">Repayment Amount (PKR)</label>
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
                  onClick={() => setPaymentInvoice(null)}
                  className="px-4 py-2 border border-outline-variant text-on-surface-variant rounded-lg hover:bg-surface-container transition-all text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 active:scale-95 transition-all text-xs font-bold"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewInvoice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-xl border border-outline-variant flex flex-col">
            <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between gap-3">
              <div>
                <h3 className="font-headline-sm font-bold text-primary text-base">Invoice Preview</h3>
                <p className="text-xs text-on-surface-variant">{previewInvoice.id} · {previewInvoice.customerName}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewInvoice(null)}
                className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="overflow-y-auto bg-surface-container-low p-4 custom-scrollbar">
              <div className="bg-white border border-outline-variant rounded-xl shadow-md p-6 space-y-6 max-w-3xl mx-auto">
                <div className="flex justify-between items-start border-b border-outline-variant pb-4">
                  <div>
                    <h3 className="font-mono font-bold text-primary text-base tracking-wider">PSO SME</h3>
                    <p className="text-[10px] text-on-surface-variant">Retailer · Clifton, Karachi</p>
                    <p className="text-[9px] text-outline">Phone: +92 300 0000000</p>
                  </div>
                  <div className="text-right">
                    <h4 className="font-bold text-tertiary text-sm">INVOICE</h4>
                    <p className="text-[10px] text-on-surface-variant font-mono-numbers font-bold">#{previewInvoice.id}</p>
                    <p className="text-[9px] text-outline mt-1 font-mono-numbers">Date: {previewInvoice.date}</p>
                    <p className="text-[9px] text-outline font-mono-numbers">Due Date: {previewInvoice.dueDate}</p>
                  </div>
                </div>

                <div className="text-[11px]">
                  <p className="font-bold text-on-surface-variant uppercase tracking-wider text-[9px] mb-1">Bill To:</p>
                  <p className="font-bold text-on-surface text-xs">{previewInvoice.customerName}</p>
                  <p className="text-on-surface-variant">Payment Type: {previewInvoice.paymentType}</p>
                </div>

                <div className="border border-outline-variant rounded-lg overflow-hidden">
                  <table className="w-full text-[10px] text-left border-collapse">
                    <thead className="bg-surface-container text-on-surface-variant font-bold border-b border-outline-variant">
                      <tr>
                        <th className="p-2">Item</th>
                        <th className="p-2 text-center">Qty</th>
                        <th className="p-2 text-right">Price</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {previewInvoice.items.map((item) => (
                        <tr key={`${previewInvoice.id}-${item.name}-${item.quantity}`}>
                          <td className="p-2 font-bold">{item.name}</td>
                          <td className="p-2 text-center font-mono-numbers">{item.quantity} {item.unit}</td>
                          <td className="p-2 text-right font-mono-numbers">PKR {item.price.toLocaleString()}</td>
                          <td className="p-2 text-right font-bold font-mono-numbers">PKR {item.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-1.5 text-xs font-mono-numbers border-t border-outline-variant pt-4">
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Subtotal:</span>
                    <span>PKR {previewInvoice.items.reduce((sum, item) => sum + item.total, 0).toLocaleString()}</span>
                  </div>
                  {previewInvoice.discount > 0 && (
                    <div className="flex justify-between text-error">
                      <span>Discount:</span>
                      <span>(-) PKR {previewInvoice.discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-on-surface border-t border-outline-variant/50 pt-2 text-sm">
                    <span>Grand Total:</span>
                    <span className="text-primary font-bold">PKR {previewInvoice.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-outline-variant flex flex-col sm:flex-row justify-between gap-3 bg-white">
              <div className="flex gap-2">
                <Link
                  href={`/customers/${previewInvoice.customerId}`}
                  className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-outline-variant text-xs font-bold text-on-surface-variant hover:bg-muted transition-colors"
                >
                  Customer
                </Link>
                <Link
                  href={`/ledger?customer=${previewInvoice.customerId}`}
                  className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-outline-variant text-xs font-bold text-on-surface-variant hover:bg-muted transition-colors"
                >
                  Ledger
                </Link>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => downloadInvoiceFile(previewInvoice)}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg border border-outline-variant text-xs font-bold text-foreground hover:bg-muted transition-colors"
                >
                  <Icon name="download" size={16} />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => printInvoice(previewInvoice)}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/85 active:scale-[0.98] transition-all"
                >
                  <Icon name="print" size={16} />
                  Print / Save PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
