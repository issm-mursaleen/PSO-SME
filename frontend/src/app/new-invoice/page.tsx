'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp, Invoice, InvoiceItem } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';
import { PRODUCT_CATALOG } from '@/lib/productCatalog';

interface InvoiceRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatMoney = (value: number) => `PKR ${value.toLocaleString()}`;

const buildInvoiceHtml = (invoice: Invoice) => {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.total, 0);
  const itemRows = invoice.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td class="center">${item.quantity} ${escapeHtml(item.unit)}</td>
          <td class="right">${formatMoney(item.price)}</td>
          <td class="right strong">${formatMoney(item.total)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.id)} Invoice</title>
  <style>
    body { margin: 0; background: #f5f4f0; color: #1a1a18; font-family: Arial, sans-serif; }
    .page { width: 760px; margin: 32px auto; background: #fff; border: 1px solid #e5e4e0; padding: 32px; }
    .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #e5e4e0; padding-bottom: 18px; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 20px; letter-spacing: 0.12em; }
    h2 { font-size: 18px; text-align: right; }
    .muted { color: #787776; font-size: 12px; line-height: 1.7; }
    .bill { margin: 24px 0; font-size: 13px; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #ededea; color: #787776; text-align: left; padding: 10px; }
    td { border-bottom: 1px solid #e5e4e0; padding: 10px; }
    .center { text-align: center; }
    .right { text-align: right; }
    .strong { font-weight: 700; }
    .totals { width: 320px; margin-left: auto; margin-top: 24px; font-size: 13px; }
    .line { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #e5e4e0; }
    .grand { font-size: 17px; font-weight: 800; }
    .notes { margin-top: 24px; background: #f0efeb; padding: 14px; font-size: 12px; color: #44433f; line-height: 1.6; }
    @media print { body { background: #fff; } .page { margin: 0; width: auto; border: 0; } }
  </style>
</head>
<body>
  <main class="page">
    <section class="top">
      <div>
        <h1>PSO SME</h1>
        <p class="muted">Retailer - Clifton, Karachi<br/>Phone: +92 300 0000000</p>
      </div>
      <div>
        <h2>INVOICE</h2>
        <p class="muted">#${escapeHtml(invoice.id)}<br/>Date: ${escapeHtml(invoice.date)}<br/>Due: ${escapeHtml(invoice.dueDate)}</p>
      </div>
    </section>
    <section class="bill">
      <p class="muted strong">BILL TO</p>
      <p class="strong">${escapeHtml(invoice.customerName)}</p>
      <p class="muted">Status: Paid</p>
    </section>
    <table>
      <thead>
        <tr><th>Item</th><th class="center">Qty</th><th class="right">Price</th><th class="right">Total</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <section class="totals">
      <div class="line"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
      <div class="line"><span>Discount</span><span>${formatMoney(invoice.discount)}</span></div>
      <div class="line grand"><span>Grand Total</span><span>${formatMoney(invoice.amount)}</span></div>
    </section>
    <section class="notes"><strong>Notes:</strong><br/>${escapeHtml(invoice.notes)}</section>
  </main>
</body>
</html>`;
};

const downloadInvoiceFile = (invoice: Invoice) => {
  const blob = new Blob([buildInvoiceHtml(invoice)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${invoice.id}-${invoice.customerName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const printInvoice = (invoice: Invoice) => {
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(buildInvoiceHtml(invoice));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
};

export default function NewInvoice() {
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
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Default due date = 7 days from now; also set draft id + today (client-only)
  /* eslint-disable react-hooks/set-state-in-effect -- Client-only seeded invoice metadata avoids server/client date drift. */
  useEffect(() => {
    const d = new Date();
    setTodayStr(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    setDraftId(`INV-${Math.floor(Math.random() * 1000 + 2042)}`);
    d.setDate(d.getDate() + 7);
    setDueDate(d.toISOString().split('T')[0]);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedCustomerInfo = customers.find((c) => c.id === selectedCustomerId) || {
    id: 'walk-in',
    name: 'Walk-in Customer',
    neighborhood: 'Karachi Central',
    phone: '',
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
    triggerToast('Generating invoice...', 'info');

    setTimeout(() => {
      const invoiceItems: InvoiceItem[] = rows.map((r) => ({
        name: r.name.trim(),
        quantity: r.quantity,
        unit: r.unit,
        price: r.price,
        total: r.quantity * r.price,
      }));

      // Record as a completed (paid) sale; use the REAL id returned for confirmation
      const saved = recordSale(selectedCustomerId, invoiceItems, discountVal, notes);
      const previewInvoice: Invoice = {
        ...saved,
        dueDate,
      };

      setSavedInvoice(previewInvoice);
      setIsSaving(false);
      setShowSuccess(true);
      downloadInvoiceFile(previewInvoice);
      triggerToast(`Invoice ${previewInvoice.id} downloaded.`, 'success');
    }, 900);
  };

  const handleWhatsAppDraft = () => {
    if (!validate()) return;
    const summary = `Salam ${selectedCustomerInfo.name}, here is your invoice from PSO SME. Total: PKR ${grandTotal.toLocaleString()}. Shukriya.`;
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
              <span className="text-[10px] font-bold uppercase tracking-wider bg-primary-fixed text-on-primary-fixed-variant px-2.5 py-1 rounded-full">
                Paid Sale
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
                <label className="text-xs font-bold text-on-surface-variant block">Delivery / Due Date</label>
                <input
                  type="date"
                  className="w-full border border-outline-variant rounded-lg p-2.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

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
                <h3 className="font-mono font-bold text-primary text-base tracking-wider">PSO SME</h3>
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
                  <Icon name="save_alt" size={18} /> Save, Preview &amp; Download Invoice
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

      {/* Saved Invoice Preview Modal */}
      {showSuccess && savedInvoice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4 inv-fade-in">
          <div className="bg-white text-stone-900 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl border border-stone-200 inv-scale-up flex flex-col">
            <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 bg-primary-fixed rounded-full flex items-center justify-center shrink-0">
                  <Icon name="verified" className="text-primary" size={22} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-base">Invoice Created</h2>
                  <p className="text-xs text-stone-500 truncate">
                    {savedInvoice.id} opened in preview and downloaded as an invoice file.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSuccess(false)}
                className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Close preview"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="overflow-y-auto custom-scrollbar bg-surface-container-low p-4">
              <div className="bg-white border border-outline-variant rounded-xl shadow-md p-6 space-y-6 max-w-3xl mx-auto">
                <div className="flex justify-between items-start border-b border-outline-variant pb-4">
                  <div>
                    <h3 className="font-mono font-bold text-primary text-base tracking-wider">PSO SME</h3>
                    <p className="text-[10px] text-on-surface-variant">Retailer - Clifton, Karachi</p>
                    <p className="text-[9px] text-outline">Phone: +92 300 0000000</p>
                  </div>
                  <div className="text-right">
                    <h4 className="font-bold text-tertiary text-sm">INVOICE</h4>
                    <p className="text-[10px] text-on-surface-variant font-mono-numbers font-bold">#{savedInvoice.id}</p>
                    <p className="text-[9px] text-outline mt-1 font-mono-numbers">Date: {savedInvoice.date}</p>
                    <p className="text-[9px] text-outline font-mono-numbers">Due Date: {savedInvoice.dueDate}</p>
                  </div>
                </div>

                <div className="text-[11px]">
                  <p className="font-bold text-on-surface-variant uppercase tracking-wider text-[9px] mb-1">Bill To:</p>
                  <p className="font-bold text-on-surface text-xs">{savedInvoice.customerName}</p>
                  <p className="text-on-surface-variant">Status: Paid</p>
                </div>

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
                      {savedInvoice.items.map((item) => (
                        <tr key={`${savedInvoice.id}-${item.name}-${item.quantity}`}>
                          <td className="p-2 font-bold">{item.name}</td>
                          <td className="p-2 text-center font-mono-numbers">{item.quantity} {item.unit}</td>
                          <td className="p-2 text-right font-mono-numbers">PKR {item.price.toLocaleString()}</td>
                          <td className="p-2 text-right font-bold font-mono-numbers">PKR {item.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-1.5 text-xs font-mono-numbers border-t border-outline-variant pt-4">
                  <div className="flex justify-between text-on-surface-variant">
                    <span>Subtotal:</span>
                    <span>PKR {savedInvoice.items.reduce((sum, item) => sum + item.total, 0).toLocaleString()}</span>
                  </div>
                  {savedInvoice.discount > 0 && (
                    <div className="flex justify-between text-error">
                      <span>Discount:</span>
                      <span>(-) PKR {savedInvoice.discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-on-surface border-t border-outline-variant/50 pt-2 text-sm">
                    <span>Grand Total:</span>
                    <span className="text-primary font-bold">PKR {savedInvoice.amount.toLocaleString()}</span>
                  </div>
                </div>

                <div className="bg-surface-container-low p-3 rounded-lg text-[9px] text-on-surface-variant italic">
                  <p className="font-bold font-sans not-italic uppercase tracking-wider text-[8px] mb-1">Invoice Notes:</p>
                  {savedInvoice.notes}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-outline-variant flex flex-col sm:flex-row justify-between gap-3 bg-white">
              <Link
                href="/invoices"
                className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-outline-variant text-xs font-bold text-on-surface-variant hover:bg-muted transition-colors"
              >
                View Invoices
              </Link>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => downloadInvoiceFile(savedInvoice)}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/85 active:scale-[0.98] transition-all"
                >
                  <Icon name="download" size={16} />
                  Download Again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
