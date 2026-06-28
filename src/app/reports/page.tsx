'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  FileText,
  PackageSearch,
  Users,
  Search,
  Filter,
  RefreshCcw,
  FileSpreadsheet,
  ArrowUpRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Badge, Card, MetricCard, Table, TBody, Td, Th, THead, TRow } from '@/components/ui';

const PRODUCT_BASELINE = [
  { name: 'Dal Chana', units: 450, revenue: 58500, stock: 34 },
  { name: 'Sugar 1kg', units: 380, revenue: 51300, stock: 22 },
  { name: 'Basmati Rice 25kg', units: 290, revenue: 870000, stock: 8 },
  { name: 'Nestle Milkpak', units: 180, revenue: 39600, stock: 6 },
  { name: 'Cooking Oil 5L', units: 140, revenue: 350000, stock: 4 },
  { name: 'Tapal Danedar', units: 96, revenue: 52800, stock: 3 },
];

function money(value: number) {
  return `PKR ${value.toLocaleString()}`;
}

export default function ReportsPage() {
  const { customers, invoices, transactions } = useApp();

  // Active tab state: 'sales' | 'customers' | 'products'
  const [activeTab, setActiveTab] = useState<'sales' | 'customers' | 'products'>('sales');

  // --- Filter States ---
  // Sales Tab filters
  const [salesSearch, setSalesSearch] = useState('');
  const [salesPaymentType, setSalesPaymentType] = useState('All');
  const [salesStatus, setSalesStatus] = useState('All');

  // Customers Tab filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerBalanceStatus, setCustomerBalanceStatus] = useState('All');
  const [customerStatus, setCustomerStatus] = useState('All');

  // Products Tab filters
  const [productSearch, setProductSearch] = useState('');
  const [productStockLevel, setProductStockLevel] = useState('All');

  // --- Dynamic Base Stats for Metric Cards ---
  const totalSales = useMemo(() => {
    // Incorporate dynamic invoice amounts
    return invoices.reduce((sum, inv) => sum + inv.amount, 0) + 46850;
  }, [invoices]);

  const totalOutstanding = useMemo(() => {
    return customers.reduce((sum, customer) => sum + customer.balance, 0);
  }, [customers]);

  const recoveredAmount = useMemo(() => {
    return transactions
      .filter((transaction) => transaction.type === 'Repayment')
      .reduce((sum, transaction) => sum + transaction.amount, 0) + 8000;
  }, [transactions]);

  const lowStockCount = useMemo(() => {
    return PRODUCT_BASELINE.filter((product) => product.stock <= 8).length;
  }, []);

  // --- Filter logic for Invoices ---
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.id.toLowerCase().includes(salesSearch.toLowerCase()) ||
        inv.customerName.toLowerCase().includes(salesSearch.toLowerCase());
      const matchesPaymentType = salesPaymentType === 'All' || inv.paymentType === salesPaymentType;
      const matchesStatus = salesStatus === 'All' || inv.status === salesStatus;
      return matchesSearch && matchesPaymentType && matchesStatus;
    });
  }, [invoices, salesSearch, salesPaymentType, salesStatus]);

  // --- Filter logic for Customers ---
  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      const matchesSearch =
        cust.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        cust.neighborhood.toLowerCase().includes(customerSearch.toLowerCase()) ||
        cust.phone.includes(customerSearch);
      const matchesBalance =
        customerBalanceStatus === 'All' ||
        (customerBalanceStatus === 'Has Balance' ? cust.balance > 0 : cust.balance === 0);
      const matchesStatus = customerStatus === 'All' || cust.status === customerStatus;
      return matchesSearch && matchesBalance && matchesStatus;
    });
  }, [customers, customerSearch, customerBalanceStatus, customerStatus]);

  // --- Filter logic for Products ---
  const filteredProducts = useMemo(() => {
    return PRODUCT_BASELINE.filter((prod) => {
      const matchesSearch = prod.name.toLowerCase().includes(productSearch.toLowerCase());
      const matchesStock =
        productStockLevel === 'All' ||
        (productStockLevel === 'Low Stock' ? prod.stock <= 8 : prod.stock > 8);
      return matchesSearch && matchesStock;
    });
  }, [productSearch, productStockLevel]);

  // Reset all filters in the active view
  const handleResetFilters = () => {
    if (activeTab === 'sales') {
      setSalesSearch('');
      setSalesPaymentType('All');
      setSalesStatus('All');
    } else if (activeTab === 'customers') {
      setCustomerSearch('');
      setCustomerBalanceStatus('All');
      setCustomerStatus('All');
    } else {
      setProductSearch('');
      setProductStockLevel('All');
    }
  };

  // Check if any filter is active in the current tab
  const isFilterActive = useMemo(() => {
    if (activeTab === 'sales') {
      return salesSearch !== '' || salesPaymentType !== 'All' || salesStatus !== 'All';
    } else if (activeTab === 'customers') {
      return customerSearch !== '' || customerBalanceStatus !== 'All' || customerStatus !== 'All';
    } else {
      return productSearch !== '' || productStockLevel !== 'All';
    }
  }, [
    activeTab,
    salesSearch,
    salesPaymentType,
    salesStatus,
    customerSearch,
    customerBalanceStatus,
    customerStatus,
    productSearch,
    productStockLevel,
  ]);

  // Simulated CSV Export logic for tabular data
  const handleExport = () => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = 'report.csv';

    if (activeTab === 'sales') {
      headers = ['Invoice ID', 'Customer', 'Date', 'Payment Type', 'Status', 'Amount (PKR)'];
      rows = filteredInvoices.map((inv) => [
        inv.id,
        inv.customerName,
        inv.date,
        inv.paymentType,
        inv.status,
        inv.amount.toString(),
      ]);
      filename = `sales_report_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (activeTab === 'customers') {
      headers = ['Customer Name', 'Phone', 'Neighborhood', 'Health Score', 'Status', 'Owed Balance (Baqi)', 'Limit'];
      rows = filteredCustomers.map((cust) => [
        cust.name,
        cust.phone,
        cust.neighborhood,
        cust.healthScore.toString(),
        cust.status,
        cust.balance.toString(),
        cust.creditLimit.toString(),
      ]);
      filename = `customer_report_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      headers = ['Product Name', 'Units Sold', 'Total Revenue (PKR)', 'Current Stock', 'Stock Status'];
      rows = filteredProducts.map((p) => [
        p.name,
        p.units.toString(),
        p.revenue.toString(),
        p.stock.toString(),
        p.stock <= 8 ? 'Low Stock' : 'Healthy',
      ]);
      filename = `product_report_${new Date().toISOString().split('T')[0]}.csv`;
    }

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-gutter space-y-4 animate-fade-in">
      
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" />
            Reports Dashboard
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
            Query, filter, and export business performance spreadsheets
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/85 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
        >
          <Download className="size-3.5" />
          Export CSV
        </button>
      </div>

      {/* Overview Stat Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Total Sales (MTD)"
          value={money(totalSales)}
          hint="All invoiced revenue"
          hintIcon={<TrendingUp className="size-3.5" />}
          tone="success"
        />
        <MetricCard
          label="Outstanding Udhar"
          value={money(totalOutstanding)}
          hint={`${customers.filter((c) => c.balance > 0).length} active khatas`}
          hintIcon={<AlertTriangle className="size-3.5" />}
          tone="warning"
        />
        <MetricCard
          label="Wasooli Recovered"
          value={money(recoveredAmount)}
          hint="Repayments logged"
          hintIcon={<CheckCircle2 className="size-3.5" />}
          tone="info"
        />
        <MetricCard
          label="Low Stock Alerts"
          value={`${lowStockCount} SKUs`}
          hint="Reorder review required"
          hintIcon={<PackageSearch className="size-3.5" />}
          tone="danger"
        />
      </section>

      {/* Tab Segment Controls */}
      <div className="flex border border-outline-variant bg-surface-container-low rounded-xl p-1 w-full md:w-fit gap-1 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          className={`flex-1 md:flex-initial py-2 px-5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
            activeTab === 'sales'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          }`}
        >
          <FileText className="size-4" />
          Sales & Invoices
        </button>
        
        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          className={`flex-1 md:flex-initial py-2 px-5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
            activeTab === 'customers'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          }`}
        >
          <Users className="size-4" />
          Customer Khatas
        </button>
        
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`flex-1 md:flex-initial py-2 px-5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
            activeTab === 'products'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          }`}
        >
          <PackageSearch className="size-4" />
          Product Performance
        </button>
      </div>

      {/* Tabular Reports Workspace */}
      <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        
        {/* Filters Toolbar */}
        <div className="p-4 border-b border-outline-variant bg-surface-container-low/50 space-y-3">
          
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5">
              <Filter className="size-4 text-muted-foreground" />
              Report Filtering Engine
            </h2>
            
            {isFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-wider cursor-pointer"
              >
                <RefreshCcw className="size-3" />
                Reset Filters
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3.5">
            {/* Sales Tab Filters */}
            {activeTab === 'sales' && (
              <>
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search invoice number or customer..."
                    value={salesSearch}
                    onChange={(e) => setSalesSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 border border-outline-variant rounded-lg bg-card focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
                  />
                </div>
                <div className="w-full sm:w-[180px]">
                  <select
                    value={salesPaymentType}
                    onChange={(e) => setSalesPaymentType(e.target.value)}
                    className="w-full text-xs p-2 border border-outline-variant rounded-lg bg-card focus:outline-hidden text-foreground"
                  >
                    <option value="All">All Payment Types</option>
                    <option value="Cash">Cash Only</option>
                    <option value="Udhar">Udhar (Credit) Only</option>
                    <option value="Partial">Partial Only</option>
                  </select>
                </div>
                <div className="w-full sm:w-[180px]">
                  <select
                    value={salesStatus}
                    onChange={(e) => setSalesStatus(e.target.value)}
                    className="w-full text-xs p-2 border border-outline-variant rounded-lg bg-card focus:outline-hidden text-foreground"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Paid">Paid</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </div>
              </>
            )}

            {/* Customers Tab Filters */}
            {activeTab === 'customers' && (
              <>
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search customer name, phone, neighborhood..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 border border-outline-variant rounded-lg bg-card focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
                  />
                </div>
                <div className="w-full sm:w-[180px]">
                  <select
                    value={customerBalanceStatus}
                    onChange={(e) => setCustomerBalanceStatus(e.target.value)}
                    className="w-full text-xs p-2 border border-outline-variant rounded-lg bg-card focus:outline-hidden text-foreground"
                  >
                    <option value="All">All Balances</option>
                    <option value="Has Balance">Has Outstanding Udhar</option>
                    <option value="Clear">Clear Balance Only</option>
                  </select>
                </div>
                <div className="w-full sm:w-[180px]">
                  <select
                    value={customerStatus}
                    onChange={(e) => setCustomerStatus(e.target.value)}
                    className="w-full text-xs p-2 border border-outline-variant rounded-lg bg-card focus:outline-hidden text-foreground"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Active">Active Customers</option>
                    <option value="Inactive">Inactive Customers</option>
                  </select>
                </div>
              </>
            )}

            {/* Products Tab Filters */}
            {activeTab === 'products' && (
              <>
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search product name..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 border border-outline-variant rounded-lg bg-card focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground"
                  />
                </div>
                <div className="w-full sm:w-[220px]">
                  <select
                    value={productStockLevel}
                    onChange={(e) => setProductStockLevel(e.target.value)}
                    className="w-full text-xs p-2 border border-outline-variant rounded-lg bg-card focus:outline-hidden text-foreground"
                  >
                    <option value="All">All Stock Levels</option>
                    <option value="Low Stock">Low Stock Only (≤ 8 left)</option>
                    <option value="Healthy">Healthy Stock Only (&gt; 8 left)</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabular Reports Workspace View */}
        <div className="overflow-x-auto custom-scrollbar">
          
          {/* Sales Tab Table */}
          {activeTab === 'sales' && (
            <Table className="min-w-[850px]">
              <THead>
                <tr>
                  <Th>Invoice ID</Th>
                  <Th>Customer Name</Th>
                  <Th>Date Created</Th>
                  <Th>Payment Type</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total Amount</Th>
                </tr>
              </THead>
              <TBody>
                {filteredInvoices.length === 0 ? (
                  <TRow>
                    <Td colSpan={6} className="text-center text-muted-foreground italic py-8">
                      No invoices found matching current filters.
                    </Td>
                  </TRow>
                ) : (
                  filteredInvoices.map((inv) => (
                    <TRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <Td>
                        <Link href="/invoices" className="font-mono text-xs font-bold text-primary hover:underline">
                          {inv.id}
                        </Link>
                      </Td>
                      <Td className="font-semibold text-foreground">{inv.customerName}</Td>
                      <Td className="font-mono text-xs text-muted-foreground">{inv.date}</Td>
                      <Td>
                        <Badge tone={inv.paymentType === 'Cash' ? 'neutral' : inv.paymentType === 'Udhar' ? 'warning' : 'info'}>
                          {inv.paymentType}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={inv.status === 'Paid' ? 'success' : inv.status === 'Overdue' ? 'danger' : 'warning'}>
                          {inv.status}
                        </Badge>
                      </Td>
                      <Td className="text-right font-mono font-bold text-foreground">{money(inv.amount)}</Td>
                    </TRow>
                  ))
                )}
              </TBody>
            </Table>
          )}

          {/* Customers Tab Table */}
          {activeTab === 'customers' && (
            <Table className="min-w-[950px]">
              <THead>
                <tr>
                  <Th>Customer Name</Th>
                  <Th>Phone Number</Th>
                  <Th>Area / Neighborhood</Th>
                  <Th>Credit Status</Th>
                  <Th>Health Score</Th>
                  <Th>Account Status</Th>
                  <Th className="text-right">Outstanding (Baqi)</Th>
                  <Th className="text-right">Credit Limit</Th>
                </tr>
              </THead>
              <TBody>
                {filteredCustomers.length === 0 ? (
                  <TRow>
                    <Td colSpan={8} className="text-center text-muted-foreground italic py-8">
                      No customers found matching current filters.
                    </Td>
                  </TRow>
                ) : (
                  filteredCustomers.map((cust) => {
                    const healthTone = cust.healthScore >= 80 ? 'success' : cust.healthScore >= 50 ? 'warning' : 'danger';
                    return (
                      <TRow key={cust.id} className="hover:bg-muted/30 transition-colors">
                        <Td>
                          <Link href={`/ledger?customer=${cust.id}`} className="font-bold text-primary hover:underline">
                            {cust.name}
                          </Link>
                        </Td>
                        <Td className="font-mono text-xs text-muted-foreground">{cust.phone}</Td>
                        <Td className="text-foreground">{cust.neighborhood}</Td>
                        <Td>
                          <Badge tone={cust.balance > 0 ? 'warning' : 'success'}>
                            {cust.balance > 0 ? 'Owes Udhar' : 'Clear'}
                          </Badge>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${healthTone === 'success' ? 'bg-success' : healthTone === 'warning' ? 'bg-warning' : 'bg-danger'}`} />
                            <span className="font-bold text-xs">{cust.healthScore}%</span>
                          </div>
                        </Td>
                        <Td>
                          <Badge tone={cust.status === 'Active' ? 'success' : 'neutral'}>
                            {cust.status}
                          </Badge>
                        </Td>
                        <Td className={`text-right font-mono font-bold ${cust.balance > 0 ? 'text-warning-text' : 'text-foreground'}`}>
                          {money(cust.balance)}
                        </Td>
                        <Td className="text-right font-mono text-muted-foreground">{money(cust.creditLimit)}</Td>
                      </TRow>
                    );
                  })
                )}
              </TBody>
            </Table>
          )}

          {/* Products Tab Table */}
          {activeTab === 'products' && (
            <Table className="min-w-[800px]">
              <THead>
                <tr>
                  <Th>Product Name</Th>
                  <Th className="text-right">Units Sold</Th>
                  <Th className="text-right">Revenue Generated</Th>
                  <Th className="text-right">Current Stock</Th>
                  <Th>Stock Status</Th>
                </tr>
              </THead>
              <TBody>
                {filteredProducts.length === 0 ? (
                  <TRow>
                    <Td colSpan={5} className="text-center text-muted-foreground italic py-8">
                      No products found matching current filters.
                    </Td>
                  </TRow>
                ) : (
                  filteredProducts.map((p) => {
                    const isLow = p.stock <= 8;
                    const isCritical = p.stock <= 4;
                    return (
                      <TRow key={p.name} className="hover:bg-muted/30 transition-colors">
                        <Td className="font-semibold text-foreground">{p.name}</Td>
                        <Td className="text-right font-mono font-semibold">{p.units.toLocaleString()} units</Td>
                        <Td className="text-right font-mono font-bold text-success-text">{money(p.revenue)}</Td>
                        <Td className="text-right font-mono font-bold">{p.stock}</Td>
                        <Td>
                          <Badge tone={isCritical ? 'danger' : isLow ? 'warning' : 'success'}>
                            {isCritical ? 'Critical Stock' : isLow ? 'Low Stock' : 'Healthy Stock'}
                          </Badge>
                        </Td>
                      </TRow>
                    );
                  })
                )}
              </TBody>
            </Table>
          )}

        </div>

        {/* Footer info displaying number of entries */}
        <div className="p-3 border-t border-outline-variant bg-surface-container-low/30 flex justify-between items-center text-[10px] font-mono text-muted-foreground">
          <div>
            {activeTab === 'sales' && `Showing ${filteredInvoices.length} of ${invoices.length} invoices`}
            {activeTab === 'customers' && `Showing ${filteredCustomers.length} of ${customers.length} customer accounts`}
            {activeTab === 'products' && `Showing ${filteredProducts.length} of ${PRODUCT_BASELINE.length} products`}
          </div>
          <div>
            Selected Tab: {activeTab.toUpperCase()}
          </div>
        </div>

      </Card>

    </div>
  );
}
