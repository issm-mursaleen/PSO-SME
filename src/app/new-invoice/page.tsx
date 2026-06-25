'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp, InvoiceItem } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

interface InvoiceRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

// Preset catalog for autocomplete + price/unit autofill
const PRODUCT_CATALOG = [
  { name: 'Bread Large', price: 120, unit: 'pcs' },
  { name: 'Milk 1 Litre', price: 260, unit: 'pcs' },
  { name: 'Cooking Oil 1L', price: 155, unit: 'pcs' },
  { name: 'Basmati Rice 10kg', price: 1800, unit: 'bag' },
  { name: 'Basmati Rice 1kg', price: 250, unit: 'kg' },
  { name: 'Dal Chana 1kg', price: 320, unit: 'kg' },
  { name: 'Tapal Danedar 500g', price: 450, unit: 'box' },
  { name: 'Nestle Milkpak', price: 280, unit: 'litre' },
  { name: 'Olpers Cream', price: 160, unit: 'pcs' },
  { name: 'Surf Excel 1kg', price: 650, unit: 'bag' },
  { name: 'Coca Cola 1.5L', price: 150, unit: 'pcs' },
  { name: 'Lays Chips Family Pack', price: 100, unit: 'pcs' },
  { name: 'Sensodyne Toothpaste', price: 220, unit: 'pcs' },
  { name: 'Cadbury Dairy Milk', price: 180, unit: 'pcs' },
];

