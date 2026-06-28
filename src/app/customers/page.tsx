'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';
import { MetricCard } from '@/components/ui';

function CustomersListContent() {
  const { customers, invoices } = useApp();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') || '';

  // Filter and Search States
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [selectedArea, setSelectedArea] = useState('All Areas');
  const [selectedType, setSelectedType] = useState('All Types');
  const [sortBy, setSortBy] = useState('sales-desc');

  // Lifetime sales per customer, computed from real invoices.
  const lifetimeById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of invoices) {
      map[inv.customerId] = (map[inv.customerId] ?? 0) + inv.amount;
    }
    return map;
  }, [invoices]);
  const lifetimeOf = (id: string) => lifetimeById[id] ?? 0;

  // Stats — real counts from the live customer roster, no padding.
  const totalCustomers = customers.length;
  const activeCount = customers.filter((c) => c.status === 'Active').length;
  const INACTIVE_DAYS = 10;
  const needsOutreachCount = customers.filter((c) => c.lastVisitDays >= INACTIVE_DAYS).length;
  const topSpenderValue = customers.reduce((max, c) => Math.max(max, lifetimeOf(c.id)), 0);

  // Real data-derived insights: the highest-value customer who has gone quiet,
  // and the most inactive customer overall.
  const topValueAtRisk = useMemo(
    () =>
      customers
        .filter((c) => c.lastVisitDays >= INACTIVE_DAYS && lifetimeOf(c.id) > 0)
        .sort((a, b) => lifetimeOf(b.id) - lifetimeOf(a.id))[0] ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, lifetimeById],
  );
  const topInactiveCustomer = useMemo(
    () => customers.slice().sort((a, b) => b.lastVisitDays - a.lastVisitDays)[0] ?? null,
    [customers],
  );

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
        if (sortBy === 'sales-desc') {
          return lifetimeOf(b.id) - lifetimeOf(a.id);
        } else if (sortBy === 'sales-asc') {
          return lifetimeOf(a.id) - lifetimeOf(b.id);
        } else if (sortBy === 'name-asc') {
          return a.name.localeCompare(b.name);
        } else if (sortBy === 'recency-desc') {
          return b.lastVisitDays - a.lastVisitDays;
        }
        return 0;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, searchTerm, selectedArea, selectedType, sortBy, lifetimeById]);

  return (
    <div className="p-gutter space-y-6 max-w-[1600px] mx-auto w-full">
      {/* Content Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Customers</h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
            {totalCustomers.toLocaleString()} customer profiles
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
        <MetricCard label="Total Customers" value={totalCustomers.toLocaleString()} hint="Customer profiles" />
        <MetricCard label="Active" value={activeCount} hint="Active status accounts" />
        <MetricCard label="Needs Outreach" value={needsOutreachCount} hint={`No visit in ${INACTIVE_DAYS}+ days`} tone="warning" />
        <MetricCard label="Top Spender" value={`PKR ${topSpenderValue.toLocaleString()}`} hint="Highest lifetime sales" tone="success" />
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
            <option value="sales-desc">Lifetime Sales: High to Low</option>
            <option value="sales-asc">Lifetime Sales: Low to High</option>
            <option value="name-asc">Name: A to Z</option>
            <option value="recency-desc">Least Recent Visit</option>
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
                <th className="px-md py-sm">Lifetime Sales</th>
                <th className="px-md py-sm">Last Visit</th>
                <th className="px-md py-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-md py-8 text-center text-on-surface-variant italic">
                    No customers found matching the search/filter criteria.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const lifetime = lifetimeOf(customer.id);
                  const isInactive = customer.lastVisitDays >= INACTIVE_DAYS;

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

                      {/* Lifetime Sales */}
                      <td className="px-md py-md font-numeric-data font-bold text-primary">PKR {lifetime.toLocaleString()}</td>

                      {/* Last Visit */}
                      <td className={`px-md py-md font-numeric-data font-bold ${isInactive ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                        {customer.lastVisitDays}d ago
                        {isInactive && (
                          <span className="block text-[10px] text-outline font-medium font-sans">
                            needs outreach
                          </span>
                        )}
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
                            View Profile
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

      {/* Contextual Insights Section — derived live from the customer roster */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="font-headline-sm text-label-md text-primary uppercase tracking-wider font-bold text-xs">Customer Insights &amp; Outreach</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topValueAtRisk ? (
            <Link
              href={`/customers/${topValueAtRisk.id}`}
              className="group flex gap-3 items-start p-3 bg-error-container/20 border border-error/20 rounded-lg hover:bg-error-container/30 hover:border-error/40 transition-all"
            >
              <Icon name="warning" className="text-error" size={18} />
              <div className="min-w-0">
                <p className="text-xs font-bold text-on-error-container flex items-center gap-1">
                  Valuable Customer Going Quiet
                  <Icon name="chevron_right" size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {topValueAtRisk.name} ({topValueAtRisk.neighborhood}) — PKR{' '}
                  {lifetimeOf(topValueAtRisk.id).toLocaleString()} lifetime sales but no visit in{' '}
                  {topValueAtRisk.lastVisitDays} days. Re-engage soon.
                </p>
              </div>
            </Link>
          ) : (
            <div className="flex gap-3 items-start p-3 bg-surface-container/40 border border-outline-variant rounded-lg">
              <Icon name="check_circle" className="text-on-surface-variant" size={18} />
              <p className="text-xs text-on-surface-variant mt-0.5">All high-value customers have visited recently.</p>
            </div>
          )}
          {topInactiveCustomer ? (
            <Link
              href={`/customers/${topInactiveCustomer.id}`}
              className="group flex gap-3 items-start p-3 bg-primary-container/20 border border-primary/20 rounded-lg hover:bg-primary-container/30 hover:border-primary/40 transition-all"
            >
              <Icon name="lightbulb" className="text-primary" size={18} />
              <div className="min-w-0">
                <p className="text-xs font-bold text-on-primary-container flex items-center gap-1">
                  Outreach Recommendation
                  <Icon name="chevron_right" size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {topInactiveCustomer.name} hasn&apos;t visited in {topInactiveCustomer.lastVisitDays} days — send a
                  friendly check-in or offer.
                </p>
              </div>
            </Link>
          ) : (
            <div className="flex gap-3 items-start p-3 bg-surface-container/40 border border-outline-variant rounded-lg">
              <Icon name="check_circle" className="text-on-surface-variant" size={18} />
              <p className="text-xs text-on-surface-variant mt-0.5">No customers need outreach right now.</p>
            </div>
          )}
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
