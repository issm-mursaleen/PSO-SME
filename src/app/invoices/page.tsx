'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp, type Invoice, type SupplierInvoice, type InvoiceItem } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

type DocTab = 'customers' | 'suppliers';

/** Common shape both customer Invoices and SupplierInvoices reduce to, so the
 *  preview/print/download/table code only needs to know about one shape. */
interface BillableDoc {
  id: string;
  partyLabel: 'BILL TO' | 'PURCHASED FROM';
  partyName: string;
  partyHref: string | null;
  date: string;
  amount: number;
  discount: number;
  items: InvoiceItem[];
  notes: string;
}

const fromCustomerInvoice = (inv: Invoice): BillableDoc => ({
  id: inv.id,
  partyLabel: 'BILL TO',
  partyName: inv.customerName,
  partyHref: `/customers/${inv.customerId}`,
  date: inv.date,
  amount: inv.amount,
  discount: inv.discount,
  items: inv.items,
  notes: inv.notes,
});

const fromSupplierInvoice = (inv: SupplierInvoice): BillableDoc => ({
  id: inv.id,
  partyLabel: 'PURCHASED FROM',
  partyName: inv.supplierName,
  partyHref: '/inventory?tab=suppliers',
  date: inv.date,
  amount: inv.amount,
  discount: inv.discount,
  items: inv.items,
  notes: inv.notes,
});

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatMoney = (value: number) => `PKR ${value.toLocaleString()}`;

const buildDocHtml = (doc: BillableDoc) => {
  const subtotal = doc.items.reduce((sum, item) => sum + item.total, 0);
  const rows = doc.items
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
  const documentTitle = doc.partyLabel === 'PURCHASED FROM' ? 'PURCHASE INVOICE' : 'INVOICE';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(doc.id)} ${documentTitle}</title>
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
        <h2>${documentTitle}</h2>
        <p class="muted">#${escapeHtml(doc.id)}<br/>Date: ${escapeHtml(doc.date)}</p>
      </div>
    </section>
    <section class="bill">
      <p class="muted strong">${doc.partyLabel}</p>
      <p class="strong">${escapeHtml(doc.partyName)}</p>
      <p class="muted">Status: Paid</p>
    </section>
    <table>
      <thead>
        <tr><th>Item</th><th class="center">Qty</th><th class="right">Price</th><th class="right">Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <section class="totals">
      <div class="line"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
      <div class="line"><span>Discount</span><span>${formatMoney(doc.discount)}</span></div>
      <div class="line grand"><span>Grand Total</span><span>${formatMoney(doc.amount)}</span></div>
    </section>
    ${doc.notes.trim() ? `<section class="notes"><strong>Notes:</strong><br/>${escapeHtml(doc.notes)}</section>` : ''}
  </main>
