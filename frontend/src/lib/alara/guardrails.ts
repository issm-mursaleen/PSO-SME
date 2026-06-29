// Guardrails — applied uniformly before any tool runs, keyed off the tool tier.
// Validation that is *intrinsic* to a tool (customer resolution, qty/rate sanity)
// lives in the tool's own preview(); these are the cross-cutting safety rails:
// arg-shape validation against the schema (including nested array items), hard
// caps on money/quantity/batch size, and the confirm policy the runner enforces.

import type { AlaraTool, ParamSpec } from './types';

/** Absolute ceiling on any single money amount Alara will act on without a human
 *  re-typing it manually in the app. Protects against a misheard "200000". */
export const MAX_AMOUNT = 500_000;
/** Ceiling on any single stock-quantity Alara will move without manual confirm. */
export const MAX_QUANTITY = 100_000;
/** Largest batch a destructive/bulk tool may touch in one confirm. */
export const MAX_BATCH = 25;

export interface GuardrailVerdict {
  ok: boolean;
  reason?: string;
}

/** True when a tier must show a card and wait for the user before mutating. */
export function requiresConfirmation(tool: AlaraTool): boolean {
  return tool.tier === 'write' || tool.tier === 'comms' || tool.tier === 'destructive';
}

/** Validate one value against its sub-schema (recurses into array-of-object
 *  item shapes, e.g. create_invoice's `items`). */
function validateValue(key: string, spec: ParamSpec, v: unknown): GuardrailVerdict {
  if ((spec.type === 'number' || spec.type === 'integer') && typeof v !== 'number' && Number.isNaN(Number(v)))
    return { ok: false, reason: `"${key}" number honi chahiye.` };
  if (spec.enum && !spec.enum.includes(v as string | number))
    return { ok: false, reason: `"${key}" ki value valid nahi.` };
  if (spec.type === 'array' && spec.items && Array.isArray(v)) {
    for (const entry of v) {
      const itemVerdict = validateArgs(spec.items, (entry ?? {}) as Record<string, unknown>);
      if (!itemVerdict.ok) return itemVerdict;
    }
  }
  return { ok: true };
}

/** Validate the LLM-supplied args against the tool's JSON-Schema-ish spec. */
export function validateArgs(spec: ParamSpec, args: Record<string, unknown>): GuardrailVerdict {
  for (const key of spec.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      return { ok: false, reason: `"${key}" missing hai.` };
    }
  }
  for (const [key, sub] of Object.entries(spec.properties ?? {})) {
    if (args[key] === undefined || args[key] === null) continue;
    const verdict = validateValue(key, sub, args[key]);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}

/** Sum of qty×rate across an `items` array — covers itemised invoices/purchases
 *  where the money figure isn't a single flat field. */
function itemsTotal(args: Record<string, unknown>): number {
  const items = Array.isArray(args.items) ? (args.items as Record<string, unknown>[]) : [];
  return items.reduce((sum, it) => {
    const qty = Number(it.qty ?? it.quantity ?? 0);
    const rate = Number(it.rate ?? it.price ?? 0);
    return sum + (Number.isFinite(qty) && Number.isFinite(rate) ? qty * rate : 0);
  }, 0);
}

/** Cross-cutting safety check run before preview/commit. */
export function checkPolicy(tool: AlaraTool, args: Record<string, unknown>): GuardrailVerdict {
  const validity = validateArgs(tool.parameters, args);
  if (!validity.ok) return validity;

  // Money caps: a single flat field, or the computed total of an item array
  // (e.g. create_invoice has no top-level "amount" — only items[].qty/.rate).
  const v = args.amount;
  if (v != null && Number(v) > MAX_AMOUNT) {
    return {
      ok: false,
      reason: `Amount ${Number(v).toLocaleString()} bohat zyada hai — app mein manually confirm karein.`,
    };
  }
  const total = itemsTotal(args);
  if (total > MAX_AMOUNT) {
    return {
      ok: false,
      reason: `Items ka total ${Math.round(total).toLocaleString()} bohat zyada hai — app mein manually confirm karein.`,
    };
  }

  // Quantity cap — protects against a misheard/fat-fingered stock quantity.
  const qty = args.quantity;
  if (qty != null && Number(qty) > MAX_QUANTITY) {
    return {
      ok: false,
      reason: `Quantity ${Number(qty).toLocaleString()} bohat zyada hai — app mein manually confirm karein.`,
    };
  }

  return { ok: true };
}
