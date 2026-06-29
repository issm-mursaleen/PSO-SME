// The Alara tool registry — the SINGLE source of truth for everything Alara can
// do. The same array generates (a) the planner's tool schema (sent to the
// backend per request) and (b) the client-side executor map. Add a capability
// here once and it is available to the LLM, the offline fallback, and the UI.
//
// Tiers:
//   read      → runs immediately, answer card.
//   navigate  → routes the app immediately.
//   write     → builds a confirmation card; mutates only on user Confirm.
//   comms     → builds a draft card; sends only on user Send.
//   destructive → like write but bulk/irreversible; extra confirm + batch cap.
//
// NOTE: This app is Sales + Outreach + Customer management only — there is no
// credit/udhar concept. Customers are ranked by lifetime sales and recency.

import type { AlaraTool, AlaraToolContext, ToolResult } from './types';
import type { Customer, StockItem, Supplier, SupplierInvoice } from '@/context/AppContext';
import { MAX_BATCH } from './guardrails';

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString()}`;

const parseInvoiceDate = (date: string) => {
  const parsed = new Date(date.split(' ')[0]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const shortDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

// ── Customer resolution (mirrors backend find_customer / candidates) ─────────
interface ResolveResult {
  customer?: Customer;
  candidates?: Customer[];
}
function resolveCustomer(query: string, customers: Customer[]): ResolveResult {
  const q = (query || '').trim().toLowerCase();
  if (!q) return {};
  const exact = customers.find((c) => c.name.toLowerCase() === q);
  if (exact) return { customer: exact };
  const substring = customers.filter((c) => c.name.toLowerCase().includes(q));
  if (substring.length === 1) return { customer: substring[0] };
  if (substring.length > 1) return { candidates: substring };
  // Token match (any word > 2 chars).
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  const tokenMatches = customers.filter((c) =>
    tokens.some((t) => c.name.toLowerCase().includes(t)),
  );
  if (tokenMatches.length === 1) return { customer: tokenMatches[0] };
  if (tokenMatches.length > 1) return { candidates: tokenMatches };
  return {};
}

/** Lifetime sales value for a customer (sum of their invoices). */
function lifetimeSales(c: Customer, ctx: AlaraToolContext): number {
  return ctx.invoices.filter((i) => i.customerId === c.id).reduce((s, i) => s + i.amount, 0);
}

function err(text: string, error: string): ToolResult {
  return { ok: false, text, error };
}

function disambiguation(
  toolName: string,
  baseArgs: Record<string, unknown>,
  query: string,
  candidates: Customer[],
): ToolResult {
  return {
    ok: false,
    text: `Kaunsa "${query}"? Ek customer choose karein.`,
    error: 'ambiguous_customer',
    cardType: 'disambiguation',
    cardData: {
      query,
      forTool: toolName,
      argKey: 'customer',
      baseArgs,
      candidates: candidates.slice(0, 6).map((c) => ({
        id: c.id,
        name: c.name,
        meta: `${c.neighborhood || '—'} · ${c.lastVisitDays}d ago`,
      })),
    },
  };
}

/** Same disambiguation flow as above, generalised for products/suppliers —
 *  `argKey` tells useAlaraChat's pickCandidate which arg to re-fill on re-run. */
function disambiguationGeneric(
  toolName: string,
  baseArgs: Record<string, unknown>,
  query: string,
  argKey: string,
  label: string,
  candidates: { id: string; name: string; meta?: string }[],
): ToolResult {
  return {
    ok: false,
    text: `Kaunsa "${query}"? Ek ${label} choose karein.`,
    error: 'ambiguous_match',
    cardType: 'disambiguation',
    cardData: {
      query,
      forTool: toolName,
      argKey,
      baseArgs,
      candidates: candidates.slice(0, 6),
    },
  };
}

// ── Product resolution (by name or SKU) ──────────────────────────────────────
interface ResolveProductResult {
  item?: StockItem;
  candidates?: StockItem[];
}
function resolveProduct(query: string, inventory: StockItem[]): ResolveProductResult {
  const q = (query || '').trim().toLowerCase();
  if (!q) return {};
  const bySku = inventory.find((i) => i.sku.toLowerCase() === q);
  if (bySku) return { item: bySku };
  const exact = inventory.find((i) => i.product.toLowerCase() === q);
  if (exact) return { item: exact };
  const substring = inventory.filter(
    (i) => i.product.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q),
  );
  if (substring.length === 1) return { item: substring[0] };
  if (substring.length > 1) return { candidates: substring };
  return {};
}

// ── Supplier resolution (by name) ────────────────────────────────────────────
interface ResolveSupplierResult {
  supplier?: Supplier;
  candidates?: Supplier[];
}
function resolveSupplier(query: string, suppliers: Supplier[]): ResolveSupplierResult {
  const q = (query || '').trim().toLowerCase();
  if (!q) return {};
  const exact = suppliers.find((s) => s.name.toLowerCase() === q);
  if (exact) return { supplier: exact };
  const substring = suppliers.filter((s) => s.name.toLowerCase().includes(q));
  if (substring.length === 1) return { supplier: substring[0] };
  if (substring.length > 1) return { candidates: substring };
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// READ TOOLS
// ─────────────────────────────────────────────────────────────────────────────
const queryData: AlaraTool = {
  name: 'query_data',
  tier: 'read',
  description:
    'Answer a shop-wide question with a fixed template: best customers by lifetime ' +
    'sales (top_by_sales), or total recorded sales (sales_today).',
  parameters: {
    type: 'object',
    properties: {
      template: {
        type: 'string',
        enum: ['top_by_sales', 'sales_today'],
        description:
          'top_by_sales = best customers by LIFETIME SALES VALUE (use for "sab se zyada ' +
          'business / most business / best customer"). sales_today = total recorded sales.',
      },
    },
    required: ['template'],
  },
  preview: (args, ctx) => {
    const template = String(args.template ?? '');
    if (template === 'top_by_sales') {
      const ranked = ctx.customers
        .map((c) => ({ c, lifetime: lifetimeSales(c, ctx) }))
        .filter((r) => r.lifetime > 0)
        .sort((a, b) => b.lifetime - a.lifetime)
        .slice(0, 5);
      if (ranked.length === 0)
        return {
          ok: true,
          text: 'Abhi tak koi sale record nahi — business ranking ke liye data missing hai.',
          cardType: 'insight',
          cardData: { title: 'Most Business', missing: ['Koi recorded sale nahi — pehle sales likhein.'] },
          data: { count: 0 },
        };
      const top = ranked[0];
      const totalAll = ctx.customers.reduce((s, c) => s + lifetimeSales(c, ctx), 0);
      const share = totalAll > 0 ? Math.round((top.lifetime / totalAll) * 100) : 0;
      const risks: string[] = [];
      if (top.c.lastVisitDays >= 14)
        risks.push(`${top.c.name} top customer hai lekin ${top.c.lastVisitDays} din se nahi aaye — re-engage karein.`);
      return {
        ok: true,
        text: `Sab se zyada business ${top.c.name} ka hai — lifetime ${pkr(top.lifetime)} (total sales ka ${share}%).`,
        cardType: 'insight',
        cardData: {
          title: 'Most Business — by lifetime sales',
          stats: [
            { label: 'Top Customer', value: top.c.name },
            { label: 'Lifetime Sales', value: pkr(top.lifetime) },
            { label: 'Last Visit', value: `${top.c.lastVisitDays}d ago` },
          ],
          context: ranked.map((r, i) => `${i + 1}. ${r.c.name} — ${pkr(r.lifetime)} business · ${r.c.lastVisitDays}d ago`),
          risks,
          steps: actionStepsForCustomer(top.c),
        },
        data: { top: ranked.map((r) => ({ id: r.c.id, name: r.c.name, lifetime: r.lifetime })) },
      };
    }
    if (template === 'sales_today') {
      const total = ctx.invoices.reduce((s, i) => s + i.amount, 0);
      return {
        ok: true,
        text: `Total recorded sales ${pkr(total)} (${ctx.invoices.length} invoices).`,
        cardType: 'metric',
        cardData: {
          title: 'Sales',
          stats: [
            { label: 'Total Sales', value: pkr(total) },
            { label: 'Invoices', value: ctx.invoices.length },
          ],
        },
        data: { total, count: ctx.invoices.length },
      };
    }
    return err('Yeh query samajh nahi aayi.', 'unknown_template');
  },
};

const getCustomer: AlaraTool = {
  name: 'get_customer',
  tier: 'read',
  description: "Show a single customer's profile: lifetime sales, last visit, contact, status.",
  parameters: {
    type: 'object',
    properties: { customer: { type: 'string', description: 'Name or part of the name' } },
    required: ['customer'],
  },
  preview: (args, ctx) => {
    const { customer, candidates } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (candidates) return disambiguation('get_customer', args, String(args.customer ?? ''), candidates);
    if (!customer) return err(`Customer "${args.customer}" nahi mila.`, 'customer_not_found');
    const lifetime = lifetimeSales(customer, ctx);
    return {
      ok: true,
      text: `${customer.name} — ${pkr(lifetime)} lifetime sales, last visit ${customer.lastVisitDays}d ago.`,
      cardType: 'metric',
      cardData: {
        title: customer.name,
        stats: [
          { label: 'Lifetime Sales', value: pkr(lifetime) },
          { label: 'Last Visit', value: `${customer.lastVisitDays}d ago` },
          { label: 'Status', value: customer.status },
        ],
      },
      data: { customer_id: customer.id },
    };
  },
};

// ── Visit helpers ────────────────────────────────────────────────────────────
/** Last-visit date derived from lastVisitDays (today − N), the only recency
 *  field on record. Returns the absolute date + a Roman-Urdu relative phrase. */
function lastVisitInfo(c: Customer): { date: Date; absolute: string; relative: string } {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - c.lastVisitDays);
  const absolute = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const relative =
    c.lastVisitDays <= 0 ? 'aaj' : c.lastVisitDays === 1 ? 'kal (1 din pehle)' : `${c.lastVisitDays} din pehle`;
  return { date, absolute, relative };
}

const customerVisit: AlaraTool = {
  name: 'customer_visit',
  tier: 'read',
  description:
    'Answer a VISIT/RECENCY question about ONE customer ("X last time kab aaya/aayi thi", ' +
    '"kitne din se nahi aaya", "woh aakhri baar kab aaya"). Returns the exact last-visit ' +
    'date, the relative time ("3 din pehle"), the last sale amount, and typical visit ' +
    'frequency when derivable. Exact clock time is NOT recorded in the data, so it is ' +
    'reported as unavailable rather than invented.',
  parameters: {
    type: 'object',
    properties: { customer: { type: 'string', description: 'Name or part of the name' } },
    required: ['customer'],
  },
  preview: (args, ctx) => {
    const { customer, candidates } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (candidates) return disambiguation('customer_visit', args, String(args.customer ?? ''), candidates);
    if (!customer) return err(`Customer "${args.customer}" nahi mila.`, 'customer_not_found');

    const visit = lastVisitInfo(customer);

    // Last sale: most recent invoice for this customer (date-only in the data).
    const sales = ctx.invoices
      .filter((i) => i.customerId === customer.id)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
    const lastSale = sales[0];

    // Typical visit frequency: average gap between this customer's invoice dates.
    let frequency: string | null = null;
    let nextExpected: string | null = null;
    if (sales.length >= 2) {
      const times = sales
        .map((i) => new Date(i.date.split(' ')[0]).getTime())
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => a - b);
      if (times.length >= 2) {
        const spanDays = (times[times.length - 1] - times[0]) / 86_400_000;
        const avg = Math.round(spanDays / (times.length - 1));
        if (avg > 0) {
          frequency = `Takreeban har ${avg} din baad aate hain (${times.length} visits se).`;
          const next = new Date(visit.date);
          next.setDate(next.getDate() + avg);
          nextExpected = next.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        }
      }
    }

    const stats = [
      { label: 'Last Visit', value: visit.absolute },
      { label: 'Kitna Pehle', value: visit.relative },
    ];
    if (lastSale) stats.push({ label: 'Last Sale', value: pkr(lastSale.amount) });

    const context: string[] = [`${customer.name} aakhri baar ${visit.absolute} ko aaye the — yani ${visit.relative}.`];
    context.push('Exact waqt (time) record nahi hua — sirf tareekh maujood hai.');
    if (frequency) context.push(frequency);
    if (nextExpected) context.push(`Is hisaab se agla visit ~${nextExpected} ke aas paas expected hai.`);

    const missing: string[] = [];
    if (!lastSale) missing.push('Is customer ki koi recorded sale nahi mili — last sale amount maujood nahi.');

    // One relevant next action only.
    const steps: NextStep[] = [];
    if (customer.lastVisitDays >= 14)
      steps.push({
        label: `${customer.name} ko win-back offer bhejo`,
        prompt: `${customer.name} ko ek dostana offer message bhejo`,
        reason: `${visit.relative} se koi khareedari nahi`,
        tone: 'opportunity',
      });
    else if (customer.lastVisitDays >= 7)
      steps.push({
        label: `${customer.name} ko check-in message bhejo`,
        prompt: `${customer.name} ko reminder bhejo`,
        reason: `${visit.relative} — halka sa check-in due hai`,
        tone: 'normal',
      });
    else
      steps.push({
        label: `${customer.name} ka profile kholo`,
        prompt: `${customer.name} ka page kholo`,
        reason: 'Poori visit history aur sales',
        tone: 'normal',
      });

    const direct =
      `${customer.name} aakhri baar ${visit.absolute} ko aaye the — yani ${visit.relative}.` +
      (lastSale ? ` Us waqt ${pkr(lastSale.amount)} ki sale hui thi.` : '');

    return {
      ok: true,
      text: direct,
      cardType: 'insight',
      cardData: {
        title: `${customer.name} — Last Visit`,
        stats,
        context,
        missing,
        steps,
      },
      data: { customer_id: customer.id, last_visit_days: customer.lastVisitDays, last_visit: visit.absolute },
    };
  },
};

const listCustomers: AlaraTool = {
  name: 'list_customers',
  tier: 'read',
  description:
    'List customers, optionally filtered: all, or inactive (no visit in >= N days). ' +
    'Sorted by lifetime sales.',
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string', enum: ['all', 'inactive'] },
      idle_days: { type: 'integer', description: 'Threshold for the "inactive" filter' },
      limit: { type: 'integer' },
    },
  },
  preview: (args, ctx) => {
    const filter = String(args.filter ?? 'all');
    const idle = Number(args.idle_days ?? 7) || 7;
    const limit = Math.min(Number(args.limit ?? 20) || 20, 50);
    let rows = ctx.customers.slice();
    if (filter === 'inactive') rows = rows.filter((c) => c.lastVisitDays >= idle);
    rows.sort((a, b) => lifetimeSales(b, ctx) - lifetimeSales(a, ctx));
    rows = rows.slice(0, limit);
    return {
      ok: true,
      text: `${rows.length} customers (${filter === 'inactive' ? `inactive ${idle}d+` : 'all'}).`,
      cardType: 'list',
      cardData: {
        title: `Customers — ${filter === 'inactive' ? `inactive ${idle}d+` : 'all'}`,
        rows: rows.map((c) => ({
          primary: c.name,
          secondary: `${c.neighborhood} · ${c.lastVisitDays}d ago`,
          meta: pkr(lifetimeSales(c, ctx)),
          customerId: c.id,
        })),
      },
      data: { customer_ids: rows.map((c) => c.id) },
    };
  },
};

// ── Inventory: single product + listing ──────────────────────────────────────
const getProduct: AlaraTool = {
  name: 'get_product',
  tier: 'read',
  description:
    "Show one inventory product's details: current stock, reorder level, status, " +
    'preferred supplier, and its most recent stock movement. Look up by product name or SKU.',
  parameters: {
    type: 'object',
    properties: { product: { type: 'string', description: 'Product name or SKU' } },
    required: ['product'],
  },
  preview: (args, ctx) => {
    const query = String(args.product ?? '');
    const { item, candidates } = resolveProduct(query, ctx.inventory);
    if (candidates)
      return disambiguationGeneric(
        'get_product',
        args,
        query,
        'product',
        'product',
        candidates.map((c) => ({ id: c.sku, name: c.product, meta: `${c.sku} · ${c.current} in stock` })),
      );
    if (!item) return err(`"${query}" naam ka koi product nahi mila.`, 'product_not_found');

    const supplier = ctx.suppliers.find((s) => s.id === item.supplierId);
    const status = item.current <= 0 ? 'Out of Stock' : item.current <= item.reorder ? 'Low Stock' : 'Healthy';
    const lastMovement = ctx.stockMovements
      .filter((m) => m.sku === item.sku)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    return {
      ok: true,
      text: `${item.product} — ${item.current} units in stock (reorder level ${item.reorder}), status ${status}.`,
      cardType: 'metric',
      cardData: {
        title: item.product,
        stats: [
          { label: 'Current Stock', value: item.current },
          { label: 'Reorder Level', value: item.reorder },
          { label: 'Status', value: status },
          { label: 'Preferred Supplier', value: supplier?.name ?? 'Not set' },
          { label: 'SKU', value: item.sku },
          ...(lastMovement
            ? [{ label: 'Last Movement', value: `${lastMovement.type} (${lastMovement.quantity > 0 ? '+' : ''}${lastMovement.quantity})` }]
            : []),
        ],
      },
      data: { sku: item.sku },
    };
  },
};

const listInventory: AlaraTool = {
  name: 'list_inventory',
  tier: 'read',
  description: 'List inventory products, optionally filtered: all, low_stock, or out_of_stock.',
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string', enum: ['all', 'low_stock', 'out_of_stock'] },
      limit: { type: 'integer' },
    },
  },
  preview: (args, ctx) => {
    const filter = String(args.filter ?? 'all');
    const limit = Math.min(Number(args.limit ?? 20) || 20, 50);
    let rows = ctx.inventory.slice();
    if (filter === 'low_stock') rows = rows.filter((i) => i.current > 0 && i.current <= i.reorder);
    if (filter === 'out_of_stock') rows = rows.filter((i) => i.current <= 0);
    rows.sort((a, b) => a.current - a.reorder - (b.current - b.reorder));
    rows = rows.slice(0, limit);
    return {
      ok: true,
      text: `${rows.length} products (${filter === 'all' ? 'all' : filter.replace('_', ' ')}).`,
      cardType: 'list',
      cardData: {
        title: `Inventory — ${filter === 'all' ? 'all products' : filter.replace('_', ' ')}`,
        rows: rows.map((i) => ({
          primary: i.product,
          secondary: `${i.sku} · ${i.category}`,
          meta: `${i.current}/${i.reorder}`,
        })),
      },
      data: { skus: rows.map((i) => i.sku) },
    };
  },
};

// ── Suppliers: single supplier + listing ─────────────────────────────────────
const getSupplier: AlaraTool = {
  name: 'get_supplier',
  tier: 'read',
  description:
    "Give a 360° view of one supplier: contact info, category, lifetime purchases, " +
    'products supplied, and outstanding draft invoices. Look up by supplier name.',
  parameters: {
    type: 'object',
    properties: { supplier: { type: 'string', description: 'Supplier name or part of the name' } },
    required: ['supplier'],
  },
  preview: (args, ctx) => {
    const query = String(args.supplier ?? '');
    const { supplier, candidates } = resolveSupplier(query, ctx.suppliers);
    if (candidates)
      return disambiguationGeneric(
        'get_supplier',
        args,
        query,
        'supplier',
        'supplier',
        candidates.map((s) => ({ id: s.id, name: s.name, meta: `${s.category} · ${s.status}` })),
      );
    if (!supplier) return err(`"${query}" naam ka koi supplier nahi mila.`, 'supplier_not_found');

    const invoices = ctx.supplierInvoices.filter((inv) => inv.supplierId === supplier.id);
    const paid = invoices.filter((inv) => inv.status === 'Paid');
    const drafts = invoices.filter((inv) => inv.status === 'Draft');
    const lifetime = paid.reduce((s, inv) => s + inv.amount, 0);
    const outstanding = drafts.reduce((s, inv) => s + inv.amount, 0);
    const products = ctx.inventory.filter((i) => i.supplierId === supplier.id);
    const lastInvoice = invoices.slice().sort((a, b) => b.date.localeCompare(a.date))[0];

    const context: string[] = [
      `Contact: ${supplier.contactPerson || '—'} · ${supplier.phone}`,
      `Category: ${supplier.category}`,
    ];
    if (lastInvoice) context.push(`Last purchase ${lastInvoice.date} — ${pkr(lastInvoice.amount)} (${lastInvoice.status}).`);
    if (products.length) context.push(`Supplies: ${products.map((p) => p.product).join(', ')}.`);

    const risks: string[] = [];
    if (drafts.length)
      risks.push(`${drafts.length} draft purchase(s) worth ${pkr(outstanding)} abhi confirm/receive nahi hui.`);

    return {
      ok: true,
      text:
        lifetime > 0
          ? `${supplier.name} se lifetime ${pkr(lifetime)} ka purchase hua hai (${paid.length} invoices), ${products.length} products supply karte hain.`
          : `${supplier.name} se abhi tak koi confirmed purchase nahi.`,
      cardType: 'insight',
      cardData: {
        title: supplier.name,
        stats: [
          { label: 'Lifetime Purchases', value: pkr(lifetime) },
          { label: 'Products Supplied', value: products.length },
          { label: 'Purchase Invoices', value: invoices.length },
          { label: 'Outstanding', value: pkr(outstanding) },
          { label: 'Status', value: supplier.status },
        ],
        context,
        risks,
        steps: [
          {
            label: `${supplier.name} ka page kholo`,
            prompt: `${supplier.name} ka supplier page kholo`,
            reason: 'Full purchase history dekhein',
            tone: 'normal',
          },
        ],
      },
      data: { supplier_id: supplier.id },
    };
  },
};

const listSuppliers: AlaraTool = {
  name: 'list_suppliers',
  tier: 'read',
  description: 'List suppliers, optionally filtered: all or active. Sorted by lifetime (paid) purchases.',
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string', enum: ['all', 'active'] },
      limit: { type: 'integer' },
    },
  },
  preview: (args, ctx) => {
    const filter = String(args.filter ?? 'all');
    const limit = Math.min(Number(args.limit ?? 20) || 20, 50);
    const lifetimeOf = (s: Supplier) =>
      ctx.supplierInvoices
        .filter((inv) => inv.supplierId === s.id && inv.status === 'Paid')
        .reduce((sum, inv) => sum + inv.amount, 0);
    let rows = ctx.suppliers.slice();
    if (filter === 'active') rows = rows.filter((s) => s.status === 'Active');
    rows.sort((a, b) => lifetimeOf(b) - lifetimeOf(a));
    rows = rows.slice(0, limit);
    return {
      ok: true,
      text: `${rows.length} suppliers (${filter}).`,
      cardType: 'list',
      cardData: {
        title: `Suppliers — ${filter}`,
        rows: rows.map((s) => ({
          primary: s.name,
          secondary: s.category,
          meta: pkr(lifetimeOf(s)),
        })),
      },
      data: { supplier_ids: rows.map((s) => s.id) },
    };
  },
};

type SupplierPayableStatus = 'all' | 'paid' | 'pending' | 'due_soon' | 'overdue' | 'draft';
type SupplierSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'supplier_asc';

const SUPPLIER_DUE_DAYS = 7;
const DAY_MS = 86_400_000;

function supplierInvoiceDate(inv: SupplierInvoice): Date | null {
  return parseInvoiceDate(inv.date);
}

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((todayStart().getTime() - date.getTime()) / DAY_MS));
}

function payableStatus(inv: SupplierInvoice): 'paid' | 'pending' | 'due_soon' | 'overdue' {
  if (inv.status === 'Paid') return 'paid';
  const date = supplierInvoiceDate(inv);
  if (!date) return 'pending';
  return daysSince(date) > SUPPLIER_DUE_DAYS ? 'overdue' : 'due_soon';
}

function invoiceMatchesStatus(inv: SupplierInvoice, status: SupplierPayableStatus): boolean {
  if (status === 'all') return true;
  if (status === 'draft' || status === 'pending') return inv.status === 'Draft';
  return payableStatus(inv) === status;
}

function filterSupplierInvoices(
  invoices: SupplierInvoice[],
  ctx: AlaraToolContext,
  args: Record<string, unknown>,
): { rows: SupplierInvoice[]; supplier?: Supplier; filters: string[]; error?: ToolResult } {
  const filters: string[] = [];
  let supplier: Supplier | undefined;
  const supplierQuery = String(args.supplier ?? '').trim();
  if (supplierQuery) {
    const resolved = resolveSupplier(supplierQuery, ctx.suppliers);
    if (resolved.candidates) {
      return {
        rows: [],
        filters,
        error: disambiguationGeneric(
          String(args.__toolName ?? 'supplier_purchase_analysis'),
          args,
          supplierQuery,
          'supplier',
          'supplier',
          resolved.candidates.map((s) => ({ id: s.id, name: s.name, meta: `${s.category} - ${s.status}` })),
        ),
      };
    }
    if (!resolved.supplier) {
      return { rows: [], filters, error: err(`"${supplierQuery}" naam ka supplier nahi mila.`, 'supplier_not_found') };
    }
    supplier = resolved.supplier;
    filters.push(`supplier=${supplier.name}`);
  }

  const status = String(args.status ?? 'all').toLowerCase() as SupplierPayableStatus;
  if (status !== 'all') filters.push(`status=${status}`);

  const start = args.startDate ? parseInvoiceDate(String(args.startDate)) : null;
  const end = args.endDate ? parseInvoiceDate(String(args.endDate)) : null;
  if (start) filters.push(`from=${start.toISOString().slice(0, 10)}`);
  if (end) filters.push(`to=${end.toISOString().slice(0, 10)}`);

  const item = String(args.item ?? '').trim().toLowerCase();
  if (item) filters.push(`item=${item}`);
  const minAmount = Number(args.minAmount ?? Number.NEGATIVE_INFINITY);
  const maxAmount = Number(args.maxAmount ?? Number.POSITIVE_INFINITY);
  if (Number.isFinite(minAmount)) filters.push(`min_amount=${minAmount}`);
  if (Number.isFinite(maxAmount)) filters.push(`max_amount=${maxAmount}`);

  let rows = invoices.slice();
  if (supplier) rows = rows.filter((inv) => inv.supplierId === supplier.id);
  rows = rows.filter((inv) => invoiceMatchesStatus(inv, status));
  if (start) rows = rows.filter((inv) => {
    const d = supplierInvoiceDate(inv);
    return Boolean(d && d.getTime() >= start.getTime());
  });
  if (end) rows = rows.filter((inv) => {
    const d = supplierInvoiceDate(inv);
    return Boolean(d && d.getTime() <= end.getTime());
  });
  if (item) rows = rows.filter((inv) => inv.items.some((it) => it.name.toLowerCase().includes(item)));
  rows = rows.filter((inv) => inv.amount >= minAmount && inv.amount <= maxAmount);

  const sort = String(args.sort ?? 'date_desc') as SupplierSort;
  rows.sort((a, b) => {
    if (sort === 'date_asc') return a.date.localeCompare(b.date);
    if (sort === 'amount_desc') return b.amount - a.amount;
    if (sort === 'amount_asc') return a.amount - b.amount;
    if (sort === 'supplier_asc') return a.supplierName.localeCompare(b.supplierName);
    return b.date.localeCompare(a.date);
  });
  filters.push(`sort=${sort}`);

  return { rows, supplier, filters };
}

function supplierInvoiceLineSummary(inv: SupplierInvoice): string {
  const first = inv.items[0];
  if (!first) return 'No line items';
  const extra = inv.items.length > 1 ? ` +${inv.items.length - 1} more` : '';
  return `${first.name} x ${first.quantity}${extra}`;
}

function friendlySupplierView(filters: string[]): string {
  const parts = filters
    .filter((f) => !f.startsWith('sort=') && !f.startsWith('dataset='))
    .map((f) => {
      const [key, ...rest] = f.split('=');
      const value = rest.join('=');
      if (!value) return '';
      if (key === 'supplier') return value;
      if (key === 'status') {
        const labels: Record<string, string> = {
          paid: 'paid invoices',
          pending: 'pending invoices',
          due_soon: 'due soon',
          overdue: 'overdue invoices',
          draft: 'draft invoices',
        };
        return labels[value] ?? value;
      }
      if (key === 'from') return `from ${value}`;
      if (key === 'to') return `until ${value}`;
      if (key === 'item') return `item: ${value}`;
      if (key === 'min_amount') return `minimum ${pkr(Number(value))}`;
      if (key === 'max_amount') return `maximum ${pkr(Number(value))}`;
      return value;
    })
    .filter(Boolean);
  return parts.length ? parts.join(' - ') : 'all supplier records';
}

function supplierActionSteps(supplier?: Supplier): NextStep[] {
  const label = supplier ? supplier.name : 'suppliers';
  const promptName = supplier ? `${supplier.name} ` : '';
  return [
    {
      label: `${label} payables dekho`,
      prompt: `${promptName}supplier payables dikhao`,
      reason: 'Pending, due-soon aur overdue invoices',
      tone: 'normal',
    },
    {
      label: `${label} CSV export karo`,
      prompt: `${promptName}supplier purchases CSV mein do`,
      reason: 'Filtered rows download ke liye',
      tone: 'opportunity',
    },
  ] satisfies NextStep[];
}

const supplierPurchaseAnalysis: AlaraTool = {
  name: 'supplier_purchase_analysis',
  tier: 'read',
  description:
    'Analyze supplier purchases by supplier, item, date range, invoice/payment status, rank suppliers, and show totals, average order value and contribution. Never invent totals.',
  parameters: {
    type: 'object',
    properties: {
      supplier: { type: 'string', description: 'Supplier name or partial name.' },
      item: { type: 'string', description: 'Filter by purchased item name.' },
      status: { type: 'string', enum: ['all', 'paid', 'pending', 'due_soon', 'overdue', 'draft'] },
      startDate: { type: 'string', description: 'YYYY-MM-DD inclusive start date.' },
      endDate: { type: 'string', description: 'YYYY-MM-DD inclusive end date.' },
      sort: { type: 'string', enum: ['date_desc', 'date_asc', 'amount_desc', 'amount_asc', 'supplier_asc'] },
      limit: { type: 'integer' },
    },
  },
  preview: (args, ctx) => {
    const filtered = filterSupplierInvoices(ctx.supplierInvoices, ctx, { ...args, __toolName: 'supplier_purchase_analysis' });
    if (filtered.error) return filtered.error;
    const limit = Math.min(Math.max(Number(args.limit ?? 8) || 8, 1), 25);
    const rows = filtered.rows.slice(0, limit);
    if (filtered.rows.length === 0) {
      return {
        ok: true,
        text: 'Is supplier purchase filter pe koi data nahi mila. Date range ya status change karke try karein.',
        cardType: 'insight',
        cardData: {
          title: 'Supplier Purchase Analysis',
          stats: [{ label: 'Records', value: 0 }],
          missing: [`Showing: ${friendlySupplierView(filtered.filters)}.`],
          steps: [{ label: 'All supplier purchases dekho', prompt: 'supplier purchases dikhao', reason: 'Puri purchase list', tone: 'normal' }],
        },
        data: { count: 0 },
      };
    }

    const total = filtered.rows.reduce((sum, inv) => sum + inv.amount, 0);
    const avg = total / filtered.rows.length;
    const paid = filtered.rows.filter((inv) => inv.status === 'Paid').reduce((sum, inv) => sum + inv.amount, 0);
    const outstanding = filtered.rows.filter((inv) => inv.status === 'Draft').reduce((sum, inv) => sum + inv.amount, 0);
    const supplierTotals = new Map<string, { name: string; amount: number; count: number }>();
    for (const inv of filtered.rows) {
      const current = supplierTotals.get(inv.supplierId) ?? { name: inv.supplierName, amount: 0, count: 0 };
      current.amount += inv.amount;
      current.count += 1;
      supplierTotals.set(inv.supplierId, current);
    }
    const ranked = Array.from(supplierTotals.values()).sort((a, b) => b.amount - a.amount);
    const top = ranked[0];
    const topShare = top && total > 0 ? Math.round((top.amount / total) * 100) : 0;
    const latest = filtered.rows.slice().sort((a, b) => b.date.localeCompare(a.date))[0];

    return {
      ok: true,
      text: `${filtered.supplier?.name ?? 'Suppliers'} purchase analysis: ${pkr(total)} total, ${filtered.rows.length} records, avg order ${pkr(avg)}.`,
      cardType: 'insight',
      cardData: {
        title: filtered.supplier ? `${filtered.supplier.name} - Purchases` : 'Supplier Purchase Analysis',
        stats: [
          { label: 'Total Purchases', value: pkr(total) },
          { label: 'Records', value: filtered.rows.length },
          { label: 'Avg Order', value: pkr(avg) },
          { label: 'Paid', value: pkr(paid) },
          { label: 'Outstanding', value: pkr(outstanding) },
          { label: 'Top Share', value: top ? `${top.name} (${topShare}%)` : 'N/A' },
        ],
        context: [
          `Showing: ${friendlySupplierView(filtered.filters)}.`,
          latest ? `Last transaction: ${latest.date} - ${latest.supplierName} - ${pkr(latest.amount)} (${latest.status}).` : '',
          ...rows.map((inv) => `${inv.date} - ${inv.supplierName} - ${supplierInvoiceLineSummary(inv)} - ${pkr(inv.amount)} (${inv.status})`),
        ].filter(Boolean),
        steps: supplierActionSteps(filtered.supplier),
      },
      data: {
        count: filtered.rows.length,
        total,
        invoice_ids: filtered.rows.map((inv) => inv.id),
        supplier_totals: ranked,
      },
    };
  },
};

const supplierPayables: AlaraTool = {
  name: 'supplier_payables',
  tier: 'read',
  description:
    'Show supplier paid, pending, due-soon and overdue invoices. Calculates outstanding balance and overdue days from Draft invoices using the platform due window.',
  parameters: {
    type: 'object',
    properties: {
      supplier: { type: 'string', description: 'Supplier name or partial name.' },
      status: { type: 'string', enum: ['all', 'paid', 'pending', 'due_soon', 'overdue'] },
      limit: { type: 'integer' },
    },
  },
  preview: (args, ctx) => {
    const filtered = filterSupplierInvoices(ctx.supplierInvoices, ctx, { ...args, __toolName: 'supplier_payables' });
    if (filtered.error) return filtered.error;
    const rows = filtered.rows;
    const limit = Math.min(Math.max(Number(args.limit ?? 10) || 10, 1), 30);
    const outstandingRows = rows.filter((inv) => inv.status === 'Draft');
    const overdueRows = rows.filter((inv) => payableStatus(inv) === 'overdue');
    const outstanding = outstandingRows.reduce((sum, inv) => sum + inv.amount, 0);
    const overdue = overdueRows.reduce((sum, inv) => sum + inv.amount, 0);
    const paid = rows.filter((inv) => inv.status === 'Paid').reduce((sum, inv) => sum + inv.amount, 0);
    const displayRows = rows.slice(0, limit);

    return {
      ok: true,
      text:
        rows.length === 0
          ? 'Is payable filter pe koi supplier invoice nahi mila.'
          : `${filtered.supplier?.name ?? 'Supplier'} payables: ${pkr(outstanding)} outstanding, ${pkr(overdue)} overdue.`,
      cardType: 'insight',
      cardData: {
        title: filtered.supplier ? `${filtered.supplier.name} - Payables` : 'Supplier Payables',
        stats: [
          { label: 'Outstanding', value: pkr(outstanding) },
          { label: 'Overdue', value: pkr(overdue) },
          { label: 'Paid Total', value: pkr(paid) },
          { label: 'Invoices', value: rows.length },
        ],
        context: [
          `Showing: ${friendlySupplierView(filtered.filters)}. Draft supplier bills are treated as due after ${SUPPLIER_DUE_DAYS} days.`,
          ...displayRows.map((inv) => {
            const d = supplierInvoiceDate(inv);
            const overdueDays = d && payableStatus(inv) === 'overdue' ? Math.max(0, daysSince(d) - SUPPLIER_DUE_DAYS) : 0;
            const due = d ? addDays(d, SUPPLIER_DUE_DAYS).toISOString().slice(0, 10) : 'N/A';
            return `${inv.id} - ${inv.supplierName} - ${pkr(inv.amount)} - ${payableStatus(inv)} - due ${due}${overdueDays ? ` (${overdueDays} overdue days)` : ''}`;
          }),
        ],
        steps: supplierActionSteps(filtered.supplier),
      },
      data: {
        count: rows.length,
        outstanding,
        overdue,
        invoice_ids: rows.map((inv) => inv.id),
      },
    };
  },
};

const draftSupplierInvoice: AlaraTool = {
  name: 'draft_supplier_invoice',
  tier: 'write',
  description:
    'Generate a supplier invoice preview from selected Draft purchase/receiving records. Never creates/posts permanently until user confirms the preview.',
  parameters: {
    type: 'object',
    properties: {
      supplier: { type: 'string', description: 'Supplier name or partial name. Required unless invoiceIds are specific.' },
      invoiceIds: { type: 'array', items: { type: 'string' }, description: 'Draft supplier invoice or receiving record ids to include.' },
      discount: { type: 'number' },
      tax: { type: 'number' },
      deliveryCharges: { type: 'number' },
      paidAmount: { type: 'number' },
      dueDate: { type: 'string', description: 'YYYY-MM-DD due date for preview.' },
    },
  },
  preview: (args, ctx) => {
    const ids = Array.isArray(args.invoiceIds) ? (args.invoiceIds as unknown[]).map(String) : [];
    let supplier: Supplier | undefined;
    if (args.supplier) {
      const resolved = resolveSupplier(String(args.supplier), ctx.suppliers);
      if (resolved.candidates)
        return disambiguationGeneric(
          'draft_supplier_invoice',
          args,
          String(args.supplier),
          'supplier',
          'supplier',
          resolved.candidates.map((s) => ({ id: s.id, name: s.name, meta: `${s.category} - ${s.status}` })),
        );
      supplier = resolved.supplier;
    }
    let source = ctx.supplierInvoices.filter((inv) => inv.status === 'Draft');
    if (ids.length) source = source.filter((inv) => ids.includes(inv.id));
    if (supplier) {
      const supplierId = supplier.id;
      source = source.filter((inv) => inv.supplierId === supplierId);
    }
    const suppliers = Array.from(new Set(source.map((inv) => inv.supplierId)));
    if (!supplier && suppliers.length === 1) supplier = ctx.suppliers.find((s) => s.id === suppliers[0]);
    if (!supplier) {
      return err('Supplier invoice preview ke liye supplier ka naam chahiye, ya specific draft invoice ids dein.', 'supplier_required');
    }
    const selectedSupplier = supplier;
    if (source.length === 0) {
      return err(`${selectedSupplier.name} ke liye koi uninvoiced Draft purchase/receiving record nahi mila.`, 'no_draft_records');
    }

    const merged = new Map<string, { name: string; quantity: number; unit: string; price: number; total: number }>();
    for (const inv of source) {
      for (const item of inv.items) {
        const key = `${item.name}|${item.unit}|${item.price}`;
        const current = merged.get(key) ?? { name: item.name, quantity: 0, unit: item.unit, price: item.price, total: 0 };
        current.quantity += item.quantity;
        current.total += item.total;
        merged.set(key, current);
      }
    }
    const items = Array.from(merged.values());
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discount = Math.max(0, Number(args.discount ?? 0) || 0);
    const tax = Math.max(0, Number(args.tax ?? 0) || 0);
    const deliveryCharges = Math.max(0, Number(args.deliveryCharges ?? 0) || 0);
    const paidAmount = Math.max(0, Number(args.paidAmount ?? 0) || 0);
    const grandTotal = Math.max(0, subtotal - discount + tax + deliveryCharges);
    const balance = Math.max(0, grandTotal - paidAmount);
    const defaultDue = addDays(todayStart(), SUPPLIER_DUE_DAYS).toISOString().slice(0, 10);
    const dueDate = String(args.dueDate ?? defaultDue);

    return {
      ok: true,
      text: `${selectedSupplier.name} ka supplier invoice preview ready hai: ${pkr(grandTotal)} total, balance ${pkr(balance)}. Confirm ke baghair final invoice create nahi hoga.`,
      cardType: 'invoice',
      cardData: {
        customer_id: selectedSupplier.id,
        customer_name: selectedSupplier.name,
        invoice_label: 'Supplier Invoice Draft',
        sourceInvoiceIds: source.map((inv) => inv.id),
        items: items.map((item) => ({ name: item.name, qty: item.quantity, total: item.total })),
        subtotal,
        discount,
        tax,
        deliveryCharges,
        paidAmount,
        balance,
        dueDate,
        total: grandTotal,
        pending: true,
      },
      data: { supplier_id: selectedSupplier.id, source_invoice_ids: source.map((inv) => inv.id), total: grandTotal },
    };
  },
  commit: (args, ctx) => {
    const resolved = resolveSupplier(String(args.supplier ?? ''), ctx.suppliers);
    const supplier = resolved.supplier;
    if (!supplier) return err('Supplier nahi mila.', 'supplier_not_found');
    const ids = Array.isArray(args.invoiceIds) ? (args.invoiceIds as unknown[]).map(String) : [];
    let source = ctx.supplierInvoices.filter((inv) => inv.status === 'Draft' && inv.supplierId === supplier.id);
    if (ids.length) source = source.filter((inv) => ids.includes(inv.id));
    if (source.length === 0) return err('Confirm karne ke liye koi Draft source record nahi mila.', 'no_draft_records');

    const items = source.flatMap((inv) => inv.items).map((item) => ({ ...item }));
    const discount = Math.max(0, Number(args.discount ?? 0) || 0);
    const invoice = ctx.recordPurchase(
      supplier.id,
      items,
      discount,
      `Supplier invoice created via Alara from ${source.map((inv) => inv.id).join(', ')}`,
      { status: 'Draft', invoiceNumber: `ALARA-${Date.now().toString().slice(-6)}` },
    );
    return {
      ok: true,
      text: `Supplier invoice draft ${invoice.id} create ho gaya - ${supplier.name}, ${pkr(invoice.amount)}. View/download ya payment record kar sakte hain.`,
      cardType: 'invoice',
      cardData: {
        invoice_id: invoice.id,
        customer_id: supplier.id,
        customer_name: supplier.name,
        items: invoice.items.map((item) => ({ name: item.name, qty: item.quantity, total: item.total })),
        total: invoice.amount,
      },
      navigateTo: `/suppliers/${supplier.id}`,
    };
  },
};

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function buildCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(csvEscape).join(',');
  const body = rows.map((row) => columns.map((col) => csvEscape(row[col])).join(',')).join('\n');
  return `${header}\n${body}`;
}

const exportSupplierCsv: AlaraTool = {
  name: 'export_supplier_csv',
  tier: 'read',
  description:
    'Prepare a CSV-ready supplier dataset using the exact filtered records currently shown: suppliers, supplier invoices, or supplier purchase line items. Show record count, columns, filters and 5-row preview before export.',
  parameters: {
    type: 'object',
    properties: {
      dataset: { type: 'string', enum: ['suppliers', 'supplier_invoices', 'supplier_purchase_items'] },
      supplier: { type: 'string' },
      status: { type: 'string', enum: ['all', 'paid', 'pending', 'due_soon', 'overdue', 'draft'] },
      startDate: { type: 'string' },
      endDate: { type: 'string' },
      item: { type: 'string' },
      minAmount: { type: 'number' },
      maxAmount: { type: 'number' },
      sort: { type: 'string', enum: ['date_desc', 'date_asc', 'amount_desc', 'amount_asc', 'supplier_asc'] },
      columns: { type: 'array', items: { type: 'string' } },
      limit: { type: 'integer' },
    },
  },
  preview: (args, ctx) => {
    const dataset = String(args.dataset ?? 'supplier_invoices');
    const limit = Math.min(Math.max(Number(args.limit ?? 500) || 500, 1), 5000);
    const requestedColumns = Array.isArray(args.columns)
      ? (args.columns as unknown[]).map(String).filter(Boolean)
      : [];
    let rows: Record<string, unknown>[] = [];
    let filters: string[] = [];

    if (dataset === 'suppliers') {
      rows = ctx.suppliers.map((s) => {
        const invoices = ctx.supplierInvoices.filter((inv) => inv.supplierId === s.id);
        const paid = invoices.filter((inv) => inv.status === 'Paid').reduce((sum, inv) => sum + inv.amount, 0);
        const outstanding = invoices.filter((inv) => inv.status === 'Draft').reduce((sum, inv) => sum + inv.amount, 0);
        const last = invoices.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
        return {
          supplier_id: s.id,
          supplier_name: s.name,
          contact_person: s.contactPerson,
          phone: s.phone,
          category: s.category,
          status: s.status,
          last_transaction_date: last?.date ?? '',
          lifetime_paid_purchases: paid,
          outstanding_balance: outstanding,
        };
      });
      filters = ['Supplier directory'];
      const supplierQuery = String(args.supplier ?? '').trim().toLowerCase();
      if (supplierQuery) {
        rows = rows.filter((row) => String(row.supplier_name).toLowerCase().includes(supplierQuery));
        filters.push(`Supplier name includes ${supplierQuery}`);
      }
      const status = String(args.status ?? 'all').toLowerCase();
      if (status !== 'all') {
        rows = rows.filter((row) => String(row.status).toLowerCase() === status);
        filters.push(`${status} suppliers`);
      }
    } else {
      const filtered = filterSupplierInvoices(ctx.supplierInvoices, ctx, { ...args, __toolName: 'export_supplier_csv' });
      if (filtered.error) return filtered.error;
      filters = [
        dataset === 'supplier_purchase_items' ? 'Supplier purchase items' : 'Supplier invoices',
        friendlySupplierView(filtered.filters),
      ];
      if (dataset === 'supplier_purchase_items') {
        rows = filtered.rows.flatMap((inv) =>
          inv.items.map((item) => ({
            invoice_id: inv.id,
            supplier_id: inv.supplierId,
            supplier_name: inv.supplierName,
            invoice_date: inv.date,
            payment_status: payableStatus(inv),
            platform_status: inv.status,
            item_name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.price,
            line_total: item.total,
            invoice_total: inv.amount,
          })),
        );
      } else {
        rows = filtered.rows.map((inv) => {
          const date = supplierInvoiceDate(inv);
          return {
            invoice_id: inv.id,
            supplier_id: inv.supplierId,
            supplier_name: inv.supplierName,
            invoice_date: inv.date,
            supplier_invoice_number: inv.invoiceNumber ?? '',
            payment_status: payableStatus(inv),
            platform_status: inv.status,
            item_summary: supplierInvoiceLineSummary(inv),
            item_count: inv.items.length,
            amount: inv.amount,
            discount: inv.discount,
            due_date: date ? addDays(date, SUPPLIER_DUE_DAYS).toISOString().slice(0, 10) : '',
            notes: inv.notes,
          };
        });
      }
    }

    rows = rows.slice(0, limit);
    const defaultColumns = rows[0] ? Object.keys(rows[0]) : [];
    const columns = requestedColumns.length
      ? requestedColumns.filter((col) => defaultColumns.includes(col))
      : defaultColumns;
    const previewRows = rows.slice(0, 5).map((row) =>
      Object.fromEntries(columns.map((col) => [col, row[col]])),
    );
    const csvRows = rows.map((row) => Object.fromEntries(columns.map((col) => [col, row[col]])));
    const csv = buildCsv(csvRows, columns);
    const filename = `${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;

    return {
      ok: true,
      text: `${rows.length} records CSV ke liye ready hain. Pehle preview dekh lein, phir Download CSV dabayein.`,
      cardType: 'csv_export',
      cardData: {
        title: 'Supplier CSV Preview',
        filename,
        count: rows.length,
        columns,
        filters,
        previewRows,
        csv,
      },
      data: { count: rows.length, columns, filters, filename },
    };
  },
};

