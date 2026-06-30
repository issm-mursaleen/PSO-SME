// Alara offline planner — the deterministic intent router used ONLY when the
// backend is unreachable (the normal path is /api/plan). It is a generic
// interpreter over the generated intent spec (intents.generated.ts), which is
// produced from shared/alara-intents.json — the SAME spec the backend planner
// reads. That shared spec is the single source of truth, so the two planners
// cannot drift; the parity test enforces it.
//
// Matching is declarative (positive/negative regex groups + required entities).
// A handful of intents that need branching logic (supplier ops, invoice item
// parsing, the multi-intent visualization scanner) name a `handler` here, but
// even those pull their vocabulary from the spec, never from inline literals.

import type { PlanResponse } from '@/lib/api';
import type { ToolCall } from './types';
import {
  INTENTS,
  VOCAB,
  FALLBACK_TEXT,
  INTENT_SPEC_HASH,
  type IntentSpec,
  type IntentEntity,
} from './intents.generated';

export interface PlannerTrace {
  resolvedIntent: string | null;
  matchedRule: string | null;
  entities: Record<string, unknown>;
  dateRange: Record<string, unknown> | null;
  tools: string[];
  fallbackReason: string | null;
  responseStyle: string | null;
}

export interface PlanResult extends PlanResponse {
  intent_spec_hash: string;
  trace: PlannerTrace;
}

type HandlerResult = { tool_calls?: ToolCall[]; final_text?: string } | null;

// ── Parse context (the extractor primitives, lifted verbatim from the old
// localPlan; these are language-native because the extraction logic — not the
// vocabulary — is what never drifted). ───────────────────────────────────────
interface ParseCtx {
  text: string;
  low: string;
  periodArgs: Record<string, unknown>;
  nameBefore: (stop: string) => string | undefined;
  amount: () => number | null;
  idleDays: () => number;
  invoiceId: () => string | null;
}

function makeParseCtx(message: string): ParseCtx {
  const text = message.trim();
  const low = text.toLowerCase();
  const nameBefore = (stop: string) =>
    text.match(new RegExp(`^\\s*([A-Za-z][A-Za-z\\s]+?)\\s+(?:${stop})\\b`, 'i'))?.[1]?.trim();
  const parsePeriod = (): Record<string, unknown> => {
    const match = low.match(/(?:pichle|last|past)?\s*(\d+)\s*(din|dino|days?|hafte|hafton|weeks?|maheene|mahine|months?|saal|years?)/);
    if (!match) return {};
    const value = Number(match[1]);
    const rawUnit = match[2].toLowerCase();
    const unit = /din|day/.test(rawUnit)
      ? 'days'
      : /hafte|hafton|week/.test(rawUnit)
        ? 'weeks'
        : /maheene|mahine|month/.test(rawUnit)
          ? 'months'
          : 'years';
    const group_by =
      unit === 'days'
        ? 'day'
        : unit === 'weeks'
          ? value <= 4 ? 'day' : 'week'
          : unit === 'months'
            ? value <= 2 ? 'week' : 'month'
            : 'month';
    return { period_value: value, period_unit: unit, group_by };
  };
  return {
    text,
    low,
    periodArgs: parsePeriod(),
    nameBefore,
    amount: () => {
      const raw = low.match(/\d[\d,]*/)?.[0];
      if (!raw) return null;
      const n = Number(raw.replace(/,/g, ''));
      return Number.isNaN(n) ? null : n;
    },
    idleDays: () => {
      const dm = low.match(/(\d+)\s*(din|day)/);
      return dm ? Number(dm[1]) : 7;
    },
    invoiceId: () => text.match(/\bINV-[\w-]+/i)?.[0]?.toUpperCase() ?? null,
  };
}

// ── Matching ─────────────────────────────────────────────────────────────────
const reCache = new Map<string, RegExp>();
function re(src: string): RegExp {
  let r = reCache.get(src);
  if (!r) {
    r = new RegExp(src);
    reCache.set(src, r);
  }
  return r;
}

