'use client';

// PurchaseDrawer — the single, realistic restock flow shared by:
//   1. Inventory row "Restock" (product fixed, pick/confirm a supplier)
//   2. Supplier detail page "Create Purchase" (supplier fixed, pick a product)
//   3. Generic "Restock" from the page header (pick both)
//
// A restock either Confirms immediately (stock updates now) or Saves as
// Draft (recorded but stock only moves once confirmed later).

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PackagePlus, Plus } from 'lucide-react';
import { useApp, type SupplierInvoice } from '@/context/AppContext';

interface PurchaseDrawerProps {
  open: boolean;
  onClose: () => void;
  onSubmitted?: (purchase: SupplierInvoice) => void;
  /** Opened from a specific inventory row — product is fixed, not pickable. */
  fixedSku?: string;
  /** Opened from a supplier's page — preselects that supplier. */
  initialSupplierId?: string;
  suggestedQuantity?: number;
}

const todayStr = () => new Date().toISOString().split('T')[0];

export function PurchaseDrawer({
  open,
  onClose,
  onSubmitted,
  fixedSku,
  initialSupplierId,
  suggestedQuantity,
}: PurchaseDrawerProps) {
  const { suppliers, supplierInvoices, inventory, addSupplier, recordPurchase } = useApp();

  const fixedItem = fixedSku ? inventory.find((i) => i.sku === fixedSku) : undefined;

  // Suppliers that have historically supplied this exact product name —
  // used to order the dropdown: preferred first, then other linked suppliers.
  const linkedSupplierIds = useMemo(() => {
    if (!fixedItem) return [];
    const ids = new Set<string>();
    for (const inv of supplierInvoices) {
      if (inv.items.some((it) => it.name.toLowerCase() === fixedItem.product.toLowerCase())) {
        ids.add(inv.supplierId);
      }
    }
    return Array.from(ids);
  }, [fixedItem, supplierInvoices]);

  const supplierOptions = useMemo(() => {
    if (!fixedItem) return suppliers;
    const preferredId = fixedItem.supplierId;
    const ordered: typeof suppliers = [];
    if (preferredId) {
      const preferred = suppliers.find((s) => s.id === preferredId);
      if (preferred) ordered.push(preferred);
    }
    for (const id of linkedSupplierIds) {
      if (id === preferredId) continue;
      const s = suppliers.find((sup) => sup.id === id);
      if (s) ordered.push(s);
    }
    return ordered.length ? ordered : suppliers;
  }, [fixedItem, suppliers, linkedSupplierIds]);

  // Callers only mount this drawer while `open` is true (see inventory/page.tsx
  // and the supplier detail page), so each open is a fresh mount — these
  // initial values double as the reset, no effect needed.
  const [supplierId, setSupplierId] = useState(
    () => initialSupplierId ?? supplierOptions[0]?.id ?? suppliers[0]?.id ?? '',
  );
  const [productSku, setProductSku] = useState(''); // '' = new product (only used when !fixedSku)
  const [newProductName, setNewProductName] = useState('');
  const [quantity, setQuantity] = useState(() => String(suggestedQuantity ?? 1));
  const [purchasePrice, setPurchasePrice] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayStr);
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierCategory, setSupplierCategory] = useState('General Goods');

  const supplierProducts = useMemo(
    () => (supplierId ? inventory.filter((i) => i.supplierId === supplierId) : []),
    [inventory, supplierId],
  );

  if (!open || typeof document === 'undefined') return null;

  const productLabel = fixedItem?.product ?? (productSku ? inventory.find((i) => i.sku === productSku)?.product : '');
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  const total = parseFloat(purchasePrice) || 0;

  const handleSupplierSelect = (value: string) => {
    if (value === '__new__') {
      setIsAddingSupplier(true);
      return;
    }
    setSupplierId(value);
    setProductSku('');
  };

  const submit = (status: 'Draft' | 'Paid') => {
    let resolvedSupplierId = supplierId;

    if (isAddingSupplier) {
      if (!supplierName.trim() || !supplierPhone.trim()) return;
      const created = addSupplier({
        name: supplierName.trim(),
        contactPerson: supplierContact.trim(),
        phone: supplierPhone.trim(),
        category: supplierCategory,
        address: '',
        status: 'Active',
        notes: '',
      });
      resolvedSupplierId = created.id;
    }

    if (!resolvedSupplierId) return;
    const name = fixedItem?.product ?? (productSku ? inventory.find((i) => i.sku === productSku)?.product : newProductName.trim());
    if (!name) return;
    if (total <= 0) return;

    const purchase = recordPurchase(
      resolvedSupplierId,
      [
        {
          sku: fixedItem?.sku ?? productSku ?? undefined,
          name,
          quantity: qty,
          unit: 'pcs',
          price: Math.round((total / qty) * 100) / 100,
          total,
        },
      ],
      0,
      '',
      { status, invoiceNumber: invoiceNumber.trim() || undefined, date: purchaseDate },
    );
    onSubmitted?.(purchase);
    onClose();
  };

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close restock form"
        className="fixed inset-0 z-[100] cursor-default bg-inverse-surface/60 backdrop-blur-xs"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="restock-title"
        className="fixed inset-y-0 right-0 z-[101] flex h-dvh flex-col border-l border-outline-variant bg-card shadow-2xl animate-fade-in"
        style={{ width: 'min(100vw, 28rem)' }}
      >
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low px-5 py-4">
          <div className="flex items-center gap-2">
            <PackagePlus className="size-4 text-primary" />
            <h2 id="restock-title" className="text-sm font-semibold text-foreground">
              {fixedItem ? `Restock ${fixedItem.product}` : 'Record Purchase'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-lg font-bold text-muted-foreground hover:bg-muted">×</button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit('Paid');
          }}
          className="flex-1 flex flex-col overflow-y-auto"
        >
          <div className="p-5 space-y-4 flex-1">
            {!fixedItem && (
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">Product</span>
                <select
                  value={productSku}
                  onChange={(e) => setProductSku(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-card p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">+ New product</option>
                  {supplierProducts.map((p) => (
                    <option key={p.sku} value={p.sku}>{p.product} ({p.current} in stock)</option>
                  ))}
                </select>
              </label>
            )}
            {!fixedItem && !productSku && (
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">New product name</span>
                <input
                  required
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. Basmati Rice 5kg"
                  className="w-full rounded-lg border border-outline-variant bg-card p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>
            )}
            {fixedItem && (
              <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-xs text-muted-foreground">
                Product: <strong className="text-foreground">{productLabel}</strong> · Currently <strong>{fixedItem.current}</strong> in stock
              </div>
            )}

            <label className="block space-y-1">
              <span className="text-xs font-bold text-muted-foreground">Quantity</span>
              <input
                required
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border border-outline-variant bg-card p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
              />
            </label>

            <div className="space-y-1">
              <span className="text-xs font-bold text-muted-foreground">Supplier</span>
              {!isAddingSupplier ? (
                <select
                  value={supplierId}
                  onChange={(e) => handleSupplierSelect(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-card p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {supplierOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{fixedItem?.supplierId === s.id ? ' (preferred)' : ''}
                    </option>
                  ))}
                  <option value="__new__">+ Add New Supplier</option>
                </select>
              ) : (
                <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-foreground flex items-center gap-1">
                      <Plus className="size-3" /> New Supplier
                    </span>
                    <button type="button" onClick={() => setIsAddingSupplier(false)} className="text-[11px] text-muted-foreground hover:underline">Cancel</button>
                  </div>
                  <input required placeholder="Supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full rounded-lg border border-outline-variant bg-card p-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  <input placeholder="Contact person" value={supplierContact} onChange={(e) => setSupplierContact(e.target.value)} className="w-full rounded-lg border border-outline-variant bg-card p-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  <input required placeholder="Phone" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} className="w-full rounded-lg border border-outline-variant bg-card p-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                  <select value={supplierCategory} onChange={(e) => setSupplierCategory(e.target.value)} className="w-full rounded-lg border border-outline-variant bg-card p-2 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary">
                    <option>Grains &amp; Pulses</option>
                    <option>Spices</option>
                    <option>Dairy &amp; Beverages</option>
                    <option>General Goods</option>
                    <option>Other</option>
                  </select>
                </div>
              )}
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-muted-foreground">Purchase price (PKR)</span>
              <input
                required
                type="number"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="Total amount paid"
                className="w-full rounded-lg border border-outline-variant bg-card p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">Invoice number</span>
                <input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-outline-variant bg-card p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-muted-foreground">Purchase date</span>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-card p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>

            {qty > 0 && total > 0 && (
              <div className="rounded-lg border border-success/30 bg-success-light p-3 text-xs text-success-text">
                {qty} units at PKR {(total / qty).toFixed(0)}/unit avg — total <strong>PKR {total.toLocaleString()}</strong>
              </div>
            )}
          </div>
          <div className="flex gap-3 border-t border-outline-variant p-5">
            <button
              type="button"
              onClick={() => submit('Draft')}
              className="flex-1 rounded-lg border border-outline-variant py-3 text-xs font-bold text-muted-foreground hover:bg-muted"
            >
              Save as Draft
            </button>
            <button type="submit" className="flex-1 rounded-lg bg-primary py-3 text-xs font-bold text-primary-foreground hover:bg-primary/85">
              Confirm Restock
            </button>
          </div>
        </form>
      </aside>
    </>,
    document.body,
  );
}