const exportCustomerRankingCsv: AlaraTool = {
  name: 'export_customer_ranking_csv',
  tier: 'read',
  description:
    'Export the top-customers-by-sales ranking shown by show_visualization (kind=top_customers) as a ' +
    'downloadable CSV — same date range and limit, never lifetime sales.',
  parameters: {
    type: 'object',
    properties: {
      period_value: { type: 'integer', minimum: 1 },
      period_unit: { type: 'string', enum: ['days', 'weeks', 'months', 'years'] },
      date_from: { type: 'string' },
      date_to: { type: 'string' },
      limit: { type: 'integer', minimum: 1, description: 'How many ranked customers to export. Default 6.' },
    },
  },
  preview: (args, ctx) => {
    const range = resolveVisualizationRange(args);
    const limit = Math.min(Math.max(Number(args.limit ?? 6) || 6, 1), 50);
    const ranked = rankCustomersBySales(ctx, range, limit);
    const rangeLabel = formatRange(range.start, range.end);
    const rows = ranked.map((r, i) => ({
      rank: i + 1,
      customer_id: r.c.id,
      customer_name: r.c.name,
      sales: r.value,
      invoice_count: r.count,
    }));
    const columns = ['rank', 'customer_id', 'customer_name', 'sales', 'invoice_count'];
    const previewRows = rows.slice(0, 5);
    const csv = buildCsv(rows, columns);
    const filename = `top-customers-${isoDate(range.start)}-to-${isoDate(range.end)}.csv`;

    return {
      ok: true,
      text: `${rows.length} customers ki ranking (${rangeLabel}) CSV ke liye ready hai. Pehle preview dekh lein, phir Download CSV dabayein.`,
      cardType: 'csv_export',
      cardData: {
        title: 'Top Customers CSV Preview',
        filename,
        count: rows.length,
        columns,
        filters: [rangeLabel, `Top ${limit}`],
        previewRows,
        csv,
      },
      data: { count: rows.length, filename, date_from: isoDate(range.start), date_to: isoDate(range.end) },
    };
  },
};

