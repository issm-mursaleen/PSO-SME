'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  ChevronRight,
  Package,
  PackagePlus,
  Pencil,
  Phone,
  Plus,
  Wallet,
} from 'lucide-react';
import { Badge, Card, MetricCard, Table, TBody, Td, Th, THead, TRow } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { PurchaseDrawer } from '@/components/inventory/PurchaseDrawer';
import { SupplierModal } from '@/components/inventory/SupplierModal';
import { ProductModal } from '@/components/inventory/ProductModal';

const getStatusInfo = (current: number, reorder: number) => {
  if (current <= 0) return { label: 'Out of Stock', tone: 'danger' as const };
  if (current <= reorder) return { label: 'Low Stock', tone: 'warning' as const };
  return { label: 'Healthy', tone: 'success' as const };
};

export default function SupplierDetail({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const { id } = use(paramsPromise);
  const { suppliers, inventory, supplierInvoices, confirmDraftPurchase } = useApp();

  const [toast, setToast] = useState<string | null>(null);
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);

  const triggerToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  };

  const supplier = suppliers.find((s) => s.id === id);

  if (!supplier) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-bold text-error">Supplier Not Found</h2>
        <p className="text-on-surface-variant mt-2">The requested supplier record does not exist.</p>
        <Link href="/inventory?tab=suppliers" className="mt-4 inline-block text-primary hover:underline font-bold">
          ← Back to Suppliers
        </Link>
      </div>
    );
  }

  const suppliedProducts = inventory.filter((i) => i.supplierId === supplier.id);
  const invoices = supplierInvoices
    .filter((inv) => inv.supplierId === supplier.id)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const paidInvoices = invoices.filter((inv) => inv.status === 'Paid');
  const draftInvoices = invoices.filter((inv) => inv.status === 'Draft');
  const totalPurchases = paidInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const outstanding = draftInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-label-md text-on-surface-variant text-xs font-bold">
        <Link href="/inventory?tab=suppliers" className="hover:text-primary">Suppliers</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-primary font-bold">{supplier.name}</span>
      </nav>

      {/* Header */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-fixed text-primary flex items-center justify-center font-bold text-lg shrink-0">
              <Building2 className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground tracking-tight">{supplier.name}</h2>
                <Badge tone={supplier.status === 'Active' ? 'success' : 'neutral'}>{supplier.status}</Badge>
              </div>
              <p className="text-xs text-on-surface-variant font-medium mt-1">
                Contact: {supplier.contactPerson || '—'} · {supplier.category}
              </p>
              <p className="text-xs text-outline mt-0.5 flex items-center gap-1">
                <Phone className="size-3" /> {supplier.phone}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsPurchaseOpen(true)}
              className="px-4 py-2 bg-primary text-on-primary font-bold text-xs rounded-lg hover:opacity-90 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <PackagePlus className="size-4" />
              Create Purchase
            </button>
            <button
              type="button"
              onClick={() => setIsAddProductOpen(true)}
              className="px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface-variant font-bold text-xs rounded-lg hover:bg-surface-container transition-all flex items-center gap-1.5"
            >
              <Plus className="size-4" />
              Add Supplied Product
            </button>
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface-variant font-bold text-xs rounded-lg hover:bg-surface-container transition-all flex items-center gap-1.5"
            >
              <Pencil className="size-4" />
              Edit Supplier
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Purchases" value={`PKR ${totalPurchases.toLocaleString()}`} hint="Confirmed & paid" hintIcon={<Wallet className="size-3.5" />} tone="info" />
        <MetricCard label="Products Supplied" value={suppliedProducts.length} hint="Linked to this supplier" hintIcon={<Package className="size-3.5" />} />
        <MetricCard label="Purchase Invoices" value={invoices.length} hint="All time" hintIcon={<PackagePlus className="size-3.5" />} />
        <MetricCard label="Outstanding" value={`PKR ${outstanding.toLocaleString()}`} hint={`${draftInvoices.length} draft invoices`} hintIcon={<Wallet className="size-3.5" />} tone={draftInvoices.length ? 'warning' : 'success'} />
      </section>

      {/* Supplied Products */}
      <Card className="overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container-low/50">
          <h3 className="text-sm font-semibold tracking-tight">Supplied Products</h3>
          <Badge tone="info">{suppliedProducts.length} products</Badge>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <Table className="min-w-[700px]">
            <THead>
              <tr>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th className="text-right">Current Stock</Th>
                <Th className="text-right">Reorder Level</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <TBody>
              {suppliedProducts.length === 0 ? (
                <TRow>
                  <Td colSpan={5} className="text-center text-muted-foreground italic py-8">
                    No products linked to this supplier yet.
                  </Td>
                </TRow>
              ) : (
                suppliedProducts.map((item) => {
                  const status = getStatusInfo(item.current, item.reorder);
                  return (
                    <TRow key={item.sku} className="hover:bg-muted/30 transition-colors">
                      <Td className="font-mono text-xs font-semibold text-foreground">{item.sku}</Td>
                      <Td className="font-bold text-foreground whitespace-nowrap">{item.product}</Td>
                      <Td className="text-right font-mono font-bold">{item.current}</Td>
                      <Td className="text-right font-mono text-muted-foreground">{item.reorder}</Td>
                      <Td><Badge tone={status.tone}>{status.label}</Badge></Td>
                    </TRow>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
      </Card>

      {/* Purchase History / Payment History */}
      <Card className="overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container-low/50">
          <h3 className="text-sm font-semibold tracking-tight">Purchase &amp; Payment History</h3>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <Table className="min-w-[800px]">
            <THead>
              <tr>
                <Th>Invoice ID</Th>
                <Th>Date</Th>
                <Th>Items</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </THead>
            <TBody>
              {invoices.length === 0 ? (
                <TRow>
                  <Td colSpan={6} className="text-center text-muted-foreground italic py-8">
                    No purchase history with this supplier yet.
                  </Td>
                </TRow>
              ) : (
                invoices.map((inv) => (
                  <TRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                    <Td className="font-mono text-xs font-bold text-primary">
                      {inv.id}
                      {inv.invoiceNumber && <span className="block text-[10px] text-muted-foreground font-normal">Ref: {inv.invoiceNumber}</span>}
                    </Td>
                    <Td className="font-mono text-xs text-muted-foreground">{inv.date}</Td>
                    <Td className="text-xs text-muted-foreground">{inv.items.map((it) => it.name).join(', ')}</Td>
                    <Td><Badge tone={inv.status === 'Paid' ? 'success' : 'warning'}>{inv.status}</Badge></Td>
                    <Td className="text-right font-mono font-bold">PKR {inv.amount.toLocaleString()}</Td>
                    <Td className="text-right">
                      {inv.status === 'Draft' && (
                        <button
                          type="button"
                          onClick={() => {
                            const confirmed = confirmDraftPurchase(inv.id);
                            if (confirmed) triggerToast(`${confirmed.id} confirmed — stock updated.`);
                          }}
                          className="inline-flex items-center h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/85 transition-colors"
                        >
                          Confirm &amp; Receive
                        </button>
                      )}
                    </Td>
                  </TRow>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </Card>

      {/* Supplier Notes */}
      <Card className="overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container-low/50">
          <h3 className="text-sm font-semibold tracking-tight">Supplier Notes</h3>
        </div>
        <div className="p-4">
          {supplier.notes ? (
            <p className="text-sm text-foreground whitespace-pre-wrap">{supplier.notes}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">No notes yet. Use Edit Supplier to add delivery schedule, payment terms, or reliability notes.</p>
          )}
          <p className="text-[11px] text-outline mt-3">{supplier.address || 'No address on file.'}</p>
        </div>
      </Card>

      {toast && (
        <div role="status" className="fixed bottom-5 right-5 z-[110] flex items-center gap-2 rounded-lg border border-success/30 bg-card px-4 py-3 text-xs font-semibold text-success-text shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {isPurchaseOpen && (
        <PurchaseDrawer
          open
          onClose={() => setIsPurchaseOpen(false)}
          initialSupplierId={supplier.id}
          onSubmitted={(purchase) =>
            triggerToast(
              purchase.status === 'Draft'
                ? `Draft purchase ${purchase.id} saved — confirm it later to receive stock.`
                : `Purchase invoice ${purchase.id} confirmed — stock updated.`,
            )
          }
        />
      )}

      {isEditOpen && (
        <SupplierModal
          open
          onClose={() => setIsEditOpen(false)}
          editingSupplierId={supplier.id}
          onSaved={() => triggerToast('Supplier updated.')}
        />
      )}

      {isAddProductOpen && (
        <ProductModal
          open
          onClose={() => setIsAddProductOpen(false)}
          defaultSupplierId={supplier.id}
          onSaved={() => triggerToast(`Product linked to ${supplier.name}.`)}
        />
      )}
    </div>
  );
}