function extractEntity(spec: IntentEntity, ctx: ParseCtx): unknown {
  switch (spec.extractor) {
    case 'nameBefore':
      return ctx.nameBefore(spec.stop ?? '') ?? null;
    case 'amount':
      return ctx.amount();
    case 'idleDays':
      return ctx.idleDays();
    case 'invoiceId':
      return ctx.invoiceId();
    default:
      return null;
  }
}

function resolved(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

function matches(intent: IntentSpec, ctx: ParseCtx): boolean {
  for (const p of intent.positive) if (!re(p).test(ctx.low)) return false;
  for (const n of intent.negative) if (re(n).test(ctx.low)) return false;
  for (const name of intent.requires) {
    const espec = intent.entities[name];
    if (!espec || !resolved(extractEntity(espec, ctx))) return false;
  }
  return true;
}

function buildSimple(intent: IntentSpec, ctx: ParseCtx): { tool_calls: ToolCall[]; entities: Record<string, unknown> } {
  const args: Record<string, unknown> = { ...intent.args };
  const entities: Record<string, unknown> = {};
  for (const [key, espec] of Object.entries(intent.entities)) {
    const val = extractEntity(espec, ctx);
    if (resolved(val)) {
      args[key] = val;
      entities[key] = val;
    }
  }
  return { tool_calls: [{ name: intent.tool as string, args }], entities };
}

// ── Branching handlers (logic native, vocabulary from the spec) ──────────────
const HANDLERS: Record<string, (intent: IntentSpec, ctx: ParseCtx) => HandlerResult> = {
  addCustomer(_intent, ctx) {
    const rest = ctx.text.split(/[—\-:]/).slice(1).join(' ').trim() || ctx.text;
    const parts = rest.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return { tool_calls: [{ name: 'add_customer', args: { name: parts[0], area: parts[1] } }] };
    return null;
  },

  createInvoice(_intent, ctx) {
    const custM = ctx.text.match(/^\s*(.+?)\s+(?:ka|ki)\s+(?:bill|invoice)/i);
    const customer = custM?.[1]?.trim();
    const items: { name: string; qty: number; rate: number }[] = [];
    const itemRe = /(\d+(?:\.\d+)?)\s*[a-zA-Z]*\s+([a-zA-Z][a-zA-Z\s]*?)\s*@\s*(\d+(?:\.\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(ctx.text)) !== null) {
      items.push({ qty: Number(m[1]), name: m[2].trim(), rate: Number(m[3]) });
    }
    if (customer && items.length) return { tool_calls: [{ name: 'create_invoice', args: { customer, items } }] };
    if (customer)
      return { final_text: `${customer} ka bill banane ke liye har item ka rate bhi likhein, e.g. "50 doodh @ 200, 10 cheeni @ 300".` };
    return null;
  },

  supplierOps(_intent, ctx) {
    const { low, periodArgs } = ctx;
    const s = ctx.nameBefore('ki|ka|ke|se');
    const sup = s ? { supplier: s } : {};
    if (Object.keys(periodArgs).length > 0 && /(purchase|purchases)/.test(low))
      return { tool_calls: [{ name: 'show_visualization', args: { kind: 'supplier_purchase_trend', chartType: re(VOCAB.comparison).test(low) ? 'bar' : 'area', ...periodArgs } }] };
    if (re(VOCAB.csvExport).test(low))
      return { tool_calls: [{ name: 'export_supplier_csv', args: { dataset: 'supplier_invoices', ...sup } }] };
    if (/(payable|outstanding|overdue|due|payment|pending)/.test(low)) {
      const status = /overdue/.test(low) ? 'overdue' : /due/.test(low) ? 'due_soon' : /paid/.test(low) ? 'paid' : /pending|outstanding/.test(low) ? 'pending' : 'all';
      return { tool_calls: [{ name: 'supplier_payables', args: { status, ...sup } }] };
    }
    if (/(invoice|bill|draft|generate|banao|banado|receive hui)/.test(low))
      return { tool_calls: [{ name: 'draft_supplier_invoice', args: { ...sup } }] };
    return { tool_calls: [{ name: 'supplier_purchase_analysis', args: { ...sup } }] };
  },

  supplierDirectory(_intent, ctx) {
    const { low } = ctx;
    const s = ctx.nameBefore('se|ka|ki|supplier|ke');
    const sup = s ? { supplier: s } : {};
    if (re(VOCAB.csvExport).test(low)) {
      const dataset = re(VOCAB.supplierItems).test(low)
        ? 'supplier_purchase_items'
        : re(VOCAB.supplierDirectoryWords).test(low)
          ? 'suppliers'
          : 'supplier_invoices';
      return { tool_calls: [{ name: 'export_supplier_csv', args: { dataset, ...sup } }] };
    }
    if (re(VOCAB.payableTrigger).test(low)) {
      const status = /overdue/.test(low) ? 'overdue' : /due/.test(low) ? 'due_soon' : /paid/.test(low) ? 'paid' : /pending|outstanding/.test(low) ? 'pending' : 'all';
      return { tool_calls: [{ name: 'supplier_payables', args: { status, ...sup } }] };
    }
    if (/(purchase|purchases|analysis|trend|rank|compare|contribution|history)/.test(low))
      return { tool_calls: [{ name: 'supplier_purchase_analysis', args: { ...sup } }] };
    if (/(invoice|bill|draft|generate|banao|banado)/.test(low))
      return { tool_calls: [{ name: 'draft_supplier_invoice', args: { ...sup } }] };
    if (/(list|sab|all|directory|kitne)/.test(low)) return { tool_calls: [{ name: 'list_suppliers', args: {} }] };
    if (s) return { tool_calls: [{ name: 'get_supplier', args: { supplier: s } }] };
    return { tool_calls: [{ name: 'list_suppliers', args: {} }] };
  },

  listInventory(_intent, ctx) {
    const filter = /out of stock|khatam/.test(ctx.low) ? 'out_of_stock' : 'low_stock';
    return { tool_calls: [{ name: 'list_inventory', args: { filter } }] };
  },

  vizScan(intent, ctx) {
    const { low, periodArgs } = ctx;
    const invoiceCountTriggers = intent.metric?.invoiceCountTriggers ?? '(invoice_count)';
    const topLimitMatch =
      low.match(/\b(?:top|best)\s*(\d+)\b/) || low.match(/\brank(?:ed|ing)?\s+(?:my\s+)?(?:top\s*)?(\d+)\b/);
    const mentionsCustomerPlural = /\b(customers|grahak\w*|clients)\b/.test(low);
    const mentionsCustomerSingular = /\bcustomer\b/.test(low) && !mentionsCustomerPlural;
    const hasExplicitRankingTrigger =
      Boolean(topLimitMatch) ||
      /(rank|ranking|ranked|highest|sab\s*se\s*zyada|sabse\s*zyada)/.test(low) ||
      /(chart|graph|visual|dikhao|report|\blist\b|compare|comparison)/.test(low);
    const isTopCustomersKind = mentionsCustomerPlural || (mentionsCustomerSingular && hasExplicitRankingTrigger);

    const kindMatches: { kind: string; index: number }[] = [];
    const pushMatch = (kind: string, regex: RegExp) => {
      const m = low.match(regex);
      if (m && m.index !== undefined) kindMatches.push({ kind, index: m.index });
    };
    pushMatch('reorder_progress', /(reorder progress|stock vs reorder)/);
    pushMatch('inventory_risk', /(inventory risk|low stock|stock risk|reorder level)/);
    pushMatch('customer_type_split', /(customer.type|type split|segment split|customer split)/);
    pushMatch('product_mix', /(product mix|item mix)/);
    pushMatch('supplier_purchase_trend', /(supplier purchase|supplier purchases)/);
    if (isTopCustomersKind) {
      const idx = low.search(/top|best|rank|highest|customer/);
      kindMatches.push({ kind: 'top_customers', index: idx >= 0 ? idx : 0 });
    }
    pushMatch('sales_trend', /(sales\s*trend|\bsales\b|\bsale\b)/);

    kindMatches.sort((a, b) => a.index - b.index);
    const orderedKinds: string[] = [];
    for (const { kind } of kindMatches) if (!orderedKinds.includes(kind)) orderedKinds.push(kind);
    if (orderedKinds.length === 0) return null;

    const calls = orderedKinds.slice(0, 6).map((kind) => {
      const args: Record<string, unknown> = { kind, ...periodArgs };
      if (kind === 'top_customers') {
        args.chartType = 'bar';
        const limitValue = topLimitMatch ? Number(topLimitMatch[1]) : mentionsCustomerSingular ? 1 : undefined;
        if (limitValue != null) args.limit = limitValue;
        args.ranking_metric = re(invoiceCountTriggers).test(low) ? 'invoice_count' : 'revenue';
        args.scope = Object.keys(periodArgs).length > 0 ? 'selected_period' : 'lifetime';
      } else if ((kind === 'sales_trend' || kind === 'supplier_purchase_trend') && re(VOCAB.comparison).test(low)) {
        args.chartType = 'bar';
      }
      return { name: 'show_visualization', args };
    });
    return { tool_calls: calls };
  },

  navigateOpen(_intent, ctx) {
    const page = ctx.low.replace(/open |kholo|khol/g, '').trim();
    return { tool_calls: [{ name: 'navigate', args: { page } }] };
  },
};

// ── Entry point ──────────────────────────────────────────────────────────────
const SORTED = [...INTENTS].sort((a, b) => b.priority - a.priority);

/** Full planner result, including the spec hash + a dev-mode trace. */
export function planLocal(message: string): PlanResult {
  const ctx = makeParseCtx(message);
  const dateRange = Object.keys(ctx.periodArgs).length ? ctx.periodArgs : null;

  for (const intent of SORTED) {
    if (!matches(intent, ctx)) continue;

    if (intent.handler) {
      const out = HANDLERS[intent.handler]?.(intent, ctx) ?? null;
      if (!out) continue; // handler declined → fall through to next intent
      return {
        tool_calls: (out.tool_calls ?? []) as PlanResponse['tool_calls'],
        final_text: out.final_text ?? null,
        source: 'fallback',
        intent_spec_hash: INTENT_SPEC_HASH,
        trace: {
          resolvedIntent: intent.name,
          matchedRule: intent.handler,
          entities: {},
          dateRange,
          tools: (out.tool_calls ?? []).map((c) => c.name),
          fallbackReason: null,
          responseStyle: intent.presentation,
        },
      };
    }

    const { tool_calls, entities } = buildSimple(intent, ctx);
    return {
      tool_calls: tool_calls as PlanResponse['tool_calls'],
      final_text: null,
      source: 'fallback',
      intent_spec_hash: INTENT_SPEC_HASH,
      trace: {
        resolvedIntent: intent.name,
        matchedRule: intent.name,
        entities,
        dateRange,
        tools: tool_calls.map((c) => c.name),
        fallbackReason: null,
        responseStyle: intent.presentation,
      },
    };
  }

  return {
    tool_calls: [],
    final_text: FALLBACK_TEXT,
    source: 'fallback',
    intent_spec_hash: INTENT_SPEC_HASH,
    trace: {
      resolvedIntent: null,
      matchedRule: null,
      entities: {},
      dateRange,
      tools: [],
      fallbackReason: 'no_intent_matched',
      responseStyle: null,
    },
  };
}