// ── Per-customer analytics (sales + behaviour) ───────────────────────────────
interface CustomerStats {
  lifetime: number;   // total sales value (sum of this customer's invoices)
  orders: number;     // number of invoices
  avgOrder: number;
}
function customerStats(c: Customer, ctx: AlaraToolContext): CustomerStats {
  const sales = ctx.invoices.filter((i) => i.customerId === c.id);
  const lifetime = sales.reduce((s, i) => s + i.amount, 0);
  const orders = sales.length;
  return { lifetime, orders, avgOrder: orders ? lifetime / orders : 0 };
}

/** Recommended platform actions for a customer (sale, outreach, view) — only the
 *  relevant ones, ordered by priority. */
function actionStepsForCustomer(c: Customer): NextStep[] {
  const steps: NextStep[] = [];
  if (c.lastVisitDays >= 14)
    steps.push({
      label: 'Win-back offer bhejo',
      prompt: `${c.name} ko ek dostana offer message bhejo`,
      reason: `${c.lastVisitDays} din se khareedari nahi`,
      tone: 'opportunity',
    });
  else if (c.lastVisitDays >= 7)
    steps.push({
      label: 'Check-in message bhejo',
      prompt: `${c.name} ko reminder bhejo`,
      reason: `${c.lastVisitDays} din se nahi aaye`,
      tone: 'normal',
    });
  steps.push({
    label: 'Record a sale',
    prompt: `${c.name} ka page kholo`,
    reason: 'Nayi khareedari likhein',
    tone: 'normal',
  });
  steps.push({
    label: 'View customer profile',
    prompt: `${c.name} ka page kholo`,
    reason: 'Poori history aur sales',
    tone: 'normal',
  });
  return steps.slice(0, 5);
}

