'use client';

import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Banknote,
  BellRing,
  Building2,
  Package,
  PackageX,
  Plus,
  Search,
  ShieldCheck,
  Truck,
  Wallet,
  ArrowDown,
} from 'lucide-react';
import { Badge, Card, MetricCard, Table, TBody, Td, Th, THead, TRow } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { PurchaseDrawer } from '@/components/inventory/PurchaseDrawer';
import { ProductModal } from '@/components/inventory/ProductModal';
import { SupplierModal } from '@/components/inventory/SupplierModal';

type WorkspaceTab = 'stock' | 'suppliers';

const getStatusInfo = (current: number, reorder: number) => {
  if (current <= 0) return { label: 'Out of Stock', tone: 'danger' as const };
  if (current <= reorder) return { label: 'Low Stock', tone: 'warning' as const };
  return { label: 'Healthy', tone: 'success' as const };
};

function InventoryWorkspace() {
  const { inventory: items = [], suppliers, supplierInvoices } = useApp();

  const searchParams = useSearchParams();
  const initialTab: WorkspaceTab = searchParams.get('tab') === 'suppliers' ? 'suppliers' : 'stock';
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const [stockSearch, setStockSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const triggerToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  };

  const supplierById = (id?: string) => suppliers.find((s) => s.id === id);
  const linkedProductsOf = (supplierId: string) => items.filter((i) => i.supplierId === supplierId);
  const lifetimeOf = (supplierId: string) =>
    supplierInvoices.filter((inv) => inv.supplierId === supplierId && inv.status === 'Paid').reduce((sum, inv) => sum + inv.amount, 0);
  const lastPurchaseOf = (supplierId: string) =>
    supplierInvoices.filter((inv) => inv.supplierId === supplierId).slice().sort((a, b) => b.date.localeCompare(a.date))[0];

  // ── Stock KPIs ───────────────────────────────────────────────────────────
  const totalCurrentStock = items.reduce((sum, item) => sum + item.current, 0);
  const outOfStockItems = items.filter((item) => item.current <= 0);
  const lowStockItems = items.filter((item) => item.current > 0 && item.current <= item.reorder);
  const needsAttention = [...outOfStockItems, ...lowStockItems];

  // ── Supplier KPIs ────────────────────────────────────────────────────────
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter((s) => s.status === 'Active').length;
  const totalPurchaseValue = supplierInvoices.filter((inv) => inv.status === 'Paid').reduce((sum, inv) => sum + inv.amount, 0);
  const outstandingDrafts = supplierInvoices.filter((inv) => inv.status === 'Draft');
  const outstandingValue = outstandingDrafts.reduce((sum, inv) => sum + inv.amount, 0);

  const filteredItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.product.toLowerCase().includes(stockSearch.toLowerCase()) ||
          i.sku.toLowerCase().includes(stockSearch.toLowerCase()),
      ),
    [items, stockSearch],
  );

  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
          s.category.toLowerCase().includes(supplierSearch.toLowerCase()) ||
          s.contactPerson.toLowerCase().includes(supplierSearch.toLowerCase()),
      ),
    [suppliers, supplierSearch],
  );

  // ── Modal / drawer orchestration ────────────────────────────────────────
  const [restockSku, setRestockSku] = useState<string | null>(null);
  const [isGenericRestockOpen, setIsGenericRestockOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  return (
    <div className="max-w-[1600px] mx-auto p-gutter space-y-4 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-2">
            <Package className="size-5 text-primary" />
            Inventory &amp; Suppliers
          </h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
            {activeTab === 'stock'
              ? 'What products you have, and what needs restocking'
              : 'Who you purchase from, and how much you’ve bought'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'stock' ? (
            <>
              <button
                type="button"
                onClick={() => setIsAddProductOpen(true)}
                className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg border border-outline-variant text-foreground text-xs font-semibold hover:bg-muted transition-all cursor-pointer"
              >
                <Plus className="size-3.5" />
                Add Product
              </button>
              <button
                type="button"
                onClick={() => setIsGenericRestockOpen(true)}
                disabled={suppliers.length === 0}
                className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/85 active:scale-[0.98] transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                <ArrowDown className="size-3.5" />
                Restock
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddSupplierOpen(true)}
              className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/85 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
            >
              <Plus className="size-3.5" />
              Add Supplier
            </button>
          )}
        </div>
      </div>

      {/* Tabs: Stock / Suppliers */}
      <div className="flex bg-surface-container p-1 rounded-lg w-full md:w-max select-none">
        {([
          ['stock', 'Stock', items.length, Package],
          ['suppliers', 'Suppliers', suppliers.length, Truck],
        ] as const).map(([tab, label, count, TabIcon]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md font-label-md transition-all text-xs whitespace-nowrap font-bold flex items-center gap-1.5 ${
              activeTab === tab ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <TabIcon className="size-3.5" />
            {label}
            <span className={`ml-1 rounded px-1.5 py-0.5 text-[9px] ${
              activeTab === tab ? 'bg-primary/10 text-primary' : 'bg-white/70 text-on-surface-variant'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'stock' ? (
        <>
          {/* Summary KPIs */}
          <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricCard label="Units On Hand" value={`${totalCurrentStock.toLocaleString()} units`} hint={`${items.length} tracked products`} hintIcon={<Package className="size-3.5" />} tone="info" />
            <MetricCard label="Low Stock" value={`${lowStockItems.length} products`} hint="At or below reorder level" hintIcon={<ShieldCheck className="size-3.5" />} tone={lowStockItems.length ? 'warning' : 'success'} />
            <MetricCard label="Out of Stock" value={`${outOfStockItems.length} products`} hint="Zero units remaining" hintIcon={<PackageX className="size-3.5" />} tone={outOfStockItems.length ? 'danger' : 'success'} />
            <MetricCard label="Reorder Alerts" value={needsAttention.length} hint="Need restocking soon" hintIcon={<BellRing className="size-3.5" />} tone={needsAttention.length ? 'danger' : 'success'} />
          </section>

          {/* Search */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-end items-center shadow-sm">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 outline-none text-sm"
                placeholder="Search product or SKU..."
                type="text"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Main Content Workspace Layout */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            {/* Left Column: Current Stock Table */}
            <Card className="xl:col-span-9 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container-low/50">
                <div className="flex items-center gap-2">
                  <Package className="size-4 text-foreground" />
                  <h2 className="text-sm font-semibold tracking-tight">Current Stock</h2>
                </div>
                <Badge tone="info">{filteredItems.length} products</Badge>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <Table className="min-w-[1000px]">
                  <THead>
                    <tr>
                      <Th>SKU</Th>
                      <Th>Product Name</Th>
                      <Th>Preferred Supplier</Th>
                      <Th className="text-right">Current Stock</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {filteredItems.length === 0 ? (
                      <TRow>
                        <Td colSpan={6} className="text-center text-muted-foreground italic py-8">No products match the search.</Td>
                      </TRow>
                    ) : (
                      filteredItems.map((item) => {
                        const status = getStatusInfo(item.current, item.reorder);
                        const supplier = supplierById(item.supplierId);
                        return (
                          <TRow key={item.sku} className="hover:bg-muted/30 transition-colors">
                            <Td className="font-mono text-xs font-semibold text-foreground">{item.sku}</Td>
                            <Td className="font-bold text-foreground whitespace-nowrap">{item.product}</Td>
                            <Td className="text-muted-foreground whitespace-nowrap">
                              {supplier ? supplier.name : <span className="italic text-outline">Unlinked</span>}
                            </Td>
                            <Td className="text-right font-mono font-bold text-foreground bg-muted/20">{item.current}</Td>
                            <Td>
                              <Badge tone={status.tone}>{status.label}</Badge>
                            </Td>
                            <Td className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setRestockSku(item.sku)}
                                  title="Restock"
                                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-outline-variant text-[11px] font-semibold text-foreground hover:bg-muted transition-colors"
                                >
                                  <ArrowDown className="size-3" />
                                  Restock
                                </button>
                              </div>
                            </Td>
                          </TRow>
                        );
                      })
                    )}
                  </TBody>
                </Table>
              </div>
            </Card>

            {/* Right Column: Reorder Alerts Panel */}
            <Card className="xl:col-span-3 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 px-4 py-3.5 border-b border-outline-variant bg-surface-container-low/50">
                <BellRing className="size-4 text-danger animate-bounce" />
                <h2 className="text-sm font-semibold tracking-tight text-foreground">Reorder Alerts</h2>
              </div>
              <div className="p-3 space-y-3 bg-card">
                {needsAttention.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-6">All stock levels are healthy.</p>
                ) : (
                  needsAttention.map((item) => {
                    const status = getStatusInfo(item.current, item.reorder);
                    const supplier = supplierById(item.supplierId);
                    return (
                      <div key={item.sku} className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{item.product}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {item.current} units remaining (reorder at {item.reorder}).
                            </p>
                            <p className="text-[10px] text-outline mt-1">
                              {supplier ? `Supplier: ${supplier.name}` : 'No supplier linked'}
                            </p>
                          </div>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <button
                          onClick={() => setRestockSku(item.sku)}
                          className="h-8 w-full rounded-lg border border-outline-variant text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                        >
                          Restock
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <>
          {/* Supplier KPIs */}
          <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricCard label="Total Suppliers" value={totalSuppliers} hint={`${activeSuppliers} active`} hintIcon={<Building2 className="size-3.5" />} />
            <MetricCard label="Products Supplied" value={items.filter((i) => i.supplierId).length} hint={`of ${items.length} tracked`} hintIcon={<Package className="size-3.5" />} />
            <MetricCard label="Total Purchases" value={`PKR ${totalPurchaseValue.toLocaleString()}`} hint="Confirmed &amp; paid" hintIcon={<Wallet className="size-3.5" />} tone="info" />
            <MetricCard label="Outstanding" value={`PKR ${outstandingValue.toLocaleString()}`} hint={`${outstandingDrafts.length} draft invoices`} hintIcon={<AlertTriangle className="size-3.5" />} tone={outstandingDrafts.length ? 'warning' : 'success'} />
          </section>

          {/* Search */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-end items-center shadow-sm">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 outline-none text-sm"
                placeholder="Search supplier, contact, or category..."
                type="text"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Suppliers Directory */}
          <Card className="overflow-hidden shadow-sm">
            <div className="overflow-x-auto custom-scrollbar">
              <Table className="min-w-[950px]">
                <THead>
                  <tr>
                    <Th>Supplier</Th>
                    <Th>Category</Th>
                    <Th className="text-right">Products Supplied</Th>
                    <Th className="text-right">Lifetime Purchases</Th>
                    <Th>Last Purchase</Th>
                    <Th>Status</Th>
                  </tr>
                </THead>
                <TBody>
                  {filteredSuppliers.length === 0 ? (
                    <TRow>
                      <Td colSpan={6} className="text-center text-muted-foreground italic py-8">No suppliers match the search.</Td>
                    </TRow>
                  ) : (
                    filteredSuppliers.map((supplier) => {
                      const last = lastPurchaseOf(supplier.id);
                      return (
                        <TRow key={supplier.id} className="hover:bg-muted/30 transition-colors cursor-pointer">
                          <Td>
                            <Link href={`/inventory/suppliers/${supplier.id}`} className="font-bold text-primary hover:underline whitespace-nowrap">
                              {supplier.name}
                            </Link>
                            <p className="text-[11px] text-muted-foreground">{supplier.phone}</p>
                          </Td>
                          <Td>
                            <span className="inline-block px-2 py-0.5 bg-surface-container text-on-surface-variant text-[11px] rounded font-medium">
                              {supplier.category}
                            </span>
                          </Td>
                          <Td className="text-right font-mono font-semibold text-foreground">{linkedProductsOf(supplier.id).length}</Td>
                          <Td className="text-right font-mono font-bold text-primary">PKR {lifetimeOf(supplier.id).toLocaleString()}</Td>
                          <Td className="font-mono text-xs text-muted-foreground">{last ? last.date : '—'}</Td>
                          <Td>
                            <Badge tone={supplier.status === 'Active' ? 'success' : 'neutral'}>{supplier.status}</Badge>
                          </Td>
                        </TRow>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </div>
          </Card>

          {/* Recent Purchase Invoices */}
          <Card className="overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container-low/50">
              <h2 className="text-sm font-semibold tracking-tight">Recent Invoices</h2>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <Table className="min-w-[700px]">
                <THead>
                  <tr>
                    <Th>Invoice ID</Th>
                    <Th>Supplier</Th>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </THead>
                <TBody>
                  {supplierInvoices.length === 0 ? (
                    <TRow>
                      <Td colSpan={5} className="text-center text-muted-foreground italic py-8">No purchase invoices yet.</Td>
                    </TRow>
                  ) : (
                    supplierInvoices.slice(0, 6).map((inv) => (
                      <TRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <Td className="font-mono text-xs font-bold text-primary">{inv.id}</Td>
                        <Td className="font-semibold text-foreground">
                          <Link href={`/inventory/suppliers/${inv.supplierId}`} className="hover:underline">{inv.supplierName}</Link>
                        </Td>
                        <Td className="font-mono text-xs text-muted-foreground">{inv.date}</Td>
                        <Td><Badge tone={inv.status === 'Paid' ? 'success' : 'warning'}>{inv.status}</Badge></Td>
                        <Td className="text-right font-mono font-bold">PKR {inv.amount.toLocaleString()}</Td>
                      </TRow>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {toast && (
        <div role="status" className="fixed bottom-5 right-5 z-[110] flex items-center gap-2 rounded-lg border border-success/30 bg-card px-4 py-3 text-xs font-semibold text-success-text shadow-lg animate-fade-in">
          <Banknote className="size-4" />
          {toast}
        </div>
      )}

      {/* Restock — fixed product (from a row or alert) */}
      {restockSku && (
        <PurchaseDrawer
          open
          onClose={() => setRestockSku(null)}
          fixedSku={restockSku}
          suggestedQuantity={(() => {
            const item = items.find((i) => i.sku === restockSku);
            return item ? Math.max(item.reorder * 2 - item.current, item.reorder) : undefined;
          })()}
          onSubmitted={(purchase) =>
            triggerToast(
              purchase.status === 'Draft'
                ? `Draft purchase ${purchase.id} saved — confirm it later to receive stock.`
                : `Purchase invoice ${purchase.id} confirmed — stock updated.`,
            )
          }
        />
      )}

      {/* Restock — generic, from the header button */}
      {isGenericRestockOpen && (
        <PurchaseDrawer
          open
          onClose={() => setIsGenericRestockOpen(false)}
          onSubmitted={(purchase) =>
            triggerToast(
              purchase.status === 'Draft'
                ? `Draft purchase ${purchase.id} saved — confirm it later to receive stock.`
                : `Purchase invoice ${purchase.id} confirmed — stock updated.`,
            )
          }
        />
      )}

      {isAddProductOpen && (
        <ProductModal
          open
          onClose={() => setIsAddProductOpen(false)}
          onSaved={() => triggerToast('Product added to inventory.')}
        />
      )}

      {isAddSupplierOpen && (
        <SupplierModal
          open
          onClose={() => setIsAddSupplierOpen(false)}
          onSaved={(s) => triggerToast(`${s.name} added to suppliers.`)}
        />
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-xs text-on-surface-variant font-bold">Loading inventory workspace...</div>}>
      <InventoryWorkspace />
    </Suspense>
  );
}
