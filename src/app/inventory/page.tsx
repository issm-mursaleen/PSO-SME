'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  BellRing,
  Building2,
  CheckCircle2,
  Package,
  PackagePlus,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Badge, Card, MetricCard, Table, TBody, Td, Th, THead, TRow } from '@/components/ui';
import { useApp, type PurchaseLineItem } from '@/context/AppContext';

type WorkspaceTab = 'stock' | 'suppliers';

const getStatusInfo = (current: number, reorder: number) => {
  if (current <= reorder) {
    if (current <= reorder / 2) {
      return { label: 'Critical', tone: 'danger' as const };
    }
    return { label: 'Low Stock', tone: 'warning' as const };
  }
  return { label: 'Healthy', tone: 'success' as const };
};

interface PurchaseRow {
  id: string;
  sku: string; // '' means "new product"
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

const emptyRow = (): PurchaseRow => ({
  id: Math.random().toString(36).slice(2),
  sku: '',
  name: '',
  quantity: 1,
  unit: 'pcs',
  price: 0,
});

function InventoryWorkspace() {
  const {
    inventory: items = [],
    suppliers,
    supplierInvoices,
    addSupplier,
    recordPurchase,
  } = useApp();

  const searchParams = useSearchParams();
  const initialTab: WorkspaceTab = searchParams.get('tab') === 'suppliers' ? 'suppliers' : 'stock';
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const triggerToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  };

  const supplierById = (id?: string) => suppliers.find((s) => s.id === id);
  const linkedProductsOf = (supplierId: string) => items.filter((i) => i.supplierId === supplierId);
  const lifetimeOf = (supplierId: string) =>
    supplierInvoices.filter((inv) => inv.supplierId === supplierId).reduce((sum, inv) => sum + inv.amount, 0);

  // ── Stock KPIs ───────────────────────────────────────────────────────────
  const totalCurrentStock = items.reduce((sum, item) => sum + item.current, 0);
  const lowStockItems = items.filter((item) => item.current <= item.reorder);
  const healthyItems = items.filter((item) => item.current > item.reorder);
  const inventoryHealth = items.length ? Math.round((healthyItems.length / items.length) * 100) : 0;
  const topMover = items.slice().sort((a, b) => b.stockOut - a.stockOut)[0] ?? null;

  // ── Supplier KPIs ────────────────────────────────────────────────────────
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter((s) => s.status === 'Active').length;
  const totalPurchaseValue = supplierInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const avgPurchase = supplierInvoices.length ? Math.round(totalPurchaseValue / supplierInvoices.length) : 0;

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