const customerInsight: AlaraTool = {
  name: 'customer_insight',
  tier: 'read',
  description:
    'Give a 360° analytical answer about ONE customer, combining sales (lifetime ' +
    'value, orders, average order) and behaviour (recency, status, top products). ' +
    'Use this for ANY business question about a specific customer ("Tariq ka business ' +
    'kaisa hai", "is customer ki performance") instead of a single-metric answer.',
  parameters: {
    type: 'object',
    properties: { customer: { type: 'string', description: 'Name or part of the name' } },
    required: ['customer'],
  },
  preview: (args, ctx) => {
    const { customer, candidates } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (candidates) return disambiguation('customer_insight', args, String(args.customer ?? ''), candidates);
    if (!customer) return err(`Customer "${args.customer}" nahi mila.`, 'customer_not_found');
    const s = customerStats(customer, ctx);

    const stats = [
      { label: 'Lifetime Business', value: pkr(s.lifetime) },
      { label: 'Orders', value: s.orders },
      { label: 'Avg Order', value: s.orders ? pkr(s.avgOrder) : '—' },
      { label: 'Last Visit', value: `${customer.lastVisitDays}d ago` },
      { label: 'Status', value: customer.status },
    ];

    const context: string[] = [
      `Last visit ${customer.lastVisitDays} din pehle · status ${customer.status}.`,
    ];
    const fav = customer.preferredProducts?.[0];
    if (fav) context.push(`Pasandeeda product: ${fav.name} (${fav.pct}% khareedari).`);

    const risks: string[] = [];
    if (customer.lastVisitDays >= 14)
      risks.push(`Lapsed: ${customer.lastVisitDays} din se koi visit nahi — win-back offer bhejein.`);
    else if (customer.lastVisitDays >= 7)
      risks.push(`${customer.lastVisitDays} din se nahi aaye — check-in karein.`);

    const missing: string[] = [];
    if (s.orders === 0) missing.push('Abhi tak koi sale record nahi — lifetime business data missing hai.');
    if (!customer.phone) missing.push('Phone number missing — message bhejne ke liye add karein.');

    const direct =
      s.orders === 0
        ? `${customer.name} ka abhi tak koi recorded business nahi.`
        : `${customer.name} ne lifetime ${pkr(s.lifetime)} ka business diya (${s.orders} orders). ` +
        `Aakhri visit ${customer.lastVisitDays} din pehle.`;

    return {
      ok: true,
      text: direct,
      cardType: 'insight',
      cardData: {
        title: customer.name,
        stats,
        context,
        risks,
        missing,
        steps: actionStepsForCustomer(customer),
      },
      data: { customer_id: customer.id, lifetime: s.lifetime },
    };
  },
};

