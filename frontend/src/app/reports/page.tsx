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
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Badge, Card, MetricCard, Table, TBody, Td, Th, THead, TRow } from '@/components/ui';

function money(value: number) {
  return `PKR ${value.toLocaleString()}`;
}

function escapePdfText(value: string) {
  return value
    .replace(/[\\()]/g, '\\$&')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function createPdf(lines: string[]) {
  const pageLines = 42;
  const pages = Array.from({ length: Math.max(1, Math.ceil(lines.length / pageLines)) }, (_, index) =>
    lines.slice(index * pageLines, (index + 1) * pageLines),
  );
  const pageObjectNumbers = pages.map((_, index) => 4 + index * 2);
  const objects: string[] = [];

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  pages.forEach((page, index) => {
    const pageObject = pageObjectNumbers[index];
    const contentObject = pageObject + 1;
    const text = page
      .map((line, lineIndex) => {
        const fontSize = lineIndex === 0 ? 16 : lineIndex === 2 ? 9 : 10;
        const font = lineIndex === 0 ? '/F1 16 Tf' : `/F1 ${fontSize} Tf`;
        return `${font} (${escapePdfText(line)}) Tj T*`;
      })
      .join('\n');
    const stream = `BT\n50 790 Td\n15 TL\n${text}\nET`;

    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export default function ReportsPage() {
  const { customers, invoices, inventory } = useApp();

  // Active tab state: 'sales' | 'customers' | 'products'
  const [activeTab, setActiveTab] = useState<'sales' | 'customers' | 'products'>('sales');

  // Timeframe filter state: 'All' | 'Daily' | 'Weekly' | 'Monthly'
  const [timeframe, setTimeframe] = useState<'All' | 'Daily' | 'Weekly' | 'Monthly'>('All');

  // --- Filter States ---
  // Sales Tab filters
  const [salesSearch, setSalesSearch] = useState('');

  // Customers Tab filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerRecency, setCustomerRecency] = useState('All');
  const [customerStatus, setCustomerStatus] = useState('All');

  // Lifetime sales per customer (real, from invoices).
  const lifetimeById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of invoices) map[inv.customerId] = (map[inv.customerId] ?? 0) + inv.amount;
    return map;
  }, [invoices]);
  const lifetimeOf = (id: string) => lifetimeById[id] ?? 0;

  // Products Tab filters
  const [productSearch, setProductSearch] = useState('');
  const [productStockLevel, setProductStockLevel] = useState('All');

  // --- Timeframe Checker Helper ---
  // Anchored to the most recent date actually present in the ledger (not the
  // real wall clock) so "Daily/Weekly/Monthly" stay meaningful against the
  // demo dataset's own dates instead of always returning empty.
  const anchor = useMemo(() => {
    const dates = invoices.map((i) => new Date(i.date.split(' ')[0]))
      .filter((d) => !Number.isNaN(d.getTime()));
    if (!dates.length) return new Date();
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    max.setHours(0, 0, 0, 0);
    return max;
  }, [invoices]);

  const isDateInTimeframe = useMemo(() => {
    return (dateStr: string) => {
      if (timeframe === 'All') return true;
      const d = new Date(dateStr.split(' ')[0]);
      d.setHours(0, 0, 0, 0);
      if (d.getTime() > anchor.getTime()) return false;
      const diffDays = Math.round((anchor.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (timeframe === 'Daily') return diffDays === 0;
      if (timeframe === 'Weekly') return diffDays <= 6;
      return diffDays <= 29; // Monthly
    };
  }, [timeframe, anchor]);

  // --- Dynamic Stats based on Timeframe — real sums only, no baselines ────
  const salesInTimeframe = useMemo(
    () => invoices.filter((inv) => isDateInTimeframe(inv.date)).reduce((sum, inv) => sum + inv.amount, 0),
    [invoices, isDateInTimeframe],
  );

  const invoicesInTimeframe = useMemo(
    () => invoices.filter((inv) => isDateInTimeframe(inv.date)).length,
    [invoices, isDateInTimeframe],
  );

  // --- Real product catalog: inventory + actual sold quantity/revenue ─────
  const productCatalog = useMemo(() => {
    const sales = new Map<string, { units: number; revenue: number }>();
    for (const inv of invoices) {
      if (!isDateInTimeframe(inv.date)) continue;
      for (const item of inv.items) {
        const row = sales.get(item.name) ?? { units: 0, revenue: 0 };
        row.units += item.quantity;
        row.revenue += item.total;
        sales.set(item.name, row);
      }
    }
    const rows: { name: string; units: number; revenue: number; stock: number | null; reorder: number | null }[] = inventory.map((item) => {
      const s = sales.get(item.product) ?? { units: 0, revenue: 0 };
      return { name: item.product, units: s.units, revenue: s.revenue, stock: item.current, reorder: item.reorder };
    });
    const tracked = new Set(inventory.map((i) => i.product));
    for (const [name, s] of sales) {
      if (!tracked.has(name)) rows.push({ name, units: s.units, revenue: s.revenue, stock: null, reorder: null });
    }
    return rows;
  }, [inventory, invoices, isDateInTimeframe]);

  const lowStockCount = useMemo(
    () => inventory.filter((item) => item.current <= item.reorder).length,
    [inventory],
  );

  // --- Filter logic for Invoices ---
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.id.toLowerCase().includes(salesSearch.toLowerCase()) ||
        inv.customerName.toLowerCase().includes(salesSearch.toLowerCase());
      const matchesTimeframe = isDateInTimeframe(inv.date);
      return matchesSearch && matchesTimeframe;
    });
  }, [invoices, salesSearch, isDateInTimeframe]);

  // --- Filter logic for Customers ---
  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      const matchesSearch =
        cust.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        cust.neighborhood.toLowerCase().includes(customerSearch.toLowerCase()) ||
        cust.phone.includes(customerSearch);
      const matchesRecency =
        customerRecency === 'All' ||
        (customerRecency === 'Active' ? cust.lastVisitDays < 14 : cust.lastVisitDays >= 14);
      const matchesStatus = customerStatus === 'All' || cust.status === customerStatus;

      let matchesTimeframe = true;
      if (timeframe === 'Daily') {
        matchesTimeframe = cust.lastVisitDays <= 1;
      } else if (timeframe === 'Weekly') {
        matchesTimeframe = cust.lastVisitDays <= 7;
      } else if (timeframe === 'Monthly') {
        matchesTimeframe = cust.lastVisitDays <= 30;
      }

      return matchesSearch && matchesRecency && matchesStatus && matchesTimeframe;
    });
  }, [customers, customerSearch, customerRecency, customerStatus, timeframe]);

  // --- Filter logic for Products (real catalog: inventory + actual sales) ──
  const filteredProducts = useMemo(() => {
    return productCatalog.filter((prod) => {
      const matchesSearch = prod.name.toLowerCase().includes(productSearch.toLowerCase());
      const matchesStock =
        productStockLevel === 'All' ||
        prod.stock === null ||
        (productStockLevel === 'Low Stock' ? prod.stock <= (prod.reorder ?? 0) : prod.stock > (prod.reorder ?? 0));
      return matchesSearch && matchesStock;
    });
  }, [productCatalog, productSearch, productStockLevel]);

  // Reset all filters in the active view
  const handleResetFilters = () => {
    setTimeframe('All');
    if (activeTab === 'sales') {
      setSalesSearch('');
    } else if (activeTab === 'customers') {
      setCustomerSearch('');
      setCustomerRecency('All');
      setCustomerStatus('All');
    } else {
      setProductSearch('');
      setProductStockLevel('All');
    }
  };

  // Check if any filter is active in the current tab
  const isFilterActive = useMemo(() => {
    const isTimeframeFiltered = timeframe !== 'All';
    if (activeTab === 'sales') {
      return salesSearch !== '' || isTimeframeFiltered;
    } else if (activeTab === 'customers') {
      return customerSearch !== '' || customerRecency !== 'All' || customerStatus !== 'All' || isTimeframeFiltered;
    } else {
      return productSearch !== '' || productStockLevel !== 'All' || isTimeframeFiltered;
    }
  }, [
    activeTab,
    salesSearch,
    customerSearch,
    customerRecency,
    customerStatus,
    productSearch,
    productStockLevel,
    timeframe,
  ]);

  // Simulated CSV Export logic for tabular data
  const handleExport = () => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = 'report.csv';

    if (activeTab === 'sales') {
      headers = ['Invoice ID', 'Customer', 'Date', 'Amount (PKR)'];
      rows = filteredInvoices.map((inv) => [
        inv.id,
        inv.customerName,
        inv.date,
        inv.amount.toString(),
      ]);
      filename = `sales_report_${timeframe.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    } else if (activeTab === 'customers') {
      headers = ['Customer Name', 'Phone', 'Neighborhood', 'Status', 'Lifetime Sales (PKR)', 'Last Visit (days)'];
      rows = filteredCustomers.map((cust) => [
        cust.name,
        cust.phone,
        cust.neighborhood,
        cust.status,
        lifetimeOf(cust.id).toString(),
        cust.lastVisitDays.toString(),
      ]);
      filename = `customer_report_${timeframe.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      headers = ['Product Name', 'Units Sold', 'Total Revenue (PKR)', 'Current Stock', 'Stock Status'];
      rows = filteredProducts.map((p) => [
        p.name,
        p.units.toString(),
        p.revenue.toString(),
        p.stock !== null ? p.stock.toString() : 'Untracked',
        p.stock !== null && p.reorder !== null ? (p.stock <= p.reorder ? 'Low Stock' : 'Healthy') : 'Untracked',
      ]);
      filename = `product_report_${timeframe.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
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

  const handleDownloadSalesPdf = () => {
    const total = filteredInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const appliedFilters = [
      `Timeframe: ${timeframe}`,
      salesSearch ? `Search: ${salesSearch}` : null,
    ].filter(Boolean).join(' | ');
    const lines = [
      'PSO SME - Sales & Invoices Report',
      `Generated: ${new Date().toLocaleString('en-PK')}`,
      appliedFilters,
      '',
      'Invoice ID | Customer | Date | Amount',
      ...filteredInvoices.map((invoice) =>
        `${invoice.id} | ${invoice.customerName} | ${invoice.date} | ${money(invoice.amount)}`,
      ),
      '',
      `Invoices: ${filteredInvoices.length}    Total: ${money(total)}`,
    ];
    const url = URL.createObjectURL(createPdf(lines));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-invoices_${timeframe.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-gutter space-y-4 animate-fade-in">
      
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary animate-pulse" />
            Reports Dashboard
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
            Query, filter, and export business performance spreadsheets
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'sales' && (
            <button
              type="button"
              onClick={handleDownloadSalesPdf}
              className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/85 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
            >
              <FileText className="size-3.5" />
              Download Sales PDF
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg border border-outline-variant bg-card text-foreground text-xs font-semibold hover:bg-muted active:scale-[0.98] transition-all cursor-pointer"
          >
            <Download className="size-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Dynamic Overview Stat Cards (updates based on timeframe) */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label={`Sales Revenue (${timeframe === 'All' ? 'MTD' : timeframe})`}
          value={money(salesInTimeframe)}
          hint="Invoiced sale total"
          hintIcon={<TrendingUp className="size-3.5" />}
          tone="success"
        />
        <MetricCard
          label="Total Customers"
          value={customers.length.toString()}
          hint={`${customers.filter((c) => c.status === 'Active').length} active`}
          hintIcon={<CheckCircle2 className="size-3.5" />}
          tone="info"
        />
        <MetricCard
          label={`Invoices (${timeframe === 'All' ? 'MTD' : timeframe})`}
          value={invoicesInTimeframe.toString()}
          hint="Sales recorded"
          hintIcon={<TrendingUp className="size-3.5" />}
        />
        <MetricCard
          label="Low Stock Alerts"
          value={`${lowStockCount} SKUs`}
          hint="Reorder review required"
          hintIcon={<PackageSearch className="size-3.5" />}
          tone="danger"
        />
      </section>

      {/* Tab Segment Controls & Timeframe Selector Bar */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-start md:items-center">
        {/* Left: Tab selectors */}
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

        {/* Right: Global Timeframe selector */}
        <div className="flex items-center gap-1 bg-card border border-outline-variant rounded-xl p-1 w-full md:w-fit shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider px-2.5">Timeframe:</span>
          {(['All', 'Daily', 'Weekly', 'Monthly'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`flex-1 md:flex-initial py-1.5 px-3.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                timeframe === tf
                  ? 'bg-primary text-primary-foreground font-bold shadow-2xs'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              {tf === 'All' ? 'All Time' : tf}
            </button>
          ))}
        </div>
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
                    value={customerRecency}
                    onChange={(e) => setCustomerRecency(e.target.value)}
                    className="w-full text-xs p-2 border border-outline-variant rounded-lg bg-card focus:outline-hidden text-foreground"
                  >
                    <option value="All">All Customers</option>
                    <option value="Active">Visited recently (&lt;14d)</option>
                    <option value="Lapsed">Lapsed (14+ days)</option>
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
                  <Th>Status</Th>
                  <Th className="text-right">Total Amount</Th>
                </tr>
              </THead>
              <TBody>
                {filteredInvoices.length === 0 ? (
                  <TRow>
                    <Td colSpan={5} className="text-center text-muted-foreground italic py-8">
                      No invoices found matching current filters or timeframe ({timeframe === 'All' ? 'All Time' : timeframe}).
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
                        <Badge tone="success">Paid</Badge>
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
                  <Th>Engagement</Th>
                  <Th>Account Status</Th>
                  <Th className="text-right">Lifetime Sales</Th>
                  <Th className="text-right">Last Visit</Th>
                </tr>
              </THead>
              <TBody>
                {filteredCustomers.length === 0 ? (
                  <TRow>
                    <Td colSpan={7} className="text-center text-muted-foreground italic py-8">
                      No customers found matching current filters or timeframe ({timeframe === 'All' ? 'All Time' : timeframe}).
                    </Td>
                  </TRow>
                ) : (
                  filteredCustomers.map((cust) => {
                    const lapsed = cust.lastVisitDays >= 14;
                    const cooling = !lapsed && cust.lastVisitDays >= 7;
                    return (
                      <TRow key={cust.id} className="hover:bg-muted/30 transition-colors">
                        <Td>
                          <Link href={`/customers/${cust.id}`} className="font-bold text-primary hover:underline">
                            {cust.name}
                          </Link>
                        </Td>
                        <Td className="font-mono text-xs text-muted-foreground">{cust.phone}</Td>
                        <Td className="text-foreground">{cust.neighborhood}</Td>
                        <Td>
                          <Badge tone={lapsed ? 'danger' : cooling ? 'warning' : 'success'}>
                            {lapsed ? 'Lapsed' : cooling ? 'Cooling' : 'Active'}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge tone={cust.status === 'Active' ? 'success' : 'neutral'}>
                            {cust.status}
                          </Badge>
                        </Td>
                        <Td className="text-right font-mono font-bold text-foreground">{money(lifetimeOf(cust.id))}</Td>
                        <Td className="text-right font-mono text-muted-foreground">{cust.lastVisitDays}d ago</Td>
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
                    const tracked = p.stock !== null && p.reorder !== null;
                    const isLow = tracked && p.stock! <= p.reorder!;
                    const isCritical = tracked && p.stock! <= p.reorder! / 2;
                    return (
                      <TRow key={p.name} className="hover:bg-muted/30 transition-colors">
                        <Td className="font-semibold text-foreground">{p.name}</Td>
                        <Td className="text-right font-mono font-semibold">{p.units.toLocaleString()} units</Td>
                        <Td className="text-right font-mono font-bold text-success-text">{money(p.revenue)}</Td>
                        <Td className="text-right font-mono font-bold">{tracked ? p.stock : '—'}</Td>
                        <Td>
                          {tracked ? (
                            <Badge tone={isCritical ? 'danger' : isLow ? 'warning' : 'success'}>
                              {isCritical ? 'Critical Stock' : isLow ? 'Low Stock' : 'Healthy Stock'}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Untracked</Badge>
                          )}
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
            {activeTab === 'products' && `Showing ${filteredProducts.length} of ${productCatalog.length} products`}
          </div>
          <div>
            Selected Tab: {activeTab.toUpperCase()} | Timeframe: {timeframe.toUpperCase()}
          </div>
        </div>

      </Card>

    </div>
  );
}