  // ── Add Supplier modal ──────────────────────────────────────────────────
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCategory, setNewCategory] = useState('Grains & Pulses');
  const [newAddress, setNewAddress] = useState('');

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    const created = addSupplier({
      name: newName.trim(),
      contactPerson: newContact.trim(),
      phone: newPhone.trim(),
      category: newCategory,
      address: newAddress.trim(),
      status: 'Active',
      notes: '',
    });
    setIsAddSupplierOpen(false);
    setNewName('');
    setNewContact('');
    setNewPhone('');
    setNewCategory('Grains & Pulses');
    setNewAddress('');
    triggerToast(`${created.name} added to suppliers.`);
  };

  // ── Record Purchase drawer (the single, realistic restock flow) ────────
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState(suppliers[0]?.id ?? '');
  const [rows, setRows] = useState<PurchaseRow[]>([emptyRow()]);
  const [purchaseNotes, setPurchaseNotes] = useState('');

  const supplierProducts = useMemo(
    () => items.filter((i) => i.supplierId === purchaseSupplierId),
    [items, purchaseSupplierId],
  );

  const handleOpenPurchase = (opts?: { supplierId?: string; sku?: string; suggestedQty?: number }) => {
    const supplierId = opts?.supplierId ?? suppliers[0]?.id ?? '';
    setPurchaseSupplierId(supplierId);
    if (opts?.sku) {
      const item = items.find((i) => i.sku === opts.sku);
      setRows([
        {
          id: Math.random().toString(36).slice(2),
          sku: opts.sku,
          name: item?.product ?? '',
          quantity: opts.suggestedQty ?? 1,
          unit: 'pcs',
          price: 0,
        },
      ]);
    } else {
      setRows([emptyRow()]);
    }
    setPurchaseNotes('');
    setIsPurchaseOpen(true);
  };

  const handleAddRow = () => setRows((prev) => [...prev, emptyRow()]);
  const handleRemoveRow = (id: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  const handleUpdateRow = (id: string, patch: Partial<PurchaseRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleSelectProduct = (rowId: string, sku: string) => {
    if (!sku) {
      handleUpdateRow(rowId, { sku: '', name: '' });
      return;
    }
    const item = items.find((i) => i.sku === sku);
    handleUpdateRow(rowId, { sku, name: item?.product ?? '' });
  };

  const purchaseTotal = rows.reduce((sum, r) => sum + r.quantity * r.price, 0);

  const handleSubmitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseSupplierId) return;
    const lineItems: PurchaseLineItem[] = rows
      .filter((r) => r.name.trim() && r.quantity > 0)
      .map((r) => ({
        sku: r.sku || undefined,
        name: r.name.trim(),
        quantity: r.quantity,
        unit: r.unit,
        price: r.price,
        total: r.quantity * r.price,
      }));
    if (lineItems.length === 0) return;

    const purchase = recordPurchase(purchaseSupplierId, lineItems, 0, purchaseNotes.trim());
    setIsPurchaseOpen(false);
    triggerToast(`Purchase invoice ${purchase.id} generated — PKR ${purchase.amount.toLocaleString()} — stock updated.`);
  };

  const purchaseSupplier = supplierById(purchaseSupplierId);

  const inventoryCards = [
    { title: 'Units On Hand', value: `${totalCurrentStock.toLocaleString()} units`, hint: `${items.length} tracked SKUs`, icon: Package, tone: 'info' as const },
    { title: 'Inventory Health', value: `${inventoryHealth}%`, hint: `${healthyItems.length} healthy / ${items.length} total`, icon: ShieldCheck, tone: inventoryHealth >= 75 ? 'success' as const : 'warning' as const },
    { title: 'Needs Attention', value: `${lowStockItems.length} SKUs`, hint: 'At or below reorder level', icon: BellRing, tone: lowStockItems.length ? 'danger' as const : 'success' as const },
    { title: 'Fastest Mover', value: topMover?.product ?? '—', hint: topMover ? `${topMover.stockOut.toLocaleString()} units issued` : 'No movement yet', icon: TrendingUp, tone: 'success' as const },
  ];

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
            Stock ledger, supplier directory, and purchase invoices in one workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'suppliers' && (
            <button
              type="button"
              onClick={() => setIsAddSupplierOpen(true)}
              className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg border border-outline-variant text-foreground text-xs font-semibold hover:bg-muted transition-all cursor-pointer"
            >
              <Plus className="size-3.5" />
              Add Supplier
            </button>
          )}
          <button
            type="button"
            onClick={() => handleOpenPurchase()}
            disabled={suppliers.length === 0}
            className="inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/85 active:scale-[0.98] transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            <PackagePlus className="size-3.5" />
            Record Purchase
          </button>
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
            {inventoryCards.map((card) => {
              const CardIcon = card.icon;
              return (
                <MetricCard
                  key={card.title}
                  label={card.title}
                  value={card.value}
                  hint={card.hint}
                  hintIcon={<CardIcon className="size-3.5" />}
                  tone={card.tone}
                />
              );
            })}
          </section>

          {/* Main Content Workspace Layout */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
            {/* Left Column: Current Stock Table (detailed ledger) */}
            <Card className="xl:col-span-9 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container-low/50">
                <div className="flex items-center gap-2">
                  <Package className="size-4 text-foreground" />
                  <h2 className="text-sm font-semibold tracking-tight">Stock Movement &amp; Current Ledger</h2>
                </div>
                <Badge tone="info">Audit Ledger</Badge>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <Table className="min-w-[950px]">
                  <THead>
                    <tr>
                      <Th>SKU</Th>
                      <Th>Product Name</Th>
                      <Th>Supplier</Th>
                      <Th className="text-right">Current Stock</Th>
                      <Th className="text-right">Reorder Threshold</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Actions</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {items.map((item) => {
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
                          <Td className="text-right font-mono text-muted-foreground">{item.reorder}</Td>
                          <Td>
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </Td>
                          <Td className="text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenPurchase({ supplierId: item.supplierId, sku: item.sku, suggestedQty: Math.max(item.reorder * 2 - item.current, item.reorder) })}
                              disabled={!item.supplierId}
                              title={item.supplierId ? 'Record purchase for this product' : 'Link a supplier to this product first'}
                              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-outline-variant text-[11px] font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ArrowDown className="size-3" />
                              Restock
                            </button>
                          </Td>
                        </TRow>
                      );
                    })}
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
                {lowStockItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-6">All stock levels are healthy.</p>
                ) : (
                  lowStockItems.map((item) => {
                    const status = getStatusInfo(item.current, item.reorder);
                    const supplier = supplierById(item.supplierId);
                    return (
                      <div key={item.sku} className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{item.product}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Stock is {status.label.toLowerCase()} ({item.current} units remaining).
                            </p>
                            <p className="text-[10px] text-outline mt-1">
                              {supplier ? `Supplier: ${supplier.name}` : 'No supplier linked'}
                            </p>
                          </div>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <button
                          onClick={() => handleOpenPurchase({ supplierId: item.supplierId, sku: item.sku, suggestedQty: Math.max(item.reorder * 2 - item.current, item.reorder) })}
                          disabled={!item.supplierId}
                          className="h-8 w-full rounded-lg border border-outline-variant text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Record Purchase
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
            <MetricCard label="Purchase Invoices" value={supplierInvoices.length} hint="All time" hintIcon={<PackagePlus className="size-3.5" />} />
            <MetricCard label="Total Purchases" value={`PKR ${totalPurchaseValue.toLocaleString()}`} hint="All billed purchases" hintIcon={<Wallet className="size-3.5" />} tone="info" />
            <MetricCard label="Avg Purchase" value={`PKR ${avgPurchase.toLocaleString()}`} hint="Per invoice" hintIcon={<Wallet className="size-3.5" />} />
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

          {/* Suppliers Table */}
          <Card className="overflow-hidden shadow-sm">
            <div className="overflow-x-auto custom-scrollbar">
              <Table className="min-w-[950px]">
                <THead>
                  <tr>
                    <Th>Supplier</Th>
                    <Th>Contact Person</Th>
                    <Th>Category</Th>
                    <Th className="text-right">Linked Products</Th>
                    <Th className="text-right">Lifetime Purchases</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </THead>
                <TBody>
                  {filteredSuppliers.length === 0 ? (
                    <TRow>
                      <Td colSpan={7} className="text-center text-muted-foreground italic py-8">
                        No suppliers match the search.
                      </Td>
                    </TRow>
                  ) : (
                    filteredSuppliers.map((supplier) => (
                      <TRow key={supplier.id} className="hover:bg-muted/30 transition-colors">
                        <Td>
                          <p className="font-bold text-foreground whitespace-nowrap">{supplier.name}</p>
                          <p className="text-[11px] text-muted-foreground">{supplier.phone}</p>
                        </Td>
                        <Td className="text-muted-foreground">{supplier.contactPerson || '—'}</Td>
                        <Td>
                          <span className="inline-block px-2 py-0.5 bg-surface-container text-on-surface-variant text-[11px] rounded font-medium">
                            {supplier.category}
                          </span>
                        </Td>
                        <Td className="text-right font-mono font-semibold text-foreground">
                          {linkedProductsOf(supplier.id).length}
                        </Td>
                        <Td className="text-right font-mono font-bold text-primary">
                          PKR {lifetimeOf(supplier.id).toLocaleString()}
                        </Td>
                        <Td>
                          <Badge tone={supplier.status === 'Active' ? 'success' : 'neutral'}>{supplier.status}</Badge>
                        </Td>
                        <Td className="text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenPurchase({ supplierId: supplier.id })}
                            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-outline-variant text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                          >
                            <PackagePlus className="size-3.5" />
                            Record Purchase
                          </button>
                        </Td>
                      </TRow>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
          </Card>

          {/* Recent Purchase Invoices */}
          <Card className="overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container-low/50">
              <h2 className="text-sm font-semibold tracking-tight">Recent Purchase Invoices</h2>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <Table className="min-w-[700px]">
                <THead>
                  <tr>
                    <Th>Invoice ID</Th>
                    <Th>Supplier</Th>
                    <Th>Date</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </THead>
                <TBody>
                  {supplierInvoices.length === 0 ? (
                    <TRow>
                      <Td colSpan={4} className="text-center text-muted-foreground italic py-8">No purchase invoices yet.</Td>
                    </TRow>
                  ) : (
                    supplierInvoices.slice(0, 6).map((inv) => (
                      <TRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <Td className="font-mono text-xs font-bold text-primary">{inv.id}</Td>
                        <Td className="font-semibold text-foreground">{inv.supplierName}</Td>
                        <Td className="font-mono text-xs text-muted-foreground">{inv.date}</Td>
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
          <CheckCircle2 className="size-4" />
          {toast}
        </div>
      )}

      {/* Add Supplier Modal */}
      {isAddSupplierOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl border border-outline-variant">
            <form onSubmit={handleAddSupplier} className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-primary text-base">Add Supplier</h3>
                <button type="button" onClick={() => setIsAddSupplierOpen(false)} className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors">×</button>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">Supplier Name</span>
                <input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Al-Madina Grain Traders" className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">Contact Person</span>
                <input value={newContact} onChange={(e) => setNewContact(e.target.value)} placeholder="e.g. Hassan Ali" className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">Phone</span>
                <input required value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+92 3XX XXXXXXX" className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">Category</span>
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary bg-white">
                  <option>Grains &amp; Pulses</option>
                  <option>Spices</option>
                  <option>Dairy &amp; Beverages</option>
                  <option>General Goods</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">Address</span>
                <input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="Warehouse / market address" className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
              </label>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setIsAddSupplierOpen(false)} className="px-4 py-2 border border-outline-variant text-muted-foreground rounded-lg hover:bg-muted transition-all text-xs font-bold">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 active:scale-95 transition-all text-xs font-bold">Add Supplier</button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Record Purchase Drawer */}
      {isPurchaseOpen && typeof document !== 'undefined' && createPortal(
        <>
          <button
            type="button"
            aria-label="Close purchase form"
            className="fixed inset-0 z-[100] cursor-default bg-inverse-surface/60 backdrop-blur-xs"
            onClick={() => setIsPurchaseOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-title"
            className="fixed inset-y-0 right-0 z-[101] flex h-dvh flex-col border-l border-outline-variant bg-card shadow-2xl animate-fade-in"
            style={{ width: 'min(100vw, 32rem)' }}
          >
            <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
              <div className="flex items-center gap-2">
                <PackagePlus className="size-4 text-primary" />
                <h2 id="purchase-title" className="text-sm font-semibold text-foreground">Record Purchase</h2>
              </div>
              <button type="button" onClick={() => setIsPurchaseOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-lg font-bold text-muted-foreground hover:bg-muted">×</button>
            </div>
            <form onSubmit={handleSubmitPurchase} className="flex-1 flex flex-col overflow-y-auto">
              <div className="p-5 space-y-4 flex-1">
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-muted-foreground">Supplier</span>
                  <select
                    value={purchaseSupplierId}
                    onChange={(e) => {
                      setPurchaseSupplierId(e.target.value);
                      setRows([emptyRow()]);
                    }}
                    className="w-full rounded-lg border border-outline-variant bg-card p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                    ))}
                  </select>
                </label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">Items Purchased</span>
                    <button type="button" onClick={handleAddRow} className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                      <Plus className="size-3.5" /> Add item
                    </button>
                  </div>
                  {rows.map((row) => (
                    <div key={row.id} className="rounded-lg border border-outline-variant p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          className="flex-1 rounded-lg border border-outline-variant bg-card p-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          value={row.sku}
                          onChange={(e) => handleSelectProduct(row.id, e.target.value)}
                        >
                          <option value="">+ New product</option>
                          {supplierProducts.map((p) => (
                            <option key={p.sku} value={p.sku}>{p.product} ({p.current} in stock)</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.id)}
                          disabled={rows.length === 1}
                          className="flex items-center justify-center text-error opacity-60 hover:opacity-100 disabled:opacity-20 transition-opacity shrink-0"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {row.sku === '' && (
                        <input
                          className="w-full rounded-lg border border-outline-variant bg-card p-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          placeholder="New product name"
                          value={row.name}
                          onChange={(e) => handleUpdateRow(row.id, { name: e.target.value })}
                        />
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="number"
                          min="1"
                          className="rounded-lg border border-outline-variant bg-card p-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
                          placeholder="Qty"
                          value={row.quantity}
                          onChange={(e) => handleUpdateRow(row.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                        />
                        <input
                          className="rounded-lg border border-outline-variant bg-card p-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          placeholder="Unit"
                          value={row.unit}
                          onChange={(e) => handleUpdateRow(row.id, { unit: e.target.value })}
                        />
                        <input
                          type="number"
                          min="0"
                          className="rounded-lg border border-outline-variant bg-card p-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
                          placeholder="Price"
                          value={row.price}
                          onChange={(e) => handleUpdateRow(row.id, { price: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-bold text-muted-foreground">Notes (optional)</span>
                  <textarea
                    rows={2}
                    value={purchaseNotes}
                    onChange={(e) => setPurchaseNotes(e.target.value)}
                    placeholder="Delivery reference, batch notes..."
                    className="w-full resize-none rounded-lg border border-outline-variant bg-card p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </label>

                <div className="rounded-lg border border-success/30 bg-success-light p-3 text-xs text-success-text">
                  {purchaseSupplier ? `Purchasing from ${purchaseSupplier.name}. ` : ''}
                  Total: <strong>PKR {purchaseTotal.toLocaleString()}</strong>
                  <p className="text-[10px] text-success-text/80 mt-1">
                    Existing products restock that exact SKU. New product names create a tracked SKU linked to this supplier.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 border-t border-outline-variant p-5">
                <button type="button" onClick={() => setIsPurchaseOpen(false)} className="flex-1 rounded-lg border border-outline-variant py-3 text-xs font-bold text-muted-foreground hover:bg-muted">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-primary py-3 text-xs font-bold text-primary-foreground hover:bg-primary/85">Generate Invoice</button>
              </div>
            </form>
          </aside>
        </>,
        document.body,
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