// ── Next-step derivation (implicit reasoning over the live data) ─────────────
type NextStep = { label: string; prompt: string; reason?: string; tone?: 'urgent' | 'normal' | 'opportunity' };

/** Suggest actions for ONE customer, derived from recency, status and buying
 *  history. Ordered urgent → normal → opportunity. */
function stepsForCustomer(c: Customer): NextStep[] {
  const steps: NextStep[] = [];
  const lapsed = c.lastVisitDays >= 14;
  const cooling = !lapsed && c.lastVisitDays >= 7;

  if (lapsed) {
    steps.push({
      label: `${c.name} ko win-back offer bhejo`,
      prompt: `${c.name} ko ek dostana offer message bhejo`,
      reason: `${c.lastVisitDays} din se khareedari nahi`,
      tone: 'urgent',
    });
  } else if (cooling) {
    steps.push({
      label: `${c.name} ko check-in message bhejo`,
      prompt: `${c.name} ko reminder bhejo`,
      reason: `${c.lastVisitDays} din se nahi aaye`,
      tone: 'normal',
    });
  }
  steps.push({
    label: `${c.name} ki sale likho`,
    prompt: `${c.name} ka page kholo`,
    reason: 'Nayi khareedari record karein',
    tone: 'normal',
  });
  const fav = c.preferredProducts?.[0]?.name;
  if (fav && c.lastVisitDays >= 3) {
    steps.push({
      label: `${fav} ki sale offer karo`,
      prompt: `${c.name} ko ${fav} ke baare mein message bhejo`,
      reason: `Inka pasandeeda product — dobara bechne ka mauqa`,
      tone: 'opportunity',
    });
  }
  steps.push({
    label: `${c.name} ka full profile kholo`,
    prompt: `${c.name} ka page kholo`,
    reason: 'Poori sales aur history dekhein',
    tone: 'normal',
  });
  return steps.slice(0, 5);
}

/** Shop-wide priorities when no customer is in focus. */
function stepsForShop(ctx: AlaraToolContext): NextStep[] {
  const steps: NextStep[] = [];
  const lapsed = ctx.customers.filter((c) => c.lastVisitDays >= 14);
  const cooling = ctx.customers.filter((c) => c.lastVisitDays >= 7 && c.lastVisitDays < 14);
  const lowStock = ctx.inventory.filter((i) => i.current <= i.reorder);
  const topCustomer = ctx.customers
    .map((c) => ({ c, lifetime: lifetimeSales(c, ctx) }))
    .filter((r) => r.lifetime > 0)
    .sort((a, b) => b.lifetime - a.lifetime)[0];

  if (lapsed.length) {
    steps.push({
      label: `${lapsed.length} lapsed customers ko win-back offer bhejo`,
      prompt: 'Inactive customers ko offer message bhejo',
      reason: '14+ din se koi khareedari nahi',
      tone: 'urgent',
    });
  }
  if (topCustomer) {
    steps.push({
      label: `${topCustomer.c.name} ki nayi sale likho`,
      prompt: `${topCustomer.c.name} ka page kholo`,
      reason: `Sab se bara business — ${pkr(topCustomer.lifetime)} lifetime`,
      tone: 'normal',
    });
  }
  if (cooling.length) {
    steps.push({
      label: `${cooling.length} cooling customers ko check-in karo`,
      prompt: 'Inactive customers ko offer message bhejo',
      reason: '7+ din se koi visit nahi',
      tone: 'normal',
    });
  }
  if (lowStock.length) {
    steps.push({
      label: `${lowStock.length} items ka stock kam hai — restock karo`,
      prompt: `${lowStock[0].product} ka stock add karo`,
      reason: `${lowStock.slice(0, 3).map((i) => i.product).join(', ')} reorder level par`,
      tone: 'normal',
    });
  }
  if (!steps.length) {
    steps.push({
      label: 'Top customers by sales dekho',
      prompt: 'Sab se zyada business kis ka hai?',
      reason: 'Sab kuch control mein — quick sales check',
      tone: 'normal',
    });
  }
  return steps.slice(0, 5);
}

type PeriodUnit = 'days' | 'weeks' | 'months' | 'years';
type GroupBy = 'day' | 'week' | 'month' | 'year' | 'auto';
type TrendRow = { amount: number; date: string };

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateOnly(value: unknown): Date | null {
  if (!value) return null;
  const parsed = parseInvoiceDate(String(value));
  if (!parsed) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function subtractMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() - months);
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, maxDay));
  return next;
}

