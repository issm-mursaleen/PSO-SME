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
import type { Customer } from '@/context/AppContext';

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
      baseArgs,
      candidates: candidates.slice(0, 6).map((c) => ({
        id: c.id,
        name: c.name,
        meta: `${c.neighborhood || '—'} · ${c.lastVisitDays}d ago`,
      })),
    },
  };
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

const showVisualization: AlaraTool = {
  name: 'show_visualization',
  tier: 'read',
  description:
    'Show a dynamic visualization card in chat with live data, explanatory notes, and suggested next actions. ' +
    'Use this when the user asks for a chart, graph, visual, trend, comparison, breakdown, or dashboard-style answer. ' +
    'Kinds: sales_trend, top_customers, product_mix, inventory_risk.',
  parameters: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['sales_trend', 'top_customers', 'product_mix', 'inventory_risk'],
        description: 'Which visualization to render.',
      },
      limit: { type: 'integer', description: 'Number of bars/rows to show. Default 6.' },
    },
    required: ['kind'],
  },
  preview: (args, ctx) => {
    const kind = String(args.kind ?? 'sales_trend');
    const limit = Math.min(Math.max(Number(args.limit ?? 6) || 6, 3), 10);

    if (kind === 'sales_trend') {
      const dated = ctx.invoices
        .map((i) => ({ invoice: i, date: parseInvoiceDate(i.date) }))
        .filter((x): x is { invoice: typeof x.invoice; date: Date } => Boolean(x.date))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      const buckets = new Map<string, { label: string; value: number; count: number }>();
      for (const row of dated) {
        const key = row.date.toISOString().slice(0, 10);
        const current = buckets.get(key) ?? { label: shortDate(row.date), value: 0, count: 0 };
        current.value += row.invoice.amount;
        current.count += 1;
        buckets.set(key, current);
      }
      const points = Array.from(buckets.values()).slice(-limit).map((p) => ({
        label: p.label,
        value: p.value,
        meta: `${pkr(p.value)} · ${p.count} bills`,
        tone: 'normal',
      }));
      const total = points.reduce((s, p) => s + p.value, 0);
      const best = points.slice().sort((a, b) => b.value - a.value)[0];
      return {
        ok: true,
        text: `Sales trend visualization ready — ${points.length} periods, total ${pkr(total)}.`,
        cardType: 'visualization',
        cardData: {
          title: 'Sales Trend',
          stats: [
            { label: 'Shown Total', value: pkr(total) },
            { label: 'Invoices', value: dated.length },
            { label: 'Best Period', value: best ? best.label : '—' },
          ],
          points,
          explanation: [
            `Chart recent invoice dates se bana hai; har bar us date ki total billed sales dikhata hai.`,
            best ? `${best.label} strongest period hai at ${best.meta}.` : 'No invoice date data available yet.',
          ],
          steps: [
            { label: 'Top customers ka chart dikhao', prompt: 'Top customers ka visualization dikhao', reason: 'Revenue kis customer se aa raha hai', tone: 'normal' },
            { label: 'Reports page kholo', prompt: 'Reports kholo', reason: 'Detailed sales & invoices table', tone: 'normal' },
          ],
        },
        data: { kind, count: points.length, total },
      };
    }

    if (kind === 'top_customers') {
      const ranked = ctx.customers
        .map((c) => ({ c, lifetime: lifetimeSales(c, ctx) }))
        .filter((r) => r.lifetime > 0)
        .sort((a, b) => b.lifetime - a.lifetime)
        .slice(0, limit);
      const total = ranked.reduce((s, r) => s + r.lifetime, 0);
      const top = ranked[0];
      return {
        ok: true,
        text: `Top customers visualization ready — ${ranked.length} customers ranked by lifetime sales.`,
        cardType: 'visualization',
        cardData: {
          title: 'Top Customers by Lifetime Sales',
          stats: [
            { label: 'Customers', value: ranked.length },
            { label: 'Shown Revenue', value: pkr(total) },
            { label: 'Leader', value: top?.c.name ?? '—' },
          ],
          points: ranked.map((r) => ({
            label: r.c.name,
            value: r.lifetime,
            meta: pkr(r.lifetime),
            tone: r.c.lastVisitDays >= 14 ? 'urgent' : 'opportunity',
          })),
          explanation: [
            'Ranking real invoices se lifetime sales sum karke banti hai.',
            top ? `${top.c.name} currently sab se strong customer hai with ${pkr(top.lifetime)} recorded business.` : 'Abhi customer sales data missing hai.',
          ],
          steps: top
            ? [
                { label: `${top.c.name} ka profile kholo`, prompt: `${top.c.name} ka page kholo`, reason: 'Full sales history dekhein', tone: 'normal' },
                { label: 'Product mix visualization dikhao', prompt: 'Product mix ka visualization dikhao', reason: 'Kya items bik rahe hain', tone: 'opportunity' },
              ]
            : [{ label: 'Record sale', prompt: 'Record sale page kholo', reason: 'Ranking banane ke liye sales chahiye', tone: 'normal' }],
        },
        data: { kind, customer_ids: ranked.map((r) => r.c.id) },
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
    return {
      ok: true,
      text: `${targets.length} customers ko outreach message bhejna hai. Confirm karein.`,
      cardType: 'list',
      cardData: {
        title: `Bulk outreach — ${filter === 'inactive' ? `inactive ${idle}d+` : 'all'}`,
        destructive: true,
        count: targets.length,
        rows: targets.slice(0, 25).map((c) => ({
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
    targets = targets.slice(0, 25); // batch cap
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
  recordStockIn,
  // comms
  draftReminder,
  // destructive
  bulkRemind,
];

export const TOOL_BY_NAME: Record<string, AlaraTool> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);
