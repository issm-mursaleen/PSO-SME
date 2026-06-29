// Shared invoice/purchase-document rendering — one HTML template + download/
// print helpers used by both the Invoices page (table preview modal) and
// Alara's chat invoice cards, so there is exactly one place that knows how a
// printable bill looks.

import type { Invoice, SupplierInvoice, InvoiceItem } from '@/context/AppContext';

/** Common shape both customer Invoices and SupplierInvoices reduce to, so the
 *  preview/print/download code only needs to know about one shape. */
export interface BillableDoc {
  id: string;
  partyLabel: 'BILL TO' | 'PURCHASED FROM';
  partyName: string;
  partyHref: string | null;
  date: string;
  amount: number;
  discount: number;
  status: 'Draft' | 'Paid';
  items: InvoiceItem[];
  notes: string;
}

export const fromCustomerInvoice = (inv: Invoice): BillableDoc => ({
  id: inv.id,
  partyLabel: 'BILL TO',
  partyName: inv.customerName,
  partyHref: `/customers/${inv.customerId}`,
  date: inv.date,
  amount: inv.amount,
  discount: inv.discount,
  status: 'Paid',
  items: inv.items,
  notes: inv.notes,
});

export const fromSupplierInvoice = (inv: SupplierInvoice): BillableDoc => ({
  id: inv.id,
  partyLabel: 'PURCHASED FROM',
  partyName: inv.supplierName,
  partyHref: `/inventory/suppliers/${inv.supplierId}`,
  date: inv.date,
  amount: inv.amount,
  discount: inv.discount,
  status: inv.status,
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

export const buildDocHtml = (doc: BillableDoc) => {
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
      <p class="muted">Status: ${escapeHtml(doc.status)}</p>
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

export const downloadDocFile = (doc: BillableDoc) => {
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

export const printDocHtml = (doc: BillableDoc) => {
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(buildDocHtml(doc));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
};