function resolveVisualizationRange(args: Record<string, unknown>): { start: Date; end: Date; groupBy: Exclude<GroupBy, 'auto'> } {
  const explicitEnd = parseDateOnly(args.date_to);
  const end = explicitEnd ?? todayStart();
  const explicitStart = parseDateOnly(args.date_from);
  let start: Date;
  if (explicitStart) {
    start = explicitStart;
  } else {
    const rawValue = Number(args.period_value ?? 30);
    const value = Number.isFinite(rawValue) && rawValue > 0 ? Math.floor(rawValue) : 30;
    const unit = String(args.period_unit ?? 'days') as PeriodUnit;
    start = new Date(end);
    if (unit === 'days') start.setDate(end.getDate() - value + 1);
    else if (unit === 'weeks') start.setDate(end.getDate() - value * 7 + 1);
    else if (unit === 'months') start = subtractMonths(end, value);
    else if (unit === 'years') start = subtractMonths(end, value * 12);
    else start.setDate(end.getDate() - 29);
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const requestedGroup = String(args.group_by ?? 'auto') as GroupBy;
  if (requestedGroup !== 'auto' && ['day', 'week', 'month', 'year'].includes(requestedGroup)) {
    return { start, end, groupBy: requestedGroup as Exclude<GroupBy, 'auto'> };
  }
  const totalDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (totalDays <= 31) return { start, end, groupBy: 'day' };
  if (totalDays <= 120) return { start, end, groupBy: 'week' };
  return { start, end, groupBy: 'month' };
}

const formatRange = (start: Date, end: Date) => `${shortDate(start)} – ${shortDate(end)}`;

interface CustomerRanking {
  c: Customer;
  value: number;
  count: number;
}

/** Customers ranked by sales WITHIN a date range (never "lifetime") — shared by
 *  the top_customers visualization and its CSV export so both agree exactly. */
function rankCustomersBySales(
  ctx: AlaraToolContext,
  range: { start: Date; end: Date },
  limit: number,
): CustomerRanking[] {
  const totals = new Map<string, { value: number; count: number }>();
  for (const inv of ctx.invoices) {
    const date = parseDateOnly(inv.date);
    if (!date || date.getTime() < range.start.getTime() || date.getTime() > range.end.getTime()) continue;
    const current = totals.get(inv.customerId) ?? { value: 0, count: 0 };
    current.value += inv.amount;
    current.count += 1;
    totals.set(inv.customerId, current);
  }
  return ctx.customers
    .map((c) => ({ c, value: totals.get(c.id)?.value ?? 0, count: totals.get(c.id)?.count ?? 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function groupKey(date: Date, groupBy: Exclude<GroupBy, 'auto'>): { key: string; label: string } {
  if (groupBy === 'day') return { key: isoDate(date), label: shortDate(date) };
  if (groupBy === 'week') {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay() + 1);
    return { key: isoDate(start), label: `Week ${shortDate(start)}` };
  }
  if (groupBy === 'month') {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) };
  }
  return { key: String(date.getFullYear()), label: String(date.getFullYear()) };
}

function buildTrendPoints(rows: TrendRow[], groupBy: Exclude<GroupBy, 'auto'>) {
  const buckets = new Map<string, { date: string; label: string; value: number; count: number }>();
  for (const row of rows) {
    const date = parseDateOnly(row.date);
    if (!date) continue;
    const bucket = groupKey(date, groupBy);
    const current = buckets.get(bucket.key) ?? { date: bucket.key, label: bucket.label, value: 0, count: 0 };
    current.value += row.amount;
    current.count += 1;
    buckets.set(bucket.key, current);
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p, i, arr) => {
      const previous = arr[i - 1]?.value ?? 0;
      const changePct = previous > 0 ? Math.round(((p.value - previous) / previous) * 100) : null;
      return {
        date: p.date,
        label: p.label,
        value: p.value,
        count: p.count,
        average: p.count > 0 ? Math.round(p.value / p.count) : 0,
        changePct,
        meta: `${pkr(p.value)} · ${p.count} bills`,
        tone: 'normal',
      };
    });
}

const showVisualization: AlaraTool = {
  name: 'show_visualization',
  tier: 'read',
  description:
    'Show a dynamic visualization card in chat with live data, explanatory notes, and suggested next actions. ' +
    'Use this when the user asks for a chart, graph, visual, trend, comparison, breakdown, split, or progress-style answer. ' +
    'Kinds (which DATASET to pull): sales_trend, top_customers, product_mix, inventory_risk, customer_type_split, reorder_progress. ' +
    'chartType (HOW to render it) — pick using this rule: ONE number → kpi. Comparison between items → bar. ' +
    'Change over time → line. Percentage split of a whole → donut. Progress toward a target → progress. ' +
    "If chartType is omitted, each kind renders with its natural default (sales_trend→line, top_customers/product_mix/inventory_risk→bar, " +
    'customer_type_split→donut, reorder_progress→progress) — only override chartType when the user explicitly asks for a different chart style. ' +
    'top_customers ALWAYS respects both the requested date range (period_value/period_unit or date_from/date_to — defaults to last 30 days) ' +
    'and the requested top-N (limit, e.g. "top 3 customers" → limit=3) — it ranks by sales WITHIN that range, never lifetime sales.',
  parameters: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['sales_trend', 'supplier_purchase_trend', 'top_customers', 'product_mix', 'inventory_risk', 'customer_type_split', 'reorder_progress'],
        description: 'Which dataset to visualize.',
      },
      chartType: {
        type: 'string',
        enum: ['line', 'area', 'bar', 'donut', 'kpi', 'progress'],
        description:
          'How to render it: kpi (one number), bar (comparison between items), line (change over time), ' +
          'donut (percentage split), progress (progress toward a target). Omit to use the kind’s natural default.',
      },
      period_value: { type: 'integer', minimum: 1, description: 'Requested period quantity, e.g. 6 for "last 6 months".' },
      period_unit: { type: 'string', enum: ['days', 'weeks', 'months', 'years'], description: 'Requested period unit.' },
      date_from: { type: 'string', description: 'Explicit start date in YYYY-MM-DD format.' },
      date_to: { type: 'string', description: 'Explicit end date in YYYY-MM-DD format.' },
      group_by: { type: 'string', enum: ['day', 'week', 'month', 'year', 'auto'], description: 'Grouping for trend charts. Use auto unless the user asks.' },
      limit: { type: 'integer', minimum: 1, description: 'Number of bars/rows to show, e.g. "top 3 customers" → 3. Default 6, clamped to 3–10.' },
    },
    required: ['kind'],
  },
  preview: (args, ctx) => {
    const kind = String(args.kind ?? 'sales_trend');
    const limit = Math.min(Math.max(Number(args.limit ?? 6) || 6, 3), 10);
    const chartTypeOverride = args.chartType ? String(args.chartType) : undefined;

    if (kind === 'sales_trend' || kind === 'supplier_purchase_trend') {
      const range = resolveVisualizationRange(args);
      const trendSource = kind === 'supplier_purchase_trend' ? ctx.supplierInvoices : ctx.invoices;
      const dated = trendSource
        .map((i) => ({ invoice: i, date: parseInvoiceDate(i.date) }))
        .filter((x): x is { invoice: typeof x.invoice; date: Date } => Boolean(x.date))
        .filter((x) => x.date.getTime() >= range.start.getTime() && x.date.getTime() <= range.end.getTime())
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      const buckets = new Map<string, { date: string; label: string; value: number; count: number }>();
      for (const row of dated) {
        const grouped = groupKey(row.date, range.groupBy);
        const key = grouped.key;
        const current = buckets.get(key) ?? { date: key, label: grouped.label, value: 0, count: 0 };
        current.value += row.invoice.amount;
        current.count += 1;
        buckets.set(key, current);
      }
      const dailyPoints = Array.from(buckets.values()).map((p, i, arr) => {
        const previous = arr[i - 1]?.value ?? 0;
        const changePct = previous > 0 ? Math.round(((p.value - previous) / previous) * 100) : null;
        return {
          date: p.date,
          label: p.label,
          value: p.value,
          count: p.count,
          average: p.count > 0 ? Math.round(p.value / p.count) : 0,
          changePct,
          meta: `${pkr(p.value)} · ${p.count} bills`,
          tone: 'normal',
        };
      });
      const points = dailyPoints.map((p) => ({
        label: p.label,
        value: p.value,
        count: p.count,
        average: p.average,
        changePct: p.changePct,
        meta: p.meta,
        tone: 'normal',
      }));
      const total = points.reduce((s, p) => s + p.value, 0);
      const best = points.slice().sort((a, b) => b.value - a.value)[0];
      const trendTitle = kind === 'supplier_purchase_trend' ? 'Supplier Purchase Trend' : 'Sales Trend';
      return {
        ok: true,
        text: `Sales trend visualization ready — ${points.length} periods, total ${pkr(total)}.`,
        cardType: 'visualization',
        cardData: {
          kind,
          title: trendTitle,
          chartType: chartTypeOverride ?? 'area',
          date_from: isoDate(range.start),
          date_to: isoDate(range.end),
          group_by: range.groupBy,
          stats: [
            { label: 'Total', value: pkr(total) },
            { label: kind === 'supplier_purchase_trend' ? 'Purchase Bills' : 'Invoices', value: dated.length },
            { label: 'Best Period', value: best ? best.label : '—' },
          ],
          points,
          dailyPoints,
          explanation: [
            `${isoDate(range.start)} se ${isoDate(range.end)} tak data ${range.groupBy} ke hisaab se group hua hai.`,
            best ? `${best.label} strongest period hai at ${best.meta}.` : 'Is range mein koi record nahi mila.',
          ],
          steps: [
            kind === 'supplier_purchase_trend'
              ? { label: 'Supplier payables dekho', prompt: 'Supplier payables dikhao', reason: 'Pending aur overdue bills', tone: 'normal' }
              : { label: 'Top customers ka chart dikhao', prompt: 'Top customers ka visualization dikhao', reason: 'Revenue kis customer se aa raha hai', tone: 'normal' },
          ],
        },
        data: { kind, count: points.length, total, date_from: isoDate(range.start), date_to: isoDate(range.end), group_by: range.groupBy },
      };
    }

    if (kind === 'top_customers') {
      const range = resolveVisualizationRange(args);
      const ranked = rankCustomersBySales(ctx, range, limit);
      const shownTotal = ranked.reduce((s, r) => s + r.value, 0);
      const shownInvoiceCount = ranked.reduce((s, r) => s + r.count, 0);
      const leader = ranked[0];
      const second = ranked[1];
      const rangeLabel = formatRange(range.start, range.end);

      const explanation: string[] = [];
      if (leader) {
        const share = shownTotal > 0 ? Math.round((leader.value / shownTotal) * 100) : 0;
        explanation.push(`${leader.c.name} ne ${rangeLabel} mein ${pkr(leader.value)} ka business diya — displayed sales ka ${share}%.`);
        if (second && second.value > 0) {
          const lead = Math.round(((leader.value - second.value) / second.value) * 100);
          explanation.push(`${leader.c.name} ${second.c.name} se ${lead}% aage hai.`);
        } else {
          explanation.push(`Is range mein sirf ${leader.c.name} ki recorded sales hain.`);
        }
      } else {
        explanation.push(`${rangeLabel} mein koi customer sale record nahi mili.`);
      }

      return {
        ok: true,
        text: leader
          ? `Top ${ranked.length} customers (${rangeLabel}) — combined ${pkr(shownTotal)} across ${shownInvoiceCount} invoices.`
          : `${rangeLabel} mein koi customer sales nahi mili.`,
        cardType: 'visualization',
        cardData: {
          title: `Top ${ranked.length || limit} customers by sales`,
          subtitle: rangeLabel,
          chartType: chartTypeOverride ?? 'bar',
          stats: [
            { label: 'Customers Shown', value: ranked.length },
            { label: 'Combined Sales', value: pkr(shownTotal) },
            { label: 'Top Customer', value: leader?.c.name ?? '—' },
          ],
          points: ranked.map((r, i) => ({
            label: r.c.name,
            value: r.value,
            meta: `${pkr(r.value)} · ${r.count} invoice${r.count === 1 ? '' : 's'}`,
            tone: r.c.lastVisitDays >= 14 ? 'urgent' : 'opportunity',
            rank: i + 1,
            invoiceCount: r.count,
            period: rangeLabel,
            customerId: r.c.id,
          })),
          explanation,
          steps: leader
            ? [
              { label: `${leader.c.name} ka profile kholo`, prompt: `${leader.c.name} ka page kholo`, reason: 'Full sales history dekhein', tone: 'normal' },
              { label: 'Inhi customers ke invoices dekho', prompt: 'Invoices kholo', reason: 'Displayed customers ki billing detail', tone: 'normal' },
              { label: 'Ranking CSV mein export karo', prompt: `Top ${ranked.length} customers ki ranking CSV mein do`, reason: 'Sheet mein share/save karein', tone: 'normal' },
            ]
            : [{ label: 'Record sale', prompt: 'Record sale page kholo', reason: 'Ranking banane ke liye is range mein sales chahiye', tone: 'normal' }],
        },
        data: {
          kind,
          date_from: isoDate(range.start),
          date_to: isoDate(range.end),
          limit,
          customer_ids: ranked.map((r) => r.c.id),
        },
      };
    }

    if (kind === 'product_mix') {
      const productMap = new Map<string, { qty: number; revenue: number }>();
      for (const inv of ctx.invoices) {
        for (const item of inv.items) {
          const current = productMap.get(item.name) ?? { qty: 0, revenue: 0 };
          current.qty += item.quantity;
          current.revenue += item.total;
          productMap.set(item.name, current);
        }
      }
      const ranked = Array.from(productMap.entries())
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);
      const total = ranked.reduce((s, r) => s + r.revenue, 0);
      return {
        ok: true,
        text: `Product mix visualization ready — ${ranked.length} products by invoice revenue.`,
        cardType: 'visualization',
        cardData: {
          title: 'Product Mix by Revenue',
          chartType: chartTypeOverride ?? 'bar',
          stats: [
            { label: 'Products', value: ranked.length },
            { label: 'Shown Revenue', value: pkr(total) },
            { label: 'Top SKU', value: ranked[0]?.name ?? '—' },
          ],
          points: ranked.map((p) => ({
            label: p.name,
            value: p.revenue,
            meta: `${pkr(p.revenue)} · ${Math.round(p.qty).toLocaleString()} units`,
            tone: 'opportunity',
          })),
          explanation: [
            'Product bars invoice line-items ki revenue value se bante hain, sirf quantity se nahi.',
            ranked[0] ? `${ranked[0].name} highest value contributor hai.` : 'Abhi itemized invoice data missing hai.',
          ],
          steps: [
            { label: 'Inventory risk dekho', prompt: 'Inventory risk ka visualization dikhao', reason: 'Fast sellers low stock na ho jayen', tone: 'normal' },
            { label: 'New invoice banao', prompt: 'New invoice page kholo', reason: 'Itemized sales record karein', tone: 'normal' },
          ],
        },
        data: { kind, products: ranked.map((p) => p.name) },
      };
    }

    if (kind === 'customer_type_split') {
      const byType = new Map<string, number>();
      for (const c of ctx.customers) {
        const lifetime = lifetimeSales(c, ctx);
        if (lifetime <= 0) continue;
        byType.set(c.type, (byType.get(c.type) ?? 0) + lifetime);
      }
      const ranked = Array.from(byType.entries())
        .map(([type, value]) => ({ type, value }))
        .sort((a, b) => b.value - a.value);
      const total = ranked.reduce((s, r) => s + r.value, 0);
      const leader = ranked[0];
      return {
        ok: true,
        text: `Customer type split ready — ${ranked.length} segments, total ${pkr(total)}.`,
        cardType: 'visualization',
        cardData: {
          title: 'Sales Split by Customer Type',
          chartType: chartTypeOverride ?? 'donut',
          stats: [
            { label: 'Segments', value: ranked.length },
            { label: 'Total', value: pkr(total) },
            { label: 'Leading Segment', value: leader?.type ?? '—' },
          ],
          points: ranked.map((r) => ({
            label: r.type,
            value: r.value,
            meta: `${pkr(r.value)} · ${total > 0 ? Math.round((r.value / total) * 100) : 0}%`,
            tone: 'normal',
          })),
          explanation: [
            'Split har customer ki lifetime sales ko unke type (Household/Retailer/Wholesaler) ke hisaab se group karta hai.',
            leader ? `${leader.type} segment total revenue ka sab se bada hissa hai.` : 'Abhi koi sales data available nahi.',
          ],
          steps: [
            { label: 'Top customers ka chart dikhao', prompt: 'Top customers ka visualization dikhao', reason: 'Konse individual customers lead kar rahe hain', tone: 'normal' },
          ],
        },
        data: { kind, segments: ranked.map((r) => r.type) },
      };
    }

    if (kind === 'reorder_progress') {
      const low = ctx.inventory.filter((i) => i.current <= i.reorder);
      const ranked = low
        .slice()
        .sort((a, b) => a.current / Math.max(1, a.reorder) - b.current / Math.max(1, b.reorder))
        .slice(0, limit);
      return {
        ok: true,
        text: `Reorder progress ready — ${low.length} SKUs below their reorder target.`,
        cardType: 'visualization',
        cardData: {
          title: 'Stock vs Reorder Target',
          chartType: chartTypeOverride ?? 'progress',
          stats: [
            { label: 'Below Target', value: low.length },
            { label: 'SKUs Checked', value: ctx.inventory.length },
            { label: 'Most Urgent', value: ranked[0]?.product ?? '—' },
          ],
          points: ranked.map((item) => ({
            label: item.product,
            value: item.current,
            target: item.reorder,
            meta: `${item.current}/${item.reorder} units`,
            tone: item.current <= 0 ? 'urgent' : 'normal',
          })),
          explanation: [
            'Har bar current stock ko us SKU ke reorder target ke against dikhata hai — jitna chhota bar, utni jaldi restock chahiye.',
            ranked.length ? `${ranked[0].product} sab se zyada urgent hai.` : 'Sab SKUs apne reorder target par ya us se upar hain.',
          ],
          steps: ranked[0]
            ? [{ label: `${ranked[0].product} stock in karo`, prompt: `${ranked[0].product} ka stock add karo`, reason: `${ranked[0].current} units left`, tone: 'urgent' }]
            : [{ label: 'Inventory page kholo', prompt: 'Inventory kholo', reason: 'Stock detail dekhein', tone: 'normal' }],
        },
        data: { kind, low_stock: low.length },
      };
    }

    const ranked = ctx.inventory
      .map((i) => ({
        item: i,
        shortage: Math.max(0, i.reorder - i.current),
        riskScore: i.current <= i.reorder ? i.reorder - i.current + i.stockOut : Math.max(0, i.stockOut - i.current),
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, limit);
    const low = ctx.inventory.filter((i) => i.current <= i.reorder);
    return {
      ok: true,
      text: `Inventory risk visualization ready — ${low.length} SKUs at or below reorder level.`,
      cardType: 'visualization',
      cardData: {
        title: 'Inventory Risk',
        chartType: chartTypeOverride ?? 'bar',
        stats: [
          { label: 'Low Stock', value: low.length },
          { label: 'SKUs Checked', value: ctx.inventory.length },
          { label: 'Highest Risk', value: ranked[0]?.item.product ?? '—' },
        ],
        points: ranked.map((r) => ({
          label: r.item.product,
          value: Math.max(1, r.riskScore),
          meta: `${r.item.current}/${r.item.reorder} units`,
          tone: r.item.current <= r.item.reorder ? 'urgent' : 'normal',
        })),
        explanation: [
          'Risk bars current stock, reorder level, aur stock-out pressure ko combine karke bante hain.',
          low.length ? `${low.length} items reorder level par ya us se neeche hain.` : 'Inventory currently reorder threshold se upar hai.',
        ],
        steps: ranked[0]
          ? [
            { label: `${ranked[0].item.product} stock in karo`, prompt: `${ranked[0].item.product} ka stock add karo`, reason: `${ranked[0].item.current} units left`, tone: 'urgent' },
            { label: 'Inventory page kholo', prompt: 'Inventory kholo', reason: 'Full stock table dekhein', tone: 'normal' },
          ]
          : [{ label: 'Inventory page kholo', prompt: 'Inventory kholo', reason: 'Stock detail dekhein', tone: 'normal' }],
      },
      data: { kind, low_stock: low.length },
    };
  },
};

