'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp, Customer } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';
import { MetricCard } from '@/components/ui';

function CustomersListContent() {
  const { customers } = useApp();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') || '';

  // Filter and Search States
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [selectedArea, setSelectedArea] = useState('All Areas');
  const [selectedType, setSelectedType] = useState('All Types');
  const [sortBy, setSortBy] = useState('balance-desc');

  // Stats calculation
  const totalCustomersBase = 2842;
  const newCustomersCount = customers.filter(
    (c) => c.id !== 'cust-riaz' && c.id !== 'cust-sana' && c.id !== 'cust-iqbal' && c.id !== 'cust-malik'
  ).length;

  const totalCustomers = totalCustomersBase + newCustomersCount;
  const activeCreditsCount = customers.filter((c) => c.balance > 0).length + 408; // baseline offset
  const overdueCount = customers.filter((c) => c.balance > 10000 && c.lastVisitDays > 10).length + 45;

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers
      .filter((c) => {
        const matchesSearch =
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.phone.includes(searchTerm) ||
          c.neighborhood.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesArea =
          selectedArea === 'All Areas' ||
          c.neighborhood.toLowerCase().includes(selectedArea.toLowerCase());

        const matchesType =
          selectedType === 'All Types' ||
          c.type.toLowerCase() === selectedType.toLowerCase();

        return matchesSearch && matchesArea && matchesType;
      })
      .sort((a, b) => {
        if (sortBy === 'balance-desc') {
          return b.balance - a.balance;
        } else if (sortBy === 'balance-asc') {
          return a.balance - b.balance;
        } else if (sortBy === 'name-asc') {
          return a.name.localeCompare(b.name);
        } else if (sortBy === 'health-asc') {
          return a.healthScore - b.healthScore;
        }
        return 0;
      });
  }, [customers, searchTerm, selectedArea, selectedType, sortBy]);

  return (
    <div className="p-gutter space-y-6 max-w-[1600px] mx-auto w-full">
      {/* Content Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Customers</h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
            {totalCustomers.toLocaleString()} verified accounts &amp; credit ledgers
          </p>
        </div>
        <Link
          href="/add-customer"
          className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all self-start md:self-auto"
        >
          <Icon name="person_add" size={16} />
          Add Customer
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Customers" value={totalCustomers.toLocaleString()} hint="Active business accounts" />
        <MetricCard label="Active Credits" value={activeCreditsCount} hint="Accounts with debit balance" />
        <MetricCard label="Overdue Ledgers" value={overdueCount} hint="Require immediate outreach" tone="warning" />
        <MetricCard label="Defaulters Risk" value="1.4%" hint="Within safe threshold (< 3.0%)" tone="danger" />
      </div>

      {/* Filters Bar */}
      <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
          <input
            className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 outline-none text-body-md"
            placeholder="Search by name, phone, or area..."
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap gap-3 w-full md:w-auto justify-end">
          <select
            className="bg-white border border-outline-variant rounded-lg px-3 py-2 text-body-sm outline-none text-xs"
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
          >
            <option value="All Areas">All Areas</option>
            <option value="Clifton">Clifton</option>
            <option value="DHA">DHA</option>
            <option value="Saddar">Saddar</option>
            <option value="Gulshan">Gulshan-e-Iqbal</option>
          </select>

          <select
            className="bg-white border border-outline-variant rounded-lg px-3 py-2 text-body-sm outline-none text-xs"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="All Types">All Types</option>
            <option value="Household">Household</option>
            <option value="Retailer">Retailer</option>
            <option value="Hotel / Restaurant">Hotel / Restaurant</option>
            <option value="Wholesaler">Wholesaler</option>
            <option value="Corporate">Corporate</option>
          </select>

          <select
            className="bg-white border border-outline-variant rounded-lg px-3 py-2 text-body-sm outline-none text-xs"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="balance-desc">Balance: High to Low</option>
            <option value="balance-asc">Balance: Low to High</option>
            <option value="name-asc">Name: A to Z</option>
            <option value="health-asc">Risk: High to Low</option>
          </select>
        </div>
      </div>

      {/* Main Customers Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="bg-surface-variant text-label-md text-on-surface-variant border-b border-outline-variant">
              <tr>
                <th className="px-md py-sm">Customer Profile</th>
                <th className="px-md py-sm">Area &amp; Neighborhood</th>
                <th className="px-md py-sm">Category</th>
                <th className="px-md py-sm">Credit Limit</th>
                <th className="px-md py-sm">Outstanding Balance</th>
                <th className="px-md py-sm">Credit Health</th>
                <th className="px-md py-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-md py-8 text-center text-on-surface-variant italic">
                    No customers found matching the search/filter criteria.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const hasDeficit = customer.balance > 0;
                  const percentOfLimit = Math.round((customer.balance / customer.creditLimit) * 100);

                  return (
                    <tr key={customer.id} className="hover:bg-surface-container transition-colors group">
                      {/* Customer Name */}
                      <td className="px-md py-md">
                        <div>
                          <Link href={`/customers/${customer.id}`} className="font-bold text-primary hover:underline block">
                            {customer.name}
                          </Link>
                          <span className="text-xs text-on-surface-variant font-numeric-data">{customer.phone}</span>
                        </div>
                      </td>

                      {/* Area */}
                      <td className="px-md py-md text-on-surface-variant">{customer.neighborhood}</td>

                      {/* Category */}
                      <td className="px-md py-md">
                        <span className="inline-block px-2 py-0.5 bg-surface-container text-on-surface-variant text-[11px] rounded font-medium">
                          {customer.type}
                        </span>
                      </td>

                      {/* Credit Limit */}
                      <td className="px-md py-md font-numeric-data">PKR {customer.creditLimit.toLocaleString()}</td>

                      {/* Outstanding Balance */}
                      <td className={`px-md py-md font-numeric-data font-bold ${hasDeficit ? 'text-tertiary' : 'text-primary'}`}>
                        PKR {customer.balance.toLocaleString()}
                        {hasDeficit && (
                          <span className="block text-[10px] text-outline font-medium font-sans">
                            {percentOfLimit}% of limit
                          </span>
                        )}
                      </td>

                      {/* Credit Health */}
                      <td className="px-md py-md">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-surface-container rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                customer.healthScore > 80
                                  ? 'bg-primary'
                                  : customer.healthScore > 60
                                  ? 'bg-secondary'
                                  : 'bg-error'
                              }`}
                              style={{ width: `${customer.healthScore}%` }}
                            ></div>
                          </div>
                          <span
                            className={`text-xs font-bold ${
                              customer.healthScore > 80
                                ? 'text-primary'
                                : customer.healthScore > 60
                                ? 'text-secondary'
                                : 'text-error'
                            }`}
                          >
                            {customer.healthScore}%
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-md py-md text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href="/chat"
                            className="p-1.5 rounded-lg border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                            title="WhatsApp Message"
                          >
                            <Icon name="chat" size={18} />
                          </Link>
                          <Link
                            href={`/customers/${customer.id}`}
                            className="px-3 py-1.5 border border-primary text-primary font-label-md rounded-lg hover:bg-primary-container hover:text-on-primary-container transition-all text-xs font-bold"
                          >
                            View Ledger
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-low flex justify-between items-center text-xs text-on-surface-variant font-bold">
          <span>Showing {filteredCustomers.length} of {filteredCustomers.length} profiles</span>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 border border-outline-variant rounded bg-white hover:bg-surface-container disabled:opacity-50" disabled>
              Previous
            </button>
            <button className="px-3 py-1.5 border border-outline-variant rounded bg-white hover:bg-surface-container disabled:opacity-50" disabled>
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Contextual Insights Section */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="font-headline-sm text-label-md text-primary uppercase tracking-wider font-bold text-xs">Ledger Insights &amp; Alerts</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/customers/cust-riaz?tab=recommendations"
            className="group flex gap-3 items-start p-3 bg-error-container/20 border border-error/20 rounded-lg hover:bg-error-container/30 hover:border-error/40 transition-all"
          >
            <Icon name="warning" className="text-error" size={18} />
            <div className="min-w-0">
              <p className="text-xs font-bold text-on-error-container flex items-center gap-1">
                Defaulter Risk Alert
                <Icon name="chevron_right" size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Clifton area outstanding balance has grown by 14% this week. Riaz Ahmed exceeds safe limit.
              </p>
            </div>
          </Link>
          <Link
            href="/customers/cust-sana?tab=recommendations"
            className="group flex gap-3 items-start p-3 bg-primary-container/20 border border-primary/20 rounded-lg hover:bg-primary-container/30 hover:border-primary/40 transition-all"
          >
            <Icon name="lightbulb" className="text-primary" size={18} />
            <div className="min-w-0">
              <p className="text-xs font-bold text-on-primary-container flex items-center gap-1">
                Outreach Recommendation
                <Icon name="chevron_right" size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Sana Bibi has not purchased in 9 days. Usually visits every 4 days. Send her an active WhatsApp offer.
              </p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function CustomersList() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-xs text-on-surface-variant font-bold">Loading Customers workspace...</div>}>
      <CustomersListContent />
    </Suspense>
  );
}
