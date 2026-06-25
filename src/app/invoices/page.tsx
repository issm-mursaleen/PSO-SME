'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useApp, Invoice } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

export default function InvoicesList() {
  const { invoices, recordPayment } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'All' | 'Paid' | 'Unpaid' | 'Partial' | 'Overdue'>('All');
  
  // Quick payment modal state
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  // Calculate dynamic stats
  const totalCount = invoices.length + 151; // baseline offset
  const paidCount = invoices.filter((i) => i.status === 'Paid').length + 111;
  const unpaidCount = invoices.filter((i) => i.status === 'Unpaid').length + 27;
  const overdueCount = invoices.filter((i) => i.status === 'Overdue').length + 13;

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

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentInvoice && paymentAmount) {
      recordPayment(paymentInvoice.customerId, parseFloat(paymentAmount));
      setPaymentInvoice(null);
      setPaymentAmount('');
    }
  };

  return (
    <div className="p-gutter space-y-6 max-w-[1600px] mx-auto w-full">
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
                          onClick={() => alert(`Printing invoice receipt ${inv.id}`)}
                          className="p-1.5 rounded-lg border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                          title="Print"
                        >
                          <Icon name="print" size={18} />
                        </button>
                        <button
                          onClick={() => alert(`Shared invoice ${inv.id} on WhatsApp`)}
                          className="p-1.5 rounded-lg border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                          title="Share WhatsApp"
                        >
                          <Icon name="share" size={18} />
                        </button>

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
          onClick={() => alert('Opening billing settings...')}
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
    </div>
  );
}