const suggestNextSteps: AlaraTool = {
  name: 'suggest_next_steps',
  tier: 'read',
  description:
    'Proactively suggest the best NEXT ACTIONS, derived from the live data. Pass ' +
    '`customer` to get steps tailored to that customer (win-back, check-in, record sale). ' +
    'Omit it for shop-wide priorities (lapsed-customer win-back, top-customer sale, ' +
    'low-stock restock). Call this when the user asks "ab kya karun / what next / koi ' +
    'suggestion" or after showing a customer so they can act in one tap.',
  parameters: {
    type: 'object',
    properties: { customer: { type: 'string', description: 'Optional — focus on one customer' } },
  },
  preview: (args, ctx) => {
    const query = String(args.customer ?? '').trim();
    if (query) {
      const { customer, candidates } = resolveCustomer(query, ctx.customers);
      if (candidates) return disambiguation('suggest_next_steps', args, query, candidates);
      if (!customer) return err(`Customer "${query}" nahi mila.`, 'customer_not_found');
      const steps = stepsForCustomer(customer);
      return {
        ok: true,
        text: `${customer.name} ke liye next steps — ek tap mein karein:`,
        cardType: 'next_steps',
        cardData: { title: `Next steps — ${customer.name}`, steps },
        data: { customer_id: customer.id, count: steps.length },
      };
    }
    const steps = stepsForShop(ctx);
    return {
      ok: true,
      text: 'Aaj ke liye priority next steps:',
      cardType: 'next_steps',
      cardData: { title: 'Suggested next steps', steps },
      data: { count: steps.length },
    };
  },
};

const listAlerts: AlaraTool = {
  name: 'list_alerts',
  tier: 'read',
  description:
    'Surface action-needed alerts from deterministic rules: lapsed (no visit >= 14d) ' +
    'or cooling (no visit >= 7d) customers who need outreach.',
  parameters: { type: 'object', properties: {} },
  preview: (_args, ctx) => {
    const alerts: { primary: string; secondary: string; meta: string; customerId: string }[] = [];
    for (const c of ctx.customers) {
      if (c.lastVisitDays >= 14)
        alerts.push({ primary: c.name, secondary: `Lapsed ${c.lastVisitDays}d`, meta: pkr(lifetimeSales(c, ctx)), customerId: c.id });
      else if (c.lastVisitDays >= 7)
        alerts.push({ primary: c.name, secondary: `Cooling ${c.lastVisitDays}d`, meta: pkr(lifetimeSales(c, ctx)), customerId: c.id });
    }
    alerts.sort((a, b) => b.secondary.localeCompare(a.secondary));
    return {
      ok: true,
      text: `${alerts.length} customers need outreach.`,
      cardType: 'list',
      cardData: { title: 'Outreach Alerts', rows: alerts.slice(0, 25) },
      data: { customer_ids: alerts.map((a) => a.customerId) },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATE
// ─────────────────────────────────────────────────────────────────────────────
const ROUTES: Record<string, string> = {
  dashboard: '/',
  home: '/',
  'record sale': '/record-sale',
  invoices: '/invoices',
  inventory: '/inventory',
  insights: '/insights',
  reports: '/reports',
  customers: '/customers',
  'follow-ups': '/follow-ups',
  followups: '/follow-ups',
  connect: '/connect',
  chat: '/chat',
  notifications: '/notifications',
  'business profile': '/business-profile',
};

const navigate: AlaraTool = {
  name: 'navigate',
  tier: 'navigate',
  description:
    'Open a page in the app, or a specific customer. Use `page` for a section ' +
    '(dashboard, invoices, inventory, insights, reports, customers, follow-ups, ' +
    'connect, notifications, business profile) or `customer` to open a customer\'s ' +
    'detail page.',
  parameters: {
    type: 'object',
    properties: {
      page: { type: 'string' },
      customer: { type: 'string' },
    },
  },
  preview: (args, ctx) => {
    if (args.customer) {
      const { customer, candidates } = resolveCustomer(String(args.customer), ctx.customers);
      if (candidates) return disambiguation('navigate', args, String(args.customer), candidates);
      if (!customer) return err(`Customer "${args.customer}" nahi mila.`, 'customer_not_found');
      return {
        ok: true,
        text: `${customer.name} ka page khol raha hun.`,
        cardType: 'navigate',
        cardData: { route: `/customers/${customer.id}`, label: customer.name },
        navigateTo: `/customers/${customer.id}`,
      };
    }
    const key = String(args.page ?? '').trim().toLowerCase();
    const route = ROUTES[key];
    if (!route) return err(`"${args.page}" naam ka koi page nahi mila.`, 'unknown_route');
    return {
      ok: true,
      text: `${key} khol raha hun.`,
      cardType: 'navigate',
      cardData: { route, label: key },
      navigateTo: route,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// WRITE TOOLS (preview → confirm → commit)
// ─────────────────────────────────────────────────────────────────────────────
const recordSale: AlaraTool = {
  name: 'record_sale',
  tier: 'write',
  description: 'Record a completed (paid) sale for a customer.',
  parameters: {
    type: 'object',
    properties: {
      customer: { type: 'string' },
      amount: { type: 'number' },
    },
    required: ['customer', 'amount'],
  },
  preview: (args, ctx) => {
    const { customer, candidates } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (candidates) return disambiguation('record_sale', args, String(args.customer ?? ''), candidates);
    if (!customer) return err(`Customer "${args.customer}" nahi mila.`, 'customer_not_found');
    const amount = Number(args.amount ?? 0);
    if (amount <= 0) return err('Amount 0 se zyada honi chahiye.', 'invalid_amount');
    return {
      ok: true,
      text: `${customer.name} ka ${pkr(amount)} sale draft ready hai. Confirm karein.`,
      cardType: 'sale_confirmation',
      cardData: {
        customer_id: customer.id,
        customer_name: customer.name,
        amount,
        payment_type: 'Paid',
      },
    };
  },
  commit: (args, ctx) => {
    const { customer } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (!customer) return err('Customer nahi mila.', 'customer_not_found');
    const amount = Number(args.amount ?? 0);
    const invoice = ctx.recordSale(
      customer.id,
      [{ name: 'Quick sale', quantity: 1, unit: 'item', price: amount, total: amount }],
      0,
      'Recorded via Alara chat',
    );
    return { ok: true, text: `${customer.name} ka ${pkr(amount)} sale likh diya. Invoice ${invoice.id}.` };
  },
};

const addCustomer: AlaraTool = {
  name: 'add_customer',
  tier: 'write',
  description: 'Add a new customer to the directory.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      area: { type: 'string' },
      type: { type: 'string' },
      phone: { type: 'string' },
    },
    required: ['name'],
  },
  preview: (args, ctx) => {
    const name = String(args.name ?? '').trim();
    if (!name) return err('Customer ka naam chahiye.', 'invalid_name');
    const dupe = ctx.customers.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
    return {
      ok: true,
      text: dupe
        ? `"${dupe.name}" pehle se mojood hai. Phir bhi add karein?`
        : `Naya customer "${name}" add karne ke liye confirm karein.`,
      cardType: 'customer_confirmation',
      cardData: {
        name,
        area: String(args.area ?? ''),
        type: String(args.type ?? 'Household'),
        phone: String(args.phone ?? ''),
        duplicate: dupe?.name ?? '',
      },
    };
  },
  commit: (args, ctx) => {
    const created = ctx.addCustomer({
      name: String(args.name ?? 'New Customer'),
      phone: String(args.phone ?? ''),
      type: String(args.type ?? 'Household'),
      channel: 'WhatsApp',
      neighborhood: String(args.area ?? ''),
      address: '',
      status: 'Active',
      notes: 'Added via Alara chat',
      preferredProducts: [],
    });
    return { ok: true, text: `${created.name} add ho gaya.`, navigateTo: `/customers/${created.id}` };
  },
};

const updateCustomer: AlaraTool = {
  name: 'update_customer',
  tier: 'write',
  description:
    "Update an existing customer's details: phone, area (neighborhood), type, or notes.",
  parameters: {
    type: 'object',
    properties: {
      customer: { type: 'string' },
      phone: { type: 'string' },
      area: { type: 'string' },
      type: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['customer'],
  },
  preview: (args, ctx) => {
    const { customer, candidates } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (candidates) return disambiguation('update_customer', args, String(args.customer ?? ''), candidates);
    if (!customer) return err(`Customer "${args.customer}" nahi mila.`, 'customer_not_found');
    const changes: [string, string][] = [];
    if (args.phone) changes.push(['Phone', String(args.phone)]);
    if (args.area) changes.push(['Area', String(args.area)]);
    if (args.type) changes.push(['Type', String(args.type)]);
    if (args.notes) changes.push(['Notes', String(args.notes)]);
    if (changes.length === 0) return err('Koi tabdeeli specify nahi hui.', 'no_changes');
    return {
      ok: true,
      text: `${customer.name} ki details update karein?`,
      cardType: 'customer_confirmation',
      cardData: { name: customer.name, mode: 'update', changes },
    };
  },
  commit: (args, ctx) => {
    const { customer } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (!customer) return err('Customer nahi mila.', 'customer_not_found');
    const patch: Record<string, unknown> = {};
    if (args.phone) patch.phone = String(args.phone);
    if (args.area) patch.neighborhood = String(args.area);
    if (args.type) patch.type = String(args.type);
    if (args.notes) patch.notes = String(args.notes);
    ctx.updateCustomer(customer.id, patch);
    return { ok: true, text: `${customer.name} update ho gaya.` };
  },
};

const createInvoice: AlaraTool = {
  name: 'create_invoice',
  tier: 'write',
  description: 'Generate an itemised invoice (a completed paid sale) for a customer.',
  parameters: {
    type: 'object',
    properties: {
      customer: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            qty: { type: 'number' },
            rate: { type: 'number' },
          },
          required: ['name', 'qty', 'rate'],
        },
      },
    },
    required: ['customer', 'items'],
  },
  preview: (args, ctx) => {
    const { customer, candidates } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (candidates) return disambiguation('create_invoice', args, String(args.customer ?? ''), candidates);
    if (!customer) return err(`Customer "${args.customer}" nahi mila.`, 'customer_not_found');
    const rawItems = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]) : [];
    if (rawItems.length === 0) return err('Invoice mein kam az kam ek item hona chahiye.', 'no_items');
    const items = rawItems.map((it) => {
      const qty = Number(it.qty ?? 1);
      const rate = Number(it.rate ?? 0);
      return { name: String(it.name ?? 'Item'), qty, rate, total: Math.round(qty * rate * 100) / 100 };
    });
    for (const it of items) if (it.qty <= 0 || it.rate < 0) return err(`"${it.name}" ki qty/rate ghalat hai.`, 'invalid_item');
    const total = items.reduce((s, it) => s + it.total, 0);
    return {
      ok: true,
      text: `${customer.name} ka bill ${pkr(total)} ready hai. Confirm karein.`,
      cardType: 'invoice',
      cardData: {
        customer_id: customer.id,
        customer_name: customer.name,
        items,
        total,
        pending: true,
      },
    };
  },
  commit: (args, ctx) => {
    const { customer } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (!customer) return err('Customer nahi mila.', 'customer_not_found');
    const rawItems = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]) : [];
    const invItems = rawItems.map((it) => {
      const quantity = Number(it.qty ?? 1);
      const price = Number(it.rate ?? 0);
      return { name: String(it.name ?? 'Item'), quantity, unit: 'item', price, total: Math.round(quantity * price * 100) / 100 };
    });
    const invoice = ctx.recordSale(customer.id, invItems, 0, 'Invoice via Alara chat');
    return {
      ok: true,
      text: `Bill ${invoice.id} ban gaya — ${pkr(invoice.amount)}.`,
      cardType: 'invoice',
      cardData: {
        invoice_id: invoice.id,
        customer_id: customer.id,
        customer_name: customer.name,
        items: invItems.map((it) => ({ name: it.name, qty: it.quantity, total: it.total })),
        total: invoice.amount,
      },
    };
  },
};