</body>
</html>`;
};

const downloadDocFile = (doc: BillableDoc) => {
  const blob = new Blob([buildDocHtml(doc)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${doc.id}-${doc.partyName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const printDoc = (doc: BillableDoc) => {
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(buildDocHtml(doc));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
};

function InvoicesListContent() {
  const { invoices, supplierInvoices } = useApp();
  const searchParams = useSearchParams();
  const initialTab: DocTab = searchParams.get('tab') === 'suppliers' ? 'suppliers' : 'customers';

  const [activeTab, setActiveTab] = useState<DocTab>(initialTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewDoc, setPreviewDoc] = useState<BillableDoc | null>(null);

  // Real sales / purchase metrics — no baseline padding.
  const customerTotalCount = invoices.length;
  const customerTotalValue = invoices.reduce((sum, i) => sum + i.amount, 0);
  const supplierTotalCount = supplierInvoices.length;
  const supplierTotalValue = supplierInvoices.reduce((sum, i) => sum + i.amount, 0);
  const today = new Date().toISOString().split('T')[0];
  const todayCount =
    activeTab === 'customers'
      ? invoices.filter((i) => i.date === today).length
      : supplierInvoices.filter((i) => i.date === today).length;
  const avgTicket =
    activeTab === 'customers'
      ? customerTotalCount ? Math.round(customerTotalValue / customerTotalCount) : 0
      : supplierTotalCount ? Math.round(supplierTotalValue / supplierTotalCount) : 0;

  const filteredCustomerDocs = useMemo(
    () =>
      invoices
        .filter(
          (inv) =>
            inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()),
        )
        .map(fromCustomerInvoice),
    [invoices, searchTerm],
  );

  const filteredSupplierDocs = useMemo(
    () =>
      supplierInvoices
        .filter(
          (inv) =>
            inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.supplierName.toLowerCase().includes(searchTerm.toLowerCase()),
        )
        .map(fromSupplierInvoice),
    [supplierInvoices, searchTerm],
  );

  const visibleDocs = activeTab === 'customers' ? filteredCustomerDocs : filteredSupplierDocs;

  return (
    <div className="p-gutter space-y-6 max-w-[1600px] mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">Invoices</h2>
          <p className="text-body-md text-on-surface-variant text-sm mt-1">
            {activeTab === 'customers'
              ? 'Sales history — every bill is a completed, paid transaction.'
              : 'Purchase history — invoices generated from supplier deliveries.'}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          {activeTab === 'suppliers' && (
            <Link
              href="/inventory?tab=suppliers"
              className="px-4 py-2.5 border border-outline-variant text-foreground font-bold text-sm rounded-lg hover:bg-muted transition-all flex items-center gap-2"
            >
              <Icon name="add_shopping_cart" size={18} />
              Record Purchase
            </Link>
          )}
          {activeTab === 'customers' && (
            <Link
              href="/new-invoice"
              className="px-6 py-2.5 bg-primary text-on-primary font-bold text-body-md rounded-lg shadow-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 text-sm"
            >
              <Icon name="add_notes" size={18} />
              Create Invoice
            </Link>
          )}
        </div>
      </div>

      {/* Tabs: Customer Invoices / Supplier Invoices */}
      <div className="flex bg-surface-container p-1 rounded-lg w-full md:w-max select-none">
        {([
          ['customers', 'Customer Invoices', invoices.length],
          ['suppliers', 'Supplier Invoices', supplierInvoices.length],
        ] as const).map(([tab, label, count]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md font-label-md transition-all text-xs whitespace-nowrap font-bold ${
              activeTab === tab ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {label}
            <span className={`ml-2 rounded px-1.5 py-0.5 text-[9px] ${
              activeTab === tab ? 'bg-primary/10 text-primary' : 'bg-white/70 text-on-surface-variant'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Metrics Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">
            Total {activeTab === 'customers' ? 'Bills' : 'Purchases'}
          </p>
          <h3 className="text-headline-lg font-bold text-on-surface">
            {activeTab === 'customers' ? customerTotalCount : supplierTotalCount}
          </h3>
          <p className="text-[10px] text-primary font-bold mt-2">Completed transactions</p>
        </div>
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">
            Total {activeTab === 'customers' ? 'Sales' : 'Purchase'} Value
          </p>
          <h3 className="text-headline-lg font-bold text-primary">
            PKR {(activeTab === 'customers' ? customerTotalValue : supplierTotalValue).toLocaleString()}
          </h3>
          <p className="text-[10px] text-primary font-bold mt-2">
            {activeTab === 'customers' ? 'All billed revenue' : 'All billed procurement'}
          </p>
        </div>
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Today&apos;s Invoices</p>
          <h3 className="text-headline-lg font-bold text-on-surface">{todayCount}</h3>
          <p className="text-[10px] text-on-surface-variant font-bold mt-2">Billed today</p>
        </div>
        <div className="bg-surface-container-lowest p-md border border-outline-variant rounded-xl shadow-sm">
          <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Avg Ticket</p>
          <h3 className="text-headline-lg font-bold text-on-surface">PKR {avgTicket.toLocaleString()}</h3>
          <p className="text-[10px] text-on-surface-variant font-bold mt-2">Per invoice</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-end items-center shadow-sm">
        <div className="relative w-full md:w-80">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
          <input
            className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-10 pr-4 py-2 outline-none text-body-md text-sm"
            placeholder={activeTab === 'customers' ? 'Search invoice # or customer...' : 'Search invoice # or supplier...'}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Table area */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-surface-variant text-label-md text-on-surface-variant border-b border-outline-variant">
              <tr>
                <th className="px-md py-sm">Invoice ID</th>
                <th className="px-md py-sm">{activeTab === 'customers' ? 'Customer' : 'Supplier'}</th>
                <th className="px-md py-sm">Billing Date</th>
                <th className="px-md py-sm">Grand Total</th>
                <th className="px-md py-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {visibleDocs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-md py-8 text-center text-on-surface-variant italic">
                    No invoices match the search.
                  </td>
                </tr>
              ) : (
                visibleDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-surface-container transition-colors">
                    <td className="px-md py-md font-bold font-numeric-data text-primary">{doc.id}</td>
                    <td className="px-md py-md">
                      {doc.partyHref ? (
                        <Link href={doc.partyHref} className="font-bold hover:underline">
                          {doc.partyName}
                        </Link>
                      ) : (
                        <span className="font-bold">{doc.partyName}</span>
                      )}
                    </td>
                    <td className="px-md py-md font-numeric-data text-on-surface-variant">{doc.date}</td>
                    <td className="px-md py-md font-numeric-data font-bold">PKR {doc.amount.toLocaleString()}</td>
                    <td className="px-md py-md text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="p-1.5 rounded-lg border border-outline-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                          title="Preview invoice"
                        >
                          <Icon name="info" size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewDoc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-xl border border-outline-variant flex flex-col">
            <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between gap-3">
              <div>
                <h3 className="font-headline-sm font-bold text-primary text-base">
                  {previewDoc.partyLabel === 'PURCHASED FROM' ? 'Purchase Invoice Preview' : 'Invoice Preview'}
                </h3>
                <p className="text-xs text-on-surface-variant">{previewDoc.id} · {previewDoc.partyName}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="text-muted-foreground hover:bg-muted p-1 rounded-full transition-colors"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="overflow-y-auto bg-surface-container-low p-4 custom-scrollbar">
              <div className="bg-white border border-outline-variant rounded-xl shadow-md p-6 space-y-6 max-w-3xl mx-auto">
                <div className="flex justify-between items-start border-b border-outline-variant pb-4">
                  <div>
                    <h3 className="font-mono font-bold text-primary text-base tracking-wider">PSO SME</h3>
                    <p className="text-[10px] text-on-surface-variant">Retailer · Clifton, Karachi</p>
                    <p className="text-[9px] text-outline">Phone: +92 300 0000000</p>
                  </div>
                  <div className="text-right">
                    <h4 className="font-bold text-tertiary text-sm">
                      {previewDoc.partyLabel === 'PURCHASED FROM' ? 'PURCHASE INVOICE' : 'INVOICE'}
                    </h4>
                    <p className="text-[10px] text-on-surface-variant font-mono-numbers font-bold">#{previewDoc.id}</p>
                    <p className="text-[9px] text-outline mt-1 font-mono-numbers">Date: {previewDoc.date}</p>
                  </div>
                </div>

                <div className="text-[11px]">
                  <p className="font-bold text-on-surface-variant uppercase tracking-wider text-[9px] mb-1">{previewDoc.partyLabel}:</p>
                  <p className="font-bold text-on-surface text-xs">{previewDoc.partyName}</p>
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
                      {previewDoc.items.map((item) => (
                        <tr key={`${previewDoc.id}-${item.name}-${item.quantity}`}>
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
                    <span>PKR {previewDoc.items.reduce((sum, item) => sum + item.total, 0).toLocaleString()}</span>
                  </div>
                  {previewDoc.discount > 0 && (
                    <div className="flex justify-between text-error">
                      <span>Discount:</span>
                      <span>(-) PKR {previewDoc.discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-on-surface border-t border-outline-variant/50 pt-2 text-sm">
                    <span>Grand Total:</span>
                    <span className="text-primary font-bold">PKR {previewDoc.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-outline-variant flex flex-col sm:flex-row justify-between gap-3 bg-white">
              <div className="flex gap-2">
                {previewDoc.partyHref && (
                  <Link
                    href={previewDoc.partyHref}
                    className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-outline-variant text-xs font-bold text-on-surface-variant hover:bg-muted transition-colors"
                  >
                    {previewDoc.partyLabel === 'PURCHASED FROM' ? 'Suppliers' : 'Customer'}
                  </Link>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => downloadDocFile(previewDoc)}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg border border-outline-variant text-xs font-bold text-foreground hover:bg-muted transition-colors"
                >
                  <Icon name="download" size={16} />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => printDoc(previewDoc)}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/85 active:scale-[0.98] transition-all"
                >
                  <Icon name="print" size={16} />
                  Print / Save PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvoicesList() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-xs text-on-surface-variant font-bold">Loading invoices...</div>}>
      <InvoicesListContent />
    </Suspense>
  );
}
