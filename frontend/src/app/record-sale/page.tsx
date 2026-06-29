'use client';

import React, { useState, useEffect } from 'react';
import { useApp, Customer, InvoiceItem } from '@/context/AppContext';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { PRODUCT_CATALOG } from '@/lib/productCatalog';

interface SaleRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  discount: number;
}

export default function RecordSale() {
  const router = useRouter();
  const { customers, recordSale, sendWhatsAppReminder } = useApp();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walk-in');
  const [notes, setNotes] = useState('');
  
  // Sale Items Rows State
  const [rows, setRows] = useState<SaleRow[]>([
    { id: '1', name: 'Bread Large', quantity: 1, unit: 'pcs', price: 120, discount: 0 },
    { id: '2', name: 'Milk 1 Litre', quantity: 2, unit: 'pcs', price: 260, discount: 0 },
    { id: '3', name: 'Cooking Oil 1L', quantity: 5, unit: 'kg', price: 155, discount: 25 },
  ]);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState('');
  
  // Custom button simulator states
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [hasPrinted, setHasPrinted] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [hasShared, setHasShared] = useState(false);

  // Toast Notification states
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Live clock display
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleDateString('en-US', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }) + ', ' + now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, []);

  // Pre-select the customer passed in via ?customer=<id> (e.g. from the
  // "Record Sale" button on a customer's profile). Read from the URL on mount
  // to avoid a Suspense boundary requirement during static generation.
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get('customer');
    if (cid && customers.some((c) => c.id === cid)) {
      setSelectedCustomerId(cid);
    }
  }, [customers]);

  // Find active customer info
  const activeCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  // Calculate Subtotals
  const subtotal = rows.reduce((sum, r) => sum + (r.quantity * r.price), 0);
  const totalDiscount = rows.reduce((sum, r) => sum + r.discount, 0);
  const grandTotal = Math.max(0, subtotal - totalDiscount);

  // Trigger toast alert helper
  const triggerToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Add Item Row
  const handleAddRow = () => {
    const newId = Date.now().toString();
    setRows([...rows, { id: newId, name: '', quantity: 1, unit: 'pcs', price: 0, discount: 0 }]);
    triggerToast('New item row appended.', 'info');
  };

  // Remove Item Row
  const handleRemoveRow = (id: string) => {
    if (rows.length > 1) {
      setRows(rows.filter((r) => r.id !== id));
      triggerToast('Item row removed.', 'info');
    }
  };

  // Update Item Row values
  const handleUpdateRow = (id: string, field: keyof SaleRow, value: any) => {
    setRows(
      rows.map((r) => {
        if (r.id === id) {
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  // Autocomplete Select Product Handler
  const handleProductChange = (rowId: string, value: string) => {
    // Update name field first
    handleUpdateRow(rowId, 'name', value);

    // Look for exact match to fill standard parameters
    const matched = PRODUCT_CATALOG.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
    if (matched) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                name: matched.name,
                price: matched.price,
                unit: matched.unit,
              }
            : r
        )
      );
      triggerToast(`Autofilled: ${matched.name}`, 'success');
    }
  };

  // Keyboard shortcut listener for F10 (Save Sale)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F10') {
        e.preventDefault();
        handleSaveSale();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCustomerId, rows, totalDiscount, notes, isSaving]);

  // Form Validation and Saving trigger
  const handleSaveSale = () => {
    if (isSaving) return;

    // Row Checks
    const emptyRowName = rows.some((r) => !r.name.trim());
    if (emptyRowName) {
      triggerToast('Product name is required for all rows.', 'error');
      return;
    }
    const zeroPriceRow = rows.some((r) => r.price <= 0);
    if (zeroPriceRow) {
      triggerToast('Product price must be greater than zero.', 'error');
      return;
    }

    setIsSaving(true);
    triggerToast('Recording sale...', 'info');

    setTimeout(() => {
      // Convert rows to InvoiceItem format
      const invoiceItems: InvoiceItem[] = rows.map((r) => ({
        name: r.name || 'Unnamed Item',
        quantity: r.quantity,
        unit: r.unit,
        price: r.price,
        total: r.quantity * r.price - r.discount,
      }));

      const savedInvoice = recordSale(
        selectedCustomerId,
        invoiceItems,
        totalDiscount,
        notes
      );

      setCreatedInvoiceId(savedInvoice.id);
      setIsSaving(false);
      setShowSuccessModal(true);
      triggerToast('Sale recorded successfully.', 'success');
    }, 1200);
  };

  const handleResetSale = () => {
    setRows([
      { id: '1', name: 'Bread Large', quantity: 1, unit: 'pcs', price: 120, discount: 0 },
      { id: '2', name: 'Milk 1 Litre', quantity: 2, unit: 'pcs', price: 260, discount: 0 },
      { id: '3', name: 'Cooking Oil 1L', quantity: 5, unit: 'kg', price: 155, discount: 25 },
    ]);
    setNotes('');
    setSelectedCustomerId('walk-in');
    setShowSuccessModal(false);
    setHasPrinted(false);
    setHasShared(false);
  };

  // Build an 80mm thermal-receipt HTML document for the current sale.
  const buildReceiptHtml = () => {
    const name = activeCustomer ? activeCustomer.name : 'Walk-in Customer';
    const date = new Date().toLocaleString('en-GB');
    const pkr = (n: number) => `Rs ${n.toLocaleString()}`;
    const subtotal = rows.reduce((s, r) => s + r.quantity * r.price, 0);

    const itemRows = rows
      .map(
        (r) => `<tr><td>${r.name || 'Item'}</td><td class="r">${r.quantity}</td>` +
          `<td class="r">${r.price.toLocaleString()}</td>` +
          `<td class="r">${(r.quantity * r.price - r.discount).toLocaleString()}</td></tr>`,
      )
      .join('');

    const payLines = `<div class="row b"><span>PAID</span><span>${pkr(grandTotal)}</span></div>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${createdInvoiceId}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { font-family: 'Courier New', monospace; box-sizing: border-box; }
  body { width: 80mm; margin: 0; padding: 8px 10px; color: #000; font-size: 12px; }
  .c { text-align: center; } .b { font-weight: bold; } .r { text-align: right; }
  h1 { font-size: 16px; margin: 0; letter-spacing: 2px; }
  .row { display: flex; justify-content: space-between; margin: 1px 0; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { font-size: 11px; padding: 1px 0; vertical-align: top; }
  .head td { font-weight: bold; border-bottom: 1px solid #000; }
  .small { font-size: 10px; }
</style></head><body>
  <div class="c"><h1>PSO SME</h1><div class="small">Karachi Hub &bull; Sales Receipt</div></div>
  <hr/>
  <div class="row"><span>Invoice</span><span>${createdInvoiceId}</span></div>
  <div class="row"><span>Date</span><span>${date}</span></div>
  <div class="row"><span>Customer</span><span>${name}</span></div>
  <hr/>
  <table>
    <tr class="head"><td>Item</td><td class="r">Qty</td><td class="r">Rate</td><td class="r">Amt</td></tr>
    ${itemRows}
  </table>
  <hr/>
  <div class="row"><span>Subtotal</span><span>${pkr(subtotal)}</span></div>
  ${totalDiscount > 0 ? `<div class="row"><span>Discount</span><span>- ${pkr(totalDiscount)}</span></div>` : ''}
  <div class="row b" style="font-size:13px"><span>TOTAL</span><span>${pkr(grandTotal)}</span></div>
  ${payLines}
  ${notes.trim() ? `<hr/><div class="small">Note: ${notes}</div>` : ''}
  <hr/>
  <div class="c small">Shukriya! Phir tashreef laaiye.</div>
</body></html>`;
  };

  // Print the thermal receipt via a hidden iframe (avoids popup blockers).
  const handlePrintReceipt = () => {
    setIsPrinting(true);
    triggerToast('Spooling invoice to thermal printer...', 'info');

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(buildReceiptHtml());
      doc.close();
    }

    // Give the iframe a tick to lay out, then invoke the print dialog.
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setIsPrinting(false);
      setHasPrinted(true);
      triggerToast('Thermal receipt sent to printer.', 'success');
      setTimeout(() => iframe.remove(), 1000);
    }, 400);
  };

  // WhatsApp share: take the user to the customer's outreach console with the
  // receipt pre-filled in the composer, so they can send it to him directly.
  const handleShareWhatsApp = () => {
    const name = activeCustomer ? activeCustomer.name : 'Customer';
    const pkr = (n: number) => `PKR ${n.toLocaleString()}`;
    const noteStr = notes.trim() ? ` Note: ${notes}.` : '';

    const summaryMsg = `Salam ${name}, PSO SME se aap ki kharidari. Invoice ${createdInvoiceId} — ${pkr(grandTotal)} ka saman. Payment mukammal mil gayi.${noteStr} Shukriya!`;

    if (selectedCustomerId !== 'walk-in') {
      // Log the receipt into the customer's WhatsApp chat, then open their
      // outreach console where the message now appears in the timeline.
      sendWhatsAppReminder(selectedCustomerId, summaryMsg, 'WhatsApp');
      setHasShared(true);
      triggerToast(`Receipt sent to ${activeCustomer?.name} on WhatsApp.`, 'success');
      router.push(`/connect?customer=${selectedCustomerId}`);
    } else {
      // Walk-in customers have no profile/messages, so copy a shareable link.
      setIsSharing(true);
      triggerToast('Generating WhatsApp invoice link...', 'info');
      setTimeout(() => {
        navigator.clipboard?.writeText(`https://pso-sme.pk/receipt/${createdInvoiceId}`);
        triggerToast('Walk-in receipt link copied to clipboard!', 'success');
        setIsSharing(false);
        setHasShared(true);
      }, 1000);
    }
  };

  return (
    <div className="p-6 relative">
      
      {/* CSS-based Keyframe animations wrapper */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-up {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .anim-fade-in {
          animation: fade-in 0.2s ease-out forwards;
        }
        .anim-scale-up {
          animation: scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />

      {/* Toast Alert capsule */}
      {toast && (
        <div className="fixed top-4 right-4 z-[110] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold bg-white text-stone-900 border-stone-500/20 anim-scale-up">
          <Icon name={toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'cancel' : 'info'} className="text-stone-500" size={16} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Datalist helper for product search autocomplete */}
      <datalist id="catalog-products">
        {PRODUCT_CATALOG.map((p) => (
          <option key={p.name} value={p.name}>
            {`PKR ${p.price} / ${p.unit}`}
          </option>
        ))}
      </datalist>

      <div className="grid grid-cols-12 gap-6 h-full max-w-[1600px] mx-auto">
        
        {/* Left Form: 8 Columns */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          
          {/* Customer & Payment Header */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant p-5 operational-shadow">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Customer selection */}
              <div className="space-y-1">
                <label className="font-body-sm font-bold text-on-surface-variant block">Customer Selection</label>
                <div className="relative">
                  <Icon name="person_search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
                  <select
                    className="w-full bg-white border border-outline-variant rounded-lg pl-10 pr-4 py-2 text-body-md focus:ring-1 focus:ring-primary outline-none appearance-none font-bold"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="walk-in">Walk-in Customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.neighborhood})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date & Time display */}
              <div className="space-y-1">
                <label className="font-body-sm font-bold text-on-surface-variant block">Date &amp; Time</label>
                <div className="relative">
                  <Icon name="schedule" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
                  <input
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 outline-none text-body-md text-on-surface-variant font-bold font-mono-numbers"
                    readOnly
                    type="text"
                    value={currentTimeStr || 'Loading clock...'}
                  />
                </div>
              </div>

            </div>
          </section>

          {/* Items Table Section */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden flex flex-col operational-shadow">
            <div className="bg-surface-container-low px-5 py-3 border-b border-outline-variant flex justify-between items-center">
              <h2 className="font-headline-sm text-headline-sm font-bold">Items List</h2>
              
              <button
                type="button"
                onClick={handleAddRow}
                className="bg-primary text-white px-3.5 py-1.5 rounded-lg font-label-md flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all text-xs font-bold"
              >
                <Icon name="add_circle" size={16} /> Add Row
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead className="bg-surface-variant text-label-md text-on-surface-variant">
                  <tr>
                    <th className="px-5 py-3">Product Name</th>
                    <th className="px-3 py-3 w-28 text-center">Qty</th>
                    <th className="px-3 py-3 w-28">Unit</th>
                    <th className="px-3 py-3 w-32">Price (PKR)</th>
                    <th className="px-3 py-3 w-32">Discount (PKR)</th>
                    <th className="px-3 py-3 text-right">Total (PKR)</th>
                    <th className="px-5 py-3 w-16 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant text-body-md">
                  {rows.map((row) => {
                    return (
                      <tr key={row.id} className="hover:bg-surface-container-low/50 group transition-colors">
                        {/* Product input linked to Datalist (no clipping or horizontal scrollbars) */}
                        <td className="px-5 py-3">
                          <input
                            type="text"
                            list="catalog-products"
                            className="w-full bg-transparent border-b border-outline-variant/40 focus:border-primary outline-none font-bold placeholder:opacity-40"
                            placeholder="Enter item name..."
                            value={row.name}
                            onChange={(e) => handleProductChange(row.id, e.target.value)}
                          />
                        </td>

                        {/* Interactive Plus Minus Quantity cell */}
                        <td className="px-3 py-3">
                          <div className="flex items-center bg-white border border-outline-variant rounded-lg overflow-hidden w-24 mx-auto shadow-sm">
                            <button
                              type="button"
                              onClick={() => handleUpdateRow(row.id, 'quantity', Math.max(1, row.quantity - 1))}
                              className="px-2.5 py-1 hover:bg-stone-100 text-stone-500 font-bold active:scale-90 transition-all text-sm shrink-0 select-none"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              className="w-full bg-transparent border-0 text-numeric-data outline-none text-center font-bold font-mono-numbers focus:ring-0 p-1 text-xs"
                              value={row.quantity}
                              onChange={(e) => handleUpdateRow(row.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateRow(row.id, 'quantity', row.quantity + 1)}
                              className="px-2.5 py-1 hover:bg-stone-100 text-stone-500 font-bold active:scale-90 transition-all text-sm shrink-0 select-none"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <select
                            className="w-full bg-white border border-outline-variant rounded-lg px-2 py-1 text-body-sm outline-none font-bold"
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

                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="0"
                            className="w-full bg-white border border-outline-variant rounded-lg px-2.5 py-1 text-numeric-data outline-none focus:border-primary font-bold font-mono-numbers"
                            value={row.price}
                            onChange={(e) => handleUpdateRow(row.id, 'price', parseFloat(e.target.value) || 0)}
                          />
                        </td>

                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min="0"
                            className="w-full bg-white border border-outline-variant rounded-lg px-2.5 py-1 text-numeric-data outline-none focus:border-primary font-bold font-mono-numbers text-tertiary"
                            value={row.discount}
                            onChange={(e) => handleUpdateRow(row.id, 'discount', parseFloat(e.target.value) || 0)}
                          />
                        </td>

                        <td className="px-3 py-3 text-right font-numeric-data font-bold text-primary font-mono-numbers">
                          {(row.quantity * row.price - row.discount).toFixed(2)}
                        </td>

                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="text-error opacity-0 group-hover:opacity-100 hover:scale-115 transition-all p-1 hover:bg-red-500/10 rounded-lg"
                            disabled={rows.length === 1}
                            title="Remove item row"
                          >
                            <Icon name="delete_outline" size={20} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  
                  {/* Action Row Add items trigger */}
                  <tr>
                    <td className="px-5 py-5 text-center bg-surface-container-low/20 border-t border-dashed border-outline-variant" colSpan={7}>
                      <button
                        type="button"
                        onClick={handleAddRow}
                        className="text-primary font-label-md flex items-center gap-1.5 mx-auto hover:underline font-bold text-sm"
                      >
                        <Icon name="add_circle" size={18} /> Add item row to sales slip
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Sale Notes Section with Interactive Presets */}
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant p-5 operational-shadow space-y-3">
            <div className="flex justify-between items-center">
              <label className="font-body-sm font-bold text-on-surface-variant block">Sale Notes / Special Instructions</label>
              <span className="text-[10px] text-stone-400 font-mono font-bold">
                {notes.length} / 200 chars
              </span>
            </div>

            <textarea
              maxLength={200}
              className="w-full h-24 bg-white border border-outline-variant rounded-lg p-3 focus:ring-1 focus:ring-primary outline-none text-body-md resize-none text-stone-800 placeholder:opacity-50"
              placeholder="Type delivery requests, credit promises, or special payment notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            ></textarea>

            {/* Quick Presets row */}
            <div className="flex flex-wrap gap-2 pt-1 select-none text-[9px] font-bold">
              <span className="text-[8px] text-on-surface-variant/60 uppercase self-center mr-1">Quick Notes:</span>
              <button
                type="button"
                onClick={() => setNotes(prev => prev ? `${prev} • Store Pickup` : 'Store Pickup')}
                className="bg-stone-50 border border-stone-200 text-stone-600 px-2.5 py-1.5 rounded-lg hover:bg-stone-100 active:scale-95 transition-all"
              >
                🏪 Store Pickup
              </button>
              <button
                type="button"
                onClick={() => setNotes(prev => prev ? `${prev} • Deliver to DHA` : 'Deliver to DHA')}
                className="bg-stone-50 border border-stone-200 text-stone-600 px-2.5 py-1.5 rounded-lg hover:bg-stone-100 active:scale-95 transition-all"
              >
                🚚 Deliver to DHA
              </button>
              <button
                type="button"
                onClick={() => setNotes(prev => prev ? `${prev} • Clifton Residence` : 'Clifton Residence')}
                className="bg-stone-50 border border-stone-200 text-stone-600 px-2.5 py-1.5 rounded-lg hover:bg-stone-100 active:scale-95 transition-all"
              >
                🏡 Clifton Residence
              </button>
              <button
                type="button"
                onClick={() => setNotes(prev => prev ? `${prev} • Transfer pending verify` : 'Transfer pending verify')}
                className="bg-stone-50 border border-stone-200 text-stone-600 px-2.5 py-1.5 rounded-lg hover:bg-stone-100 active:scale-95 transition-all"
              >
                💳 Transfer pending
              </button>
            </div>
          </section>

        </div>

        {/* Right Summary Panel: 4 Columns */}
        <div className="col-span-12 lg:col-span-4 lg:sticky lg:top-24 self-start space-y-6">
          
          {/* Customer Snapshot */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-5 operational-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center font-bold text-primary uppercase text-sm">
                {activeCustomer ? activeCustomer.name.split(' ').map(n=>n[0]).join('') : 'WC'}
              </div>
              <div>
                <h3 className="font-headline-sm text-on-surface font-bold text-sm">{activeCustomer?.name || 'Walk-in Customer'}</h3>
                <p className="text-xs text-outline">
                  {activeCustomer ? `${activeCustomer.type} • ${activeCustomer.phone}` : 'Regular Retail Store Visitor'}
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 border-t border-outline-variant pt-4">
              <div>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Last Visit</p>
                <p className="font-numeric-data text-sm font-extrabold font-mono-numbers mt-0.5 text-primary">
                  {activeCustomer ? `${activeCustomer.lastVisitDays} days ago` : '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold mb-1">Status</p>
                <span className="bg-primary-fixed text-on-primary-fixed-variant px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                  {activeCustomer ? activeCustomer.status : 'Walk-in'}
                </span>
              </div>
            </div>
          </div>

          {/* Final Calculations Calculations */}
          <div className="bg-primary text-on-primary rounded-xl border border-primary/20 p-6 shadow-lg relative overflow-hidden">
            
            {/* Header background card glow */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl transform translate-x-8 -translate-y-8" />

            <div className="space-y-4">
              <div className="flex justify-between items-center text-primary-fixed-dim">
                <span className="font-body-md text-xs">Subtotal</span>
                <span className="font-numeric-data font-mono-numbers">PKR {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-primary-fixed-dim">
                <span className="font-body-md text-xs">Total Discount</span>
                <span className="font-numeric-data font-mono-numbers text-stone-300">(-) PKR {totalDiscount.toFixed(2)}</span>
              </div>
              <div className="h-px bg-white/10"></div>
              <div className="flex justify-between items-center">
                <span className="font-headline-sm font-extrabold text-sm">Grand Total</span>
                <span className="font-headline-lg text-primary-fixed text-xl font-bold font-mono-numbers">PKR {grandTotal.toFixed(2)}</span>
              </div>
            </div>
            
            {/* Glowing Save button with active loading spinner */}
            <button
              onClick={handleSaveSale}
              disabled={isSaving}
              className={`w-full mt-6 font-headline-sm py-4 rounded-xl shadow-md flex items-center justify-center gap-2 font-bold active:scale-[0.98] transition-all ${
                isSaving 
                  ? 'bg-stone-400 text-stone-200 cursor-not-allowed shadow-none'
                  : 'bg-primary-fixed hover:bg-primary-fixed-dim text-on-primary-fixed hover:shadow-lg hover:shadow-stone-950/20'
              }`}
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-stone-300 border-t-transparent rounded-full animate-spin" />
                  Logging Sale...
                </>
              ) : (
                <>
                  <Icon name="verified" size={18} /> Save Sale (F10)
                </>
              )}
            </button>
          </div>

          {/* Shortcuts Tooltip */}
          <div className="bg-surface-container-high/50 rounded-lg p-3 flex items-center gap-3 border border-outline-variant">
            <Icon name="info" className="text-outline" size={18} />
            <p className="text-[11px] text-on-surface-variant font-medium">Use <span className="bg-white border px-1 rounded shadow-sm font-bold">F10</span> to execute Sale instantly, select row autocomplete items to fill details.</p>
          </div>

        </div>

      </div>

      {/* Success Confirmation Modal (Cleaned up overlay to avoid browser CSS breaks) */}
      {showSuccessModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 anim-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSuccessModal(false);
              setHasPrinted(false);
              setHasShared(false);
            }
          }}
        >
          <div className="relative bg-white text-stone-900 rounded-2xl w-full max-w-112 overflow-hidden shadow-2xl border border-stone-200 anim-scale-up">
            {/* Close button */}
            <button
              type="button"
              onClick={() => {
                setShowSuccessModal(false);
                setHasPrinted(false);
                setHasShared(false);
              }}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <Icon name="close" size={18} />
            </button>
            <div className="p-8 text-center">
              
              {/* Animated Glowing check icon */}
              <div className="w-16 h-16 bg-primary-fixed rounded-full flex items-center justify-center mx-auto mb-6 shadow-md shadow-stone-500/10">
                <Icon name="check_circle" className="text-primary" size={32} />
              </div>
              
              <h2 className="text-stone-900 mb-2 font-bold text-xl">Sale Logged Successfully!</h2>
              <p className="text-stone-500 text-xs mb-6">
                Transaction <span className="font-mono font-bold text-primary">{createdInvoiceId}</span> has been written to client files and ledgers updated.
              </p>

              {/* Render Saved Notes if present inside modal receipt card */}
              {notes.trim() && (
                <div className="bg-stone-50 border border-dashed border-stone-200 rounded-xl p-3.5 text-left mb-6">
                  <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider mb-1">Receipt Note logged</p>
                  <p className="text-xs text-stone-700 italic">"{notes}"</p>
                </div>
              )}
              
              <div className="space-y-3">
                {/* Print Receipt button with simulated loading/success */}
                <button
                  onClick={handlePrintReceipt}
                  disabled={isPrinting}
                  className={`w-full py-3.5 rounded-xl font-headline-sm flex items-center justify-center gap-2 transition-all font-bold text-xs ${
                    hasPrinted
                      ? 'bg-stone-500/10 border border-stone-500/30 text-stone-600'
                      : isPrinting
                      ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                      : 'bg-primary text-white hover:brightness-105 hover:shadow-md'
                  }`}
                >
                  {isPrinting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
                      Thermal Printing Spooling...
                    </>
                  ) : hasPrinted ? (
                    <>
                      <Icon name="done" size={16} /> Printed Successfully!
                    </>
                  ) : (
                    <>
                      <Icon name="print" size={16} /> Print Thermal Receipt
                    </>
                  )}
                </button>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Share WhatsApp with simulated clipboard copy fallback */}
                  <button
                    onClick={handleShareWhatsApp}
                    disabled={isSharing}
                    className={`py-3.5 rounded-xl font-label-md flex items-center justify-center gap-1.5 hover:bg-stone-100 transition-all text-xs font-bold ${
                      hasShared
                        ? 'bg-stone-500/10 border border-stone-500/30 text-stone-600'
                        : isSharing
                        ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                        : 'bg-stone-100 text-stone-700 border border-stone-200'
                    }`}
                  >
                    {isSharing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
                        Sharing...
                      </>
                    ) : hasShared ? (
                      <>
                        <Icon name="done" size={15} /> Shared!
                      </>
                    ) : (
                      <>
                        <Icon name="share" size={16} /> Share WhatsApp
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      if (selectedCustomerId !== 'walk-in') {
                        router.push(`/customers`);
                      } else {
                        router.push('/customers');
                      }
                    }}
                    className="bg-stone-100 text-stone-700 border border-stone-200 py-3.5 rounded-xl font-label-md flex items-center justify-center gap-1.5 hover:bg-stone-200 transition-all text-xs font-bold"
                  >
                    <Icon name="person" size={16} /> View Customer
                  </button>
                </div>
                
                <button
                  onClick={handleResetSale}
                  className="w-full bg-transparent text-stone-400 py-2 font-label-md hover:text-stone-600 text-sm font-bold"
                >
                  Done &amp; Start New Sale
                </button>
              </div>
            </div>
            
            <div className="bg-stone-50 px-8 py-4 border-t border-stone-100 flex justify-between items-center text-xs text-stone-500">
              <span>Ref: {createdInvoiceId}</span>
              <span>{currentTimeStr}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