const recordStockIn: AlaraTool = {
  name: 'record_stock_in',
  tier: 'write',
  description: 'Receive stock for an inventory item (by SKU or product name).',
  parameters: {
    type: 'object',
    properties: { sku: { type: 'string' }, quantity: { type: 'integer' } },
    required: ['sku', 'quantity'],
  },
  preview: (args, ctx) => {
    const q = String(args.sku ?? '').toLowerCase();
    const item =
      ctx.inventory.find((i) => i.sku.toLowerCase() === q) ||
      ctx.inventory.find((i) => i.product.toLowerCase().includes(q));
    if (!item) return err(`"${args.sku}" naam ka koi item nahi mila.`, 'item_not_found');
    const qty = Number(args.quantity ?? 0);
    if (!Number.isInteger(qty) || qty <= 0) return err('Quantity sahi integer honi chahiye.', 'invalid_quantity');
    return {
      ok: true,
      text: `${item.product} mein ${qty} units add karein?`,
      cardType: 'sale_confirmation',
      cardData: {
        customer_name: item.product,
        amount: qty,
        payment_type: 'Stock In',
        balance_before: item.current,
        balance_after: item.current + qty,
        sku: item.sku,
        unit_mode: true,
      },
    };
  },
  commit: (args, ctx) => {
    const q = String(args.sku ?? '').toLowerCase();
    const item =
      ctx.inventory.find((i) => i.sku.toLowerCase() === q) ||
      ctx.inventory.find((i) => i.product.toLowerCase().includes(q));
    if (!item) return err('Item nahi mila.', 'item_not_found');
    const qty = Number(args.quantity ?? 0);
    const updated = ctx.recordStockIn(item.sku, qty);
    return { ok: true, text: `${qty} units ${item.product} mein add ho gaye. Ab ${updated?.current ?? item.current + qty} units.` };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// COMMS TOOLS (draft → send)
// ─────────────────────────────────────────────────────────────────────────────
function buildReminder(c: Customer): string {
  if (c.lastVisitDays >= 14)
    return `Salam ${c.name}, kaafi arsa ho gaya aap tashreef nahi laaye. Aap ke liye khaas offers hain — zaroor aaiye! Shukriya — PSO SME.`;
  return `Salam ${c.name}, umeed hai aap khairiyat se hain. Humare paas aaj kuch khaas offers hain — zaroor visit karein. Shukriya — PSO SME.`;
}

const draftReminder: AlaraTool = {
  name: 'draft_reminder',
  tier: 'comms',
  description:
    'Draft a WhatsApp/SMS outreach message for one customer (check-in, win-back, offer). ' +
    'Shows a preview the user sends manually. Provide `message` to override the auto-generated text.',
  parameters: {
    type: 'object',
    properties: {
      customer: { type: 'string' },
      message: { type: 'string' },
      channel: { type: 'string', enum: ['WhatsApp', 'SMS'] },
    },
    required: ['customer'],
  },
  preview: (args, ctx) => {
    const { customer, candidates } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (candidates) return disambiguation('draft_reminder', args, String(args.customer ?? ''), candidates);
    if (!customer) return err(`Customer "${args.customer}" nahi mila.`, 'customer_not_found');
    const message = String(args.message ?? '') || buildReminder(customer);
    return {
      ok: true,
      text: `${customer.name} ke liye outreach draft tayyar hai.`,
      cardType: 'confirmation',
      cardData: {
        recipientName: customer.name,
        phoneNumber: customer.phone,
        message,
        customerId: customer.id,
        channel: String(args.channel ?? 'WhatsApp'),
      },
    };
  },
  // Sending happens in the UI (wa.me) which then calls sendWhatsAppReminder to log it.
  commit: (args, ctx) => {
    const { customer } = resolveCustomer(String(args.customer ?? ''), ctx.customers);
    if (!customer) return err('Customer nahi mila.', 'customer_not_found');
    const message = String(args.message ?? '') || buildReminder(customer);
    ctx.sendWhatsAppReminder(customer.id, message, (String(args.channel ?? 'WhatsApp') as 'WhatsApp' | 'SMS'));
    return { ok: true, text: `${customer.name} ko message bhej diya (logged).` };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DESTRUCTIVE / BULK
// ─────────────────────────────────────────────────────────────────────────────
const bulkRemind: AlaraTool = {
  name: 'bulk_remind',
  tier: 'destructive',
  description:
    'Draft outreach messages for MANY customers at once (e.g. everyone who is inactive / ' +
    'lapsed). Requires explicit confirmation; capped batch size.',
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string', enum: ['inactive', 'all'] },
      idle_days: { type: 'integer' },
    },
    required: ['filter'],
  },
  preview: (args, ctx) => {
    const filter = String(args.filter ?? 'inactive');
    const idle = Number(args.idle_days ?? 14) || 14;
    let targets = ctx.customers.slice();
    if (filter === 'inactive') targets = targets.filter((c) => c.lastVisitDays >= idle);
    if (targets.length === 0) return err('Is filter pe koi customer nahi mila.', 'empty_batch');
    const matched = targets.length;
    const capped = targets.slice(0, MAX_BATCH); // what commit will actually act on
    const truncated = matched > capped.length;
    return {
      ok: true,
      text: truncated
        ? `${matched} customers match hue, lekin ek baar mein sirf ${MAX_BATCH} ko message bheja ja sakta hai. Pehle ${capped.length} ko confirm karein.`
        : `${capped.length} customers ko outreach message bhejna hai. Confirm karein.`,
      cardType: 'list',
      cardData: {
        title: `Bulk outreach — ${filter === 'inactive' ? `inactive ${idle}d+` : 'all'}`,
        destructive: true,
        count: capped.length,
        rows: capped.map((c) => ({
          primary: c.name,
          secondary: c.phone,
          meta: `${c.lastVisitDays}d ago`,
          customerId: c.id,
        })),
      },
    };
  },
  commit: (args, ctx) => {
    const filter = String(args.filter ?? 'inactive');
    const idle = Number(args.idle_days ?? 14) || 14;
    let targets = ctx.customers.slice();
    if (filter === 'inactive') targets = targets.filter((c) => c.lastVisitDays >= idle);
    targets = targets.slice(0, MAX_BATCH); // batch cap, same source of truth as preview
    for (const c of targets) ctx.sendWhatsAppReminder(c.id, buildReminder(c), 'WhatsApp');
    return { ok: true, text: `${targets.length} outreach messages log kar diye.` };
  },
};

// ── Registry ─────────────────────────────────────────────────────────────────
export const TOOLS: AlaraTool[] = [
  // read
  queryData,
  getCustomer,
  customerVisit,
  customerInsight,
  listCustomers,
  getProduct,
  listInventory,
  getSupplier,
  listSuppliers,
  supplierPurchaseAnalysis,
  supplierPayables,
  exportSupplierCsv,
  exportCustomerRankingCsv,
  listAlerts,
  showVisualization,
  suggestNextSteps,
  // navigate
  navigate,
  // write
  recordSale,
  addCustomer,
  updateCustomer,
  createInvoice,
  draftSupplierInvoice,
  recordStockIn,
  // comms
  draftReminder,
  // destructive
  bulkRemind,
];

export const TOOL_BY_NAME: Record<string, AlaraTool> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);