export default function NewInvoice() {
  const router = useRouter();
  const { customers, recordSale, sendWhatsAppReminder } = useApp();

  const [selectedCustomerId, setSelectedCustomerId] = useState('walk-in');
  const [dueDate, setDueDate] = useState('');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('Payment terms: Net 7 days. Thank you for your business.');

  const [rows, setRows] = useState<InvoiceRow[]>([
    { id: '1', name: 'Cooking Oil 1L', quantity: 5, unit: 'pcs', price: 155 },
    { id: '2', name: 'Basmati Rice 1kg', quantity: 5, unit: 'kg', price: 250 },
  ]);

  // The invoice ID is only a draft placeholder for the preview; the real ID is
  // produced by recordSale on save and shown in the confirmation. Both this and
  // today's date are generated after mount to avoid server/client hydration drift.
  const [draftId, setDraftId] = useState('INV-…');
  const [todayStr, setTodayStr] = useState('');
  const [savedInvoiceId, setSavedInvoiceId] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Default due date = 7 days from now; also set draft id + today (client-only)
  useEffect(() => {
    const d = new Date();
    setTodayStr(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    setDraftId(`INV-${Math.floor(Math.random() * 1000 + 2042)}`);
    d.setDate(d.getDate() + 7);
    setDueDate(d.toISOString().split('T')[0]);
  }, []);

  const selectedCustomerInfo = customers.find((c) => c.id === selectedCustomerId) || {
    id: 'walk-in',
    name: 'Walk-in Customer',
    neighborhood: 'Karachi Central',
    phone: '',
    balance: 0,
  };

  // Calculations
  const subtotal = rows.reduce((sum, r) => sum + r.quantity * r.price, 0);
  const discountVal = parseFloat(discount) || 0;
  const grandTotal = Math.max(0, subtotal - discountVal);
  const totalItems = rows.reduce((sum, r) => sum + r.quantity, 0);

  const triggerToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, { id: Date.now().toString(), name: '', quantity: 1, unit: 'pcs', price: 0 }]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length > 1) setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: keyof InvoiceRow, value: string | number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  // Autocomplete: fill price + unit when a catalog item is picked
  const handleProductChange = (id: string, value: string) => {
    const matched = PRODUCT_CATALOG.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? matched
            ? { ...r, name: matched.name, price: matched.price, unit: matched.unit }
            : { ...r, name: value }
          : r
      )
    );
    if (matched) triggerToast(`Autofilled: ${matched.name}`, 'success');
  };

  const validate = (): boolean => {
    if (rows.some((r) => !r.name.trim())) {
      triggerToast('Every line item needs a product name.', 'error');
      return false;
    }
    if (rows.some((r) => r.price <= 0)) {
      triggerToast('Unit price must be greater than zero.', 'error');
      return false;
    }
    if (rows.some((r) => r.quantity < 1)) {
      triggerToast('Quantity must be at least 1.', 'error');
      return false;
    }
    return true;
  };

  const handleSaveInvoice = () => {
    if (isSaving) return;
    if (!validate()) return;

    setIsSaving(true);
    triggerToast('Generating credit invoice...', 'info');

    setTimeout(() => {
      const invoiceItems: InvoiceItem[] = rows.map((r) => ({
        name: r.name.trim(),
        quantity: r.quantity,
        unit: r.unit,
        price: r.price,
        total: r.quantity * r.price,
      }));

      // Record as Credit Sale (Udhar); use the REAL id returned for confirmation
      const saved = recordSale(selectedCustomerId, 'Udhar', invoiceItems, discountVal, notes, 0);

      setSavedInvoiceId(saved.id);
      setIsSaving(false);
      setShowSuccess(true);

      setTimeout(() => router.push('/invoices'), 1800);
    }, 900);
  };

  const handleWhatsAppDraft = () => {
    if (!validate()) return;
    const summary = `Salam ${selectedCustomerInfo.name}, here is your invoice draft from ALARA SME. Total: PKR ${grandTotal.toLocaleString()}, due ${dueDate}. Shukriya.`;
    if (selectedCustomerId !== 'walk-in') {
      sendWhatsAppReminder(selectedCustomerId, summary);
      triggerToast(`Draft sent to ${selectedCustomerInfo.name} on WhatsApp.`, 'success');
    } else {
      navigator.clipboard?.writeText(summary);
      triggerToast('Draft copied to clipboard for walk-in customer.', 'success');
    }
  };

  return (
    <div className="p-6">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes inv-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes inv-scale-up { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .inv-fade-in { animation: inv-fade-in 0.2s ease-out forwards; }
        .inv-scale-up { animation: inv-scale-up 0.22s cubic-bezier(0.16,1,0.3,1) forwards; }
      ` }} />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[110] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold bg-white text-stone-900 border-stone-500/20 inv-scale-up">
          <Icon name={toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'cancel' : 'info'} className={`${toast.type === 'error' ? 'text-error' : 'text-stone-500'}`} size={16} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Catalog autocomplete source */}
      <datalist id="invoice-catalog">
        {PRODUCT_CATALOG.map((p) => (
          <option key={p.name} value={p.name}>{`PKR ${p.price} / ${p.unit}`}</option>
        ))}
      </datalist>

      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 relative">

        {/* Left: Invoice Editor (7 columns) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm font-bold text-primary text-lg">Create Invoice</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-tertiary-container text-on-tertiary-container px-2.5 py-1 rounded-full">
                Credit / Udhar
              </span>
            </div>

            {/* Customer & Dates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant block">Bill To Customer</label>
                <select
                  className="w-full border border-outline-variant rounded-lg p-2.5 text-xs bg-white outline-none focus:ring-1 focus:ring-primary font-bold"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                >
                  <option value="walk-in">Walk-in Customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant block">Invoice ID</label>
                <input
                  type="text"
                  readOnly
                  className="w-full border border-outline-variant bg-surface-container-low rounded-lg p-2.5 text-xs text-outline font-mono-numbers"
                  value={draftId}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant block">Due Date</label>
                <input
                  type="date"
                  className="w-full border border-outline-variant rounded-lg p-2.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            {selectedCustomerId !== 'walk-in' && 'balance' in selectedCustomerInfo && selectedCustomerInfo.balance > 0 && (
              <div className="flex items-center gap-2 text-[11px] font-bold text-error bg-error-container/40 border border-error/20 rounded-lg px-3 py-2">
                <Icon name="info" size={16} />
                {selectedCustomerInfo.name} already owes PKR {selectedCustomerInfo.balance.toLocaleString()}. This invoice will add to their balance.
              </div>
            )}

            {/* Line Items Editor */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Line Items</h3>
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <Icon name="add_circle" size={16} /> Add Item
                </button>
              </div>

              <div className="border border-outline-variant rounded-lg overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse min-w-[560px]">
                  <thead className="bg-surface-container-low text-on-surface-variant font-bold border-b border-outline-variant">
                    <tr>
                      <th className="p-3">Item Description</th>
                      <th className="p-3 w-28 text-center">Qty</th>
                      <th className="p-3 w-20">Unit</th>
                      <th className="p-3 w-28">Unit Price</th>
                      <th className="p-3 w-28 text-right">Total</th>
                      <th className="p-3 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-surface-container/20 group">
                        <td className="p-2">
                          <input
                            type="text"
                            list="invoice-catalog"
                            placeholder="Product name..."
                            className="w-full bg-transparent border-b border-outline-variant/40 focus:border-primary outline-none font-bold rounded p-1 placeholder:opacity-40"
                            value={row.name}
                            onChange={(e) => handleProductChange(row.id, e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex items-center bg-white border border-outline-variant rounded-lg overflow-hidden w-24 mx-auto">
                            <button
                              type="button"
                              onClick={() => handleUpdateRow(row.id, 'quantity', Math.max(1, row.quantity - 1))}
                              className="px-2 py-1 hover:bg-stone-100 text-stone-500 font-bold active:scale-90 transition-all text-sm shrink-0 select-none"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="1"
                              className="w-full bg-transparent border-0 outline-none text-center font-bold font-mono-numbers p-1 text-xs"
                              value={row.quantity}
                              onChange={(e) => handleUpdateRow(row.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateRow(row.id, 'quantity', row.quantity + 1)}
                              className="px-2 py-1 hover:bg-stone-100 text-stone-500 font-bold active:scale-90 transition-all text-sm shrink-0 select-none"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="p-2">
                          <select
                            className="w-full bg-white border border-outline-variant rounded px-2 py-1 outline-none"
                            value={row.unit}
                            onChange={(e) => handleUpdateRow(row.id, 'unit', e.target.value)}
                          >
                            <option value="pcs">pcs</option>
                            <option value="kg">kg</option>
                            <option value="gm">gm</option>
                            <option value="litre">litre</option>
                            <option value="box">box</option>
                            <option value="bag">bag</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            className="w-full bg-white border border-outline-variant rounded px-2 py-1 font-mono-numbers outline-none focus:border-primary"
                            value={row.price}
                            onChange={(e) => handleUpdateRow(row.id, 'price', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="p-2 text-right font-bold font-mono-numbers text-primary">
                          PKR {(row.quantity * row.price).toLocaleString()}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="text-error opacity-0 group-hover:opacity-100 hover:scale-110 transition-all disabled:opacity-0"
                            disabled={rows.length === 1}
                            title="Remove item"
                          >
                            <Icon name="delete_outline" size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Discount & Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant block">Discount (PKR)</label>
                <input
                  type="number"
                  min="0"
                  className="w-full border border-outline-variant rounded-lg p-2.5 text-xs outline-none focus:ring-1 focus:ring-primary font-mono-numbers"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant block">Invoice Terms / Notes</label>
                <textarea
                  rows={2}
                  className="w-full border border-outline-variant rounded-lg p-2.5 text-xs outline-none focus:ring-1 focus:ring-primary resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Preview & Totals (5 columns) */}
        <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24 self-start">

          {/* Invoice Preview Canvas */}
          <div className="bg-white border border-outline-variant rounded-xl shadow-md p-6 space-y-6 font-sans">
            <div className="flex justify-between items-start border-b border-outline-variant pb-4">
              <div>
                <h3 className="font-mono font-bold text-primary text-base tracking-wider">ALARA SME</h3>
                <p className="text-[10px] text-on-surface-variant">Retailer • Clifton, Karachi</p>
                <p className="text-[9px] text-outline">Phone: +92 300 0000000</p>
              </div>
              <div className="text-right">
                <h4 className="font-bold text-tertiary text-sm">INVOICE</h4>
                <p className="text-[10px] text-on-surface-variant font-mono-numbers font-bold">#{draftId}</p>
                <p className="text-[9px] text-outline mt-1 font-mono-numbers">Date: {todayStr}</p>
                <p className="text-[9px] text-outline font-mono-numbers">Due Date: {dueDate}</p>
              </div>
            </div>

            {/* Bill to */}
            <div className="text-[11px]">
              <p className="font-bold text-on-surface-variant uppercase tracking-wider text-[9px] mb-1">Bill To:</p>
              <p className="font-bold text-on-surface text-xs">{selectedCustomerInfo.name}</p>
              <p className="text-on-surface-variant">{selectedCustomerInfo.neighborhood}</p>
              {selectedCustomerInfo.phone && <p className="text-outline font-mono-numbers">{selectedCustomerInfo.phone}</p>}
            </div>

            {/* Live Table */}
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              <table className="w-full text-[10px] text-left border-collapse">
                <thead className="bg-surface-container text-on-surface-variant font-bold border-b border-outline-variant">
                  <tr>
                    <th className="p-2">Item</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Price</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="p-2 font-bold">{row.name || 'Unnamed Item'}</td>
                      <td className="p-2 text-center font-mono-numbers">{row.quantity} {row.unit}</td>
                      <td className="p-2 text-right font-mono-numbers">PKR {row.price.toLocaleString()}</td>
                      <td className="p-2 text-right font-bold font-mono-numbers">PKR {(row.quantity * row.price).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="space-y-1.5 text-xs font-mono-numbers border-t border-outline-variant pt-4">
              <div className="flex justify-between text-on-surface-variant">
                <span>Subtotal ({totalItems} items):</span>
                <span>PKR {subtotal.toLocaleString()}</span>
              </div>
              {discountVal > 0 && (
                <div className="flex justify-between text-error">
                  <span>Discount:</span>
                  <span>(-) PKR {discountVal.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-on-surface border-t border-outline-variant/50 pt-2 text-sm">
                <span>Grand Total:</span>
                <span className="text-primary font-bold">PKR {grandTotal.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-surface-container-low p-3 rounded-lg text-[9px] text-on-surface-variant italic">
              <p className="font-bold font-sans not-italic uppercase tracking-wider text-[8px] mb-1">Invoice Notes:</p>
              {notes}
            </div>
          </div>

          {/* Action Panel */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleSaveInvoice}
              disabled={isSaving}
              className={`w-full py-4 font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm ${
                isSaving
                  ? 'bg-stone-400 text-white cursor-not-allowed'
                  : 'bg-primary text-on-primary hover:brightness-110 active:scale-95'
              }`}
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving Invoice...
                </>
              ) : (
                <>
                  <Icon name="save_alt" size={18} /> Save &amp; Dispatch Credit Invoice
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleWhatsAppDraft}
              className="w-full py-3 bg-surface-container-high border border-outline-variant text-on-surface-variant font-bold rounded-xl hover:bg-surface-container transition-all flex items-center justify-center gap-2 text-xs"
            >
              <Icon name="share" size={18} /> Dispatch Draft via WhatsApp
            </button>
          </div>
        </div>

      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4 inv-fade-in">
          <div className="bg-white text-stone-900 rounded-2xl w-full max-w-112 overflow-hidden shadow-2xl border border-stone-200 inv-scale-up">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-primary-fixed rounded-full flex items-center justify-center mx-auto mb-6">
                <Icon name="verified" className="text-primary" size={32} />
              </div>
              <h2 className="mb-2 font-bold text-xl">Credit Invoice Generated!</h2>
              <p className="text-stone-500 text-xs">
                Invoice <span className="font-mono font-bold text-primary">{savedInvoiceId}</span> for{' '}
                <strong>PKR {grandTotal.toLocaleString()}</strong> was recorded in {selectedCustomerInfo.name}&apos;s ledger.
              </p>
              <p className="text-stone-400 text-[11px] mt-4">Redirecting to invoices…</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
