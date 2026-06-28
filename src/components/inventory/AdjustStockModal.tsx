'use client';

// AdjustStockModal — a manual correction (recount, damage, write-off),
// independent of any purchase. Always tied to one specific product.

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal } from 'lucide-react';
import { useApp } from '@/context/AppContext';

interface AdjustStockModalProps {
  open: boolean;
  onClose: () => void;
  sku: string;
  onAdjusted?: () => void;
}

// Callers only mount this while `open` is true (see inventory/page.tsx), so
// each open is a fresh mount — these initial values double as the reset.
export function AdjustStockModal({ open, onClose, sku, onAdjusted }: AdjustStockModalProps) {
  const { inventory, adjustStock } = useApp();
  const item = inventory.find((i) => i.sku === sku);

  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');

  if (!open || !item || typeof document === 'undefined') return null;

  const delta = Math.max(1, parseInt(amount, 10) || 1) * (direction === 'add' ? 1 : -1);
  const projected = Math.max(0, item.current + delta);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    adjustStock(sku, delta, reason.trim());
    onAdjusted?.();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl w-full max-w-112 overflow-hidden shadow-xl border border-outline-variant">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-primary text-base flex items-center gap-2">
              <SlidersHorizontal className="size-4" />
              Adjust Stock — {item.product}
            </h3>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors">×</button>
          </div>
          <p className="text-xs text-muted-foreground">Currently <strong className="text-foreground">{item.current}</strong> units on hand.</p>

          <div className="flex bg-surface-container p-1 rounded-lg">
            {(['add', 'remove'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                  direction === d ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {d === 'add' ? 'Add Stock' : 'Remove Stock'}
              </button>
            ))}
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Quantity</span>
            <input
              required
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Reason</span>
            <input
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged packaging, stock recount"
              className="w-full rounded-lg border border-outline-variant p-3 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </label>

          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-xs text-muted-foreground">
            New stock level: <strong className="text-foreground">{projected}</strong> units
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-outline-variant text-muted-foreground rounded-lg hover:bg-muted transition-all text-xs font-bold">Cancel</button>
            <button type="submit" className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 active:scale-95 transition-all text-xs font-bold">Save Adjustment</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
