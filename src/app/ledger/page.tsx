'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useApp, Customer } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

export default function UdharLedger() {
  const { customers, recordPayment, transactions } = useApp();

  // Selected customer for payment drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerCustomerId, setDrawerCustomerId] = useState('');
  const [repaymentAmount, setRepaymentAmount] = useState('');

  // Filter out customers who owe money
  const creditCustomers = useMemo(() => {
    return customers.filter((c) => c.balance > 0);
  }, [customers]);

  // Calculations
  const totalOutstanding = useMemo(() => {
    return customers.reduce((sum, c) => sum + c.balance, 0);
  }, [customers]);

  const activeDefaulters = creditCustomers.length;

  const avgOverdue = useMemo(() => {
    const overdueC = creditCustomers.filter((c) => c.lastVisitDays > 7);
    if (overdueC.length === 0) return 0;
    const sum = overdueC.reduce((s, c) => s + c.lastVisitDays, 0);
    return Math.round(sum / overdueC.length);
  }, [creditCustomers]);

  // Selected customer in drawer details
  const selectedCustomerInfo = useMemo(() => {
    return customers.find((c) => c.id === drawerCustomerId) || null;
  }, [customers, drawerCustomerId]);

  const handleOpenDrawerForCustomer = (customerId: string) => {
    setDrawerCustomerId(customerId);
    setIsDrawerOpen(true);
    // Autofill outstanding amount
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      setRepaymentAmount(customer.balance.toString());
    }
  };

  const handleOpenNewDrawer = () => {
    if (creditCustomers.length > 0) {
      setDrawerCustomerId(creditCustomers[0].id);
      setRepaymentAmount(creditCustomers[0].balance.toString());
    } else {
      setDrawerCustomerId('');
      setRepaymentAmount('');
    }
    setIsDrawerOpen(true);
  };

  const handleRecordRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (drawerCustomerId && repaymentAmount) {
      recordPayment(drawerCustomerId, parseFloat(repaymentAmount));
      setIsDrawerOpen(false);
      setRepaymentAmount('');
    }
  };

  const todayStr = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="p-gutter space-y-6 max-w-[1600px] mx-auto w-full relative">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">Udhar Ledger</h2>
          <p className="text-body-md text-on-surface-variant text-sm mt-1">
            Centralized credit control dashboard and outstanding collection management.
          </p>
        </div>
        <button
          onClick={handleOpenNewDrawer}
          className="px-6 py-2.5 bg-primary text-on-primary font-bold text-body-md rounded-lg shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 self-start md:self-auto text-sm"
        >
          <Icon name="payments" size={18} />
          Record Repayment
        </button>
      </div>

      {/* Summary Metrics Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Total Outstanding</p>
          <h3 className="text-headline-lg font-bold text-tertiary text-2xl">PKR {totalOutstanding.toLocaleString()}</h3>
          <p className="text-[10px] text-on-surface-variant mt-2 font-bold">Sum of active customer credits</p>
        </div>
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Active Defaulters</p>
          <h3 className="text-xl font-semibold text-foreground tracking-tight">{activeDefaulters} accounts</h3>
          <p className="text-[10px] text-tertiary mt-2 font-bold">Requires credit recovery collection</p>
        </div>
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Recovery Rate</p>
          <h3 className="text-headline-lg font-bold text-primary text-2xl">74.2%</h3>
          <p className="text-[10px] text-primary mt-2 font-bold">+2.4% progress this month</p>
        </div>
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Avg Overdue Age</p>
          <h3 className="text-xl font-semibold text-foreground tracking-tight">{avgOverdue} days</h3>
          <p className="text-[10px] text-on-surface-variant mt-2 font-bold">Time since last repayment activity</p>
        </div>
      </div>

      {/* Table & Filters Section */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
          <h3 className="font-headline-sm text-headline-sm font-bold text-sm">Credit Balance Ledgers</h3>
          <span className="text-xs text-on-surface-variant font-bold">Showing {creditCustomers.length} defaulters</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-surface-variant text-label-md text-on-surface-variant border-b border-outline-variant">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Area</th>
                <th className="px-5 py-3">Credit Limit</th>
                <th className="px-5 py-3">Outstanding Credit</th>
                <th className="px-5 py-3">Last Active Payment</th>
                <th className="px-5 py-3">Credit Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {creditCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-on-surface-variant italic">
                    Great! All customer ledgers are currently settled. No credit defaults.
                  </td>
                </tr>
              ) : (
                creditCustomers.map((c) => {
                  const percentOfLimit = Math.round((c.balance / c.creditLimit) * 100);

                  // Find last transaction for customer
                  const lastTx = transactions.find((t) => t.customerId === c.id && t.type === 'Repayment');
                  const lastPaidDate = lastTx ? lastTx.date.split(' ')[0] : 'N/A';

                  return (
                    <tr key={c.id} className="hover:bg-surface-container transition-colors">
                      <td className="px-5 py-3">
                        <div>
                          <Link href={`/customers/${c.id}`} className="font-bold text-primary hover:underline block">
                            {c.name}
                          </Link>
                          <span className="text-xs text-on-surface-variant font-numeric-data">{c.phone}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-on-surface-variant">{c.neighborhood}</td>
                      <td className="px-5 py-3 font-numeric-data">PKR {c.creditLimit.toLocaleString()}</td>
                      <td className="px-5 py-3 font-numeric-data font-bold text-tertiary">
                        PKR {c.balance.toLocaleString()}
                        <span className="block text-[10px] text-outline font-medium font-sans">
                          {percentOfLimit}% limit reached
                        </span>
                      </td>
                      <td className="px-5 py-3 text-on-surface-variant font-numeric-data">{lastPaidDate}</td>
                      <td className="px-5 py-3">
                        {c.lastVisitDays > 10 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-error-container text-on-error-container">
                            {c.lastVisitDays} Days Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-secondary-container text-on-secondary-container">
                            Due in {10 - c.lastVisitDays} Days
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenDrawerForCustomer(c.id)}
                            className="px-3 py-1.5 bg-primary text-on-primary font-label-md rounded-lg hover:opacity-90 transition-all text-xs font-bold"
                          >
                            Record Payment
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right-side Drawer: Record Payment */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-inverse-surface/60 backdrop-blur-sm">
          {/* Backdrop click clears */}
          <div className="absolute inset-0" onClick={() => setIsDrawerOpen(false)}></div>
          
          <div className="relative w-full max-w-112 bg-white h-screen shadow-2xl border-l border-outline-variant flex flex-col z-10 transition-transform duration-300 transform translate-x-0">
            {/* Drawer Header */}
            <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <div className="flex items-center gap-2">
                <Icon name="payments" className="text-primary" size={18} />
                <h3 className="font-headline-sm text-headline-sm font-bold text-primary">Record Repayment</h3>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="text-muted-foreground hover:bg-surface-container-high p-1.5 rounded-full transition-colors"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <form onSubmit={handleRecordRepayment} className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
              
              {/* Customer Selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant block">Select Defaulter Customer</label>
                <select
                  required
                  className="w-full border border-outline-variant rounded-lg p-3 text-sm bg-white outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  value={drawerCustomerId}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setDrawerCustomerId(cid);
                    const cust = customers.find((c) => c.id === cid);
                    if (cust) setRepaymentAmount(cust.balance.toString());
                  }}
                >
                  <option value="" disabled>-- Choose Defaulter --</option>
                  {creditCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Balance: PKR {c.balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Balance Snapshot */}
              {selectedCustomerInfo && (
                <div className="p-4 bg-surface-container-low border border-outline-variant rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant font-bold">Outstanding credit:</span>
                    <span className="font-bold text-tertiary font-numeric-data">PKR {selectedCustomerInfo.balance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant font-bold">Max credit limit:</span>
                    <span className="font-bold font-numeric-data">PKR {selectedCustomerInfo.creditLimit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant font-bold">Defaulter age:</span>
                    <span className="font-bold text-error font-numeric-data">{selectedCustomerInfo.lastVisitDays} days overdue</span>
                  </div>
                </div>
              )}

              {/* Input Repayment Amount */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant block">Amount Received (PKR)</label>
                <input
                  required
                  type="number"
                  min="1"
                  max={selectedCustomerInfo ? selectedCustomerInfo.balance : undefined}
                  className="w-full border border-outline-variant rounded-lg p-3 text-sm font-numeric-data outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="e.g. 15000"
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value)}
                />
              </div>

              {/* Payment Date */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant block">Repayment Date</label>
                <div className="relative">
                  <Icon name="schedule" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
                  <input
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-3 text-xs outline-none text-on-surface-variant"
                    readOnly
                    type="text"
                    value={todayStr}
                  />
                </div>
              </div>

              {/* Repayment Card Preview */}
              {selectedCustomerInfo && repaymentAmount && (
                <div className="border border-dashed border-outline-variant p-4 rounded-xl space-y-3 bg-primary-fixed/5">
                  <p className="text-[10px] text-primary uppercase font-bold tracking-wider">Repayment Receipt Preview</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Customer:</span>
                      <span className="font-bold text-on-surface">{selectedCustomerInfo.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Repaid Value:</span>
                      <span className="font-bold text-primary font-numeric-data">PKR {parseFloat(repaymentAmount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t border-outline-variant/50 pt-1.5 mt-1.5 font-bold">
                      <span className="text-on-surface-variant">Remaining Debt:</span>
                      <span className="font-numeric-data">
                        PKR {Math.max(0, selectedCustomerInfo.balance - parseFloat(repaymentAmount)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Drawer Footer Actions */}
              <div className="flex gap-3 pt-6 border-t border-outline-variant mt-auto">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="flex-1 py-3 border border-outline-variant text-on-surface-variant rounded-lg hover:bg-surface-container transition-all text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-primary text-on-primary rounded-lg hover:opacity-90 active:scale-95 transition-all text-xs font-bold"
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
