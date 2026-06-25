'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CalendarSync,
  Crown,
  Download,
  FileText,
  PackageSearch,
  TriangleAlert,
  Users,
  WalletCards,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Badge, Card, MetricCard, Table, TBody, Td, Th, THead, TRow } from '@/components/ui';
import type { Invoice } from '@/context/AppContext';

type ReportItem = {
  title: string;
  description: string;
  metric: string;
  hint: string;
  icon: React.ElementType;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
};

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

function invoiceTotal(invoices: Invoice[], predicate: (invoice: Invoice) => boolean) {
  return invoices.filter(predicate).reduce((sum, invoice) => sum + invoice.amount, 0);
}

export default function ReportsPage() {
  const { customers, invoices } = useApp();

  const reportData = useMemo(() => {
    const totalSales = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const dailySales = invoiceTotal(invoices, (invoice) => invoice.id === 'INV-2041');
    const weeklySales = invoiceTotal(invoices, (invoice) => invoice.id !== 'INV-2040');
    const monthlySales = totalSales;
    const outstandingTotal = customers.reduce((sum, customer) => sum + customer.balance, 0);
    const topCustomer = [...customers].sort((a, b) => b.healthScore - a.healthScore)[0];
    const bestSeller = PRODUCT_BASELINE[0];
    const lowStockCount = PRODUCT_BASELINE.filter((product) => product.stock <= 8).length;

    return {
      totalSales,
      dailySales,
      weeklySales,
      monthlySales,
      outstandingTotal,
      activeCustomers: customers.filter((customer) => customer.status === 'Active').length,
      topCustomer,
      bestSeller,
      lowStockCount,
    };
  }, [customers, invoices]);

  const salesReports: ReportItem[] = [
    {
      title: 'Daily',
      description: 'Today sales, invoices, cash versus udhar, and payment recovery snapshot.',
      metric: money(reportData.dailySales),
      hint: '1 invoice in focus',
      icon: CalendarDays,
      tone: 'success',
    },
    {
      title: 'Weekly',
      description: 'Rolling week revenue, recovery activity, and high-priority movement.',
      metric: money(reportData.weeklySales),
      hint: 'Current operating week',
      icon: CalendarRange,
      tone: 'info',
    },
    {
      title: 'Monthly',
      description: 'Month-to-date revenue, credit exposure, and portfolio progress.',
      metric: money(reportData.monthlySales),
      hint: `${invoices.length} total invoices`,
      icon: CalendarSync,
      tone: 'neutral',
    },
  ];

  const customerReports: ReportItem[] = [
    {
      title: 'Top Customers',
      description: 'Rank customers by health score, purchase pattern, and account value.',
      metric: reportData.topCustomer?.name ?? 'No customers',
      hint: `${reportData.activeCustomers} active customers`,
      icon: Crown,
      tone: 'success',
    },
    {
      title: 'Outstanding Customers',
      description: 'Customers with open udhar balances and overdue collection priority.',
      metric: money(reportData.outstandingTotal),
      hint: `${customers.filter((customer) => customer.balance > 0).length} balances open`,
      icon: WalletCards,
      tone: 'warning',
    },
  ];

  const productReports: ReportItem[] = [
    {
      title: 'Best Sellers',
      description: 'Fast-moving products by units sold and revenue contribution.',
      metric: reportData.bestSeller.name,
      hint: `${reportData.bestSeller.units} units moved`,
      icon: BarChart3,
      tone: 'success',
    },
    {
      title: 'Low Stock',
      description: 'Products approaching reorder level so replenishment stays ahead.',
      metric: `${reportData.lowStockCount} SKUs`,
      hint: 'At or below 8 units',
      icon: PackageSearch,
      tone: 'danger',
    },
  ];

  const sections = [
    { title: 'Sales Report', icon: FileText, items: salesReports },
    { title: 'Customer Report', icon: Users, items: customerReports },
    { title: 'Product Report', icon: PackageSearch, items: productReports },
  ];

  const outstandingCustomers = [...customers]
    .filter((customer) => customer.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const lowStockProducts = PRODUCT_BASELINE
    .filter((product) => product.stock <= 8)
    .sort((a, b) => a.stock - b.stock);

  return (
    <div className="max-w-[1600px] mx-auto p-gutter space-y-4 animate-fade-in">
      <div className="flex items-center justify-between border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Reports</h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
            Sales, customer, and product reporting
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all"
        >
          <Download className="size-3.5" />
          Export
        </button>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Report Groups" value="3" hint="Sales, customer, product" />
        <MetricCard label="Available Reports" value="7" hint="Daily through low stock" tone="info" />
        <MetricCard label="Outstanding" value={money(reportData.outstandingTotal)} hint="Open customer balance" tone="warning" />
        <MetricCard label="Low Stock" value={`${reportData.lowStockCount} SKUs`} hint="Needs reorder review" tone="danger" />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {sections.map((section) => {
          const SectionIcon = section.icon;
          return (
            <Card key={section.title} className="overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
                <SectionIcon className="size-4 text-foreground" />
                <h2 className="text-sm font-semibold tracking-tight">{section.title}</h2>
              </div>
              <div className="p-3 space-y-2">
                {section.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <Link
                      key={item.title}
                      href="#"
                      className="group block rounded-lg border border-outline-variant bg-surface-container-lowest p-3 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                            <ItemIcon className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                              <Badge tone={item.tone ?? 'neutral'}>Ready</Badge>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3 border-t border-outline-variant pt-3">
                        <p className="text-sm font-bold text-foreground truncate">{item.metric}</p>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                          {item.hint}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
            <TriangleAlert className="size-4 text-warning" />
            <h2 className="text-sm font-semibold tracking-tight">Outstanding Customers</h2>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <THead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Balance</Th>
                </tr>
              </THead>
              <TBody>
                {outstandingCustomers.map((customer) => (
                  <TRow key={customer.id}>
                    <Td>
                      <p className="font-semibold text-foreground whitespace-nowrap">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.neighborhood}</p>
                    </Td>
                    <Td>
                      <Badge tone={customer.lastVisitDays > 10 ? 'danger' : 'warning'}>
                        {customer.lastVisitDays > 10 ? 'Overdue' : 'Open'}
                      </Badge>
                    </Td>
                    <Td className="text-right font-mono text-sm font-semibold">{money(customer.balance)}</Td>
                  </TRow>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
            <PackageSearch className="size-4 text-danger" />
            <h2 className="text-sm font-semibold tracking-tight">Low Stock</h2>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <THead>
                <tr>
                  <Th>Product</Th>
                  <Th>Revenue</Th>
                  <Th className="text-right">Stock</Th>
                </tr>
              </THead>
              <TBody>
                {lowStockProducts.map((product) => (
                  <TRow key={product.name}>
                    <Td>
                      <p className="font-semibold text-foreground whitespace-nowrap">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.units} units sold</p>
                    </Td>
                    <Td className="font-mono text-sm">{money(product.revenue)}</Td>
                    <Td className="text-right">
                      <Badge tone={product.stock <= 4 ? 'danger' : 'warning'}>{product.stock} left</Badge>
                    </Td>
                  </TRow>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
