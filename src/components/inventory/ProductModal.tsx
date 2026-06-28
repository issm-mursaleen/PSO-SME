'use client';

// ProductModal — Add Product (with opening stock) or Edit Product (metadata
// only; stock levels change via Restock/Adjust, not here).

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Package } from 'lucide-react';
import { useApp } from '@/context/AppContext';

interface ProductModalProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing product; omitted when adding new. */
  editingSku?: string;
  /** Preselect a supplier (e.g. opened from that supplier's detail page). */
  defaultSupplierId?: string;
  onSaved?: () => void;
}

// Callers only mount this while `open` is true, so each open is a fresh
// mount — these initial values (derived from `editing`) double as the reset.
export function ProductModal({ open, onClose, editingSku, defaultSupplierId, onSaved }: ProductModalProps) {
  const { inventory, suppliers, addInventoryItem, updateInventoryItem } = useApp();
  const editing = editingSku ? inventory.find((i) => i.sku === editingSku) : undefined;
  const isEdit = Boolean(editing);

  const [name, setName] = useState(() => editing?.product ?? '');
  const [category, setCategory] = useState(() => editing?.category ?? 'Grocery');
  const [reorder, setReorder] = useState(() => String(editing?.reorder ?? 10));
  const [initialStock, setInitialStock] = useState('0');
  const [supplierId, setSupplierId] = useState(() => editing?.supplierId ?? defaultSupplierId ?? '');

  if (!open || typeof document === 'undefined') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const reorderNum = Math.max(0, parseInt(reorder, 10) || 0);

    if (isEdit && editingSku) {
      updateInventoryItem(editingSku, {
        product: name.trim(),
        category: category.trim() || 'Uncategorized',
        reorder: reorderNum,
        supplierId: supplierId || undefined,
      });
    } else {
      const sku = `SKU-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 100)}`;
      addInventoryItem({
        sku,
        product: name.trim(),
        category: category.trim() || 'Uncategorized',
        current: Math.max(0, parseInt(initialStock, 10) || 0),
        reorder: reorderNum,
        route: '—',
        supplierId: supplierId || undefined,
      });
    }
    onSaved?.();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl w-full max-w-112 overflow-hidden shadow-xl border border-outline-variant">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-primary text-base flex items-center gap-2">
              <Package className="size-4" />
              {isEdit ? `Edit ${editing?.product}` : 'Add Product'}
            </h3>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors">×</button>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Product Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cooking Oil 5L" className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-muted-foreground">Category</span>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Grocery" className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-muted-foreground">Reorder Level</span>
              <input type="number" min="0" value={reorder} onChange={(e) => setReorder(e.target.value)} className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono" />
            </label>
          </div>

          {!isEdit && (
            <label className="block space-y-1">
              <span className="text-xs font-bold text-muted-foreground">Initial Stock</span>
              <input type="number" min="0" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono" />
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Preferred Supplier</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary bg-white">
              <option value="">No supplier yet</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-outline-variant text-muted-foreground rounded-lg hover:bg-muted transition-all text-xs font-bold">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 active:scale-95 transition-all text-xs font-bold">{isEdit ? 'Save Changes' : 'Add Product'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
