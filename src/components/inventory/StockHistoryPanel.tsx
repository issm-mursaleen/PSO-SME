'use client';

// StockHistoryPanel — every movement (restock, adjustment, sale) for one SKU.

import React from 'react';
import { createPortal } from 'react-dom';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useApp } from '@/context/AppContext';

interface StockHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  sku: string;
}

const movementTone = (type: string) =>
  type === 'Restock' ? ('success' as const) : type === 'Sale' ? ('info' as const) : ('warning' as const);

export function StockHistoryPanel({ open, onClose, sku }: StockHistoryPanelProps) {
  const { inventory, stockMovements } = useApp();
  const item = inventory.find((i) => i.sku === sku);
  const movements = stockMovements
    .filter((m) => m.sku === sku)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!open || !item || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl w-full max-w-128 max-h-[80vh] overflow-hidden shadow-xl border border-outline-variant flex flex-col">
        <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between gap-3">
          <h3 className="font-bold text-primary text-base flex items-center gap-2">
            <History className="size-4" />
            Stock History — {item.product}
          </h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors">×</button>
        </div>
        <div className="overflow-y-auto custom-scrollbar p-4 space-y-2">
          {movements.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-8">No movements recorded for this product yet.</p>
          ) : (
            movements.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low/40 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={movementTone(m.type)}>{m.type}</Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">{m.date}</span>
                  </div>
                  <p className="text-xs text-foreground mt-1">{m.note}</p>
                  {m.reference && <p className="text-[10px] text-muted-foreground mt-0.5">Ref: {m.reference}</p>}
                </div>
                <span className={`font-mono text-sm font-bold shrink-0 ${m.quantity >= 0 ? 'text-success-text' : 'text-error'}`}>
                  {m.quantity >= 0 ? '+' : ''}{m.quantity}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
