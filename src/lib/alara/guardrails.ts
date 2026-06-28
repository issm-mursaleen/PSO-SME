// Guardrails — applied uniformly before any tool runs, keyed off the tool tier.
// Validation that is *intrinsic* to a tool (customer resolution, qty/rate sanity)
// lives in the tool's own preview(); these are the cross-cutting safety rails:
// arg-shape validation against the schema, hard caps on money/batch size, and the
// confirm policy the runner enforces.

import type { AlaraTool, ParamSpec } from './types';

/** Absolute ceiling on any single money amount Alara will act on without a human
 *  re-typing it manually in the app. Protects against a misheard "200000". */
export const MAX_AMOUNT = 500_000;
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

/** Validate the LLM-supplied args against the tool's JSON-Schema-ish spec. */
export function validateArgs(spec: ParamSpec, args: Record<string, unknown>): GuardrailVerdict {
  for (const key of spec.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      return { ok: false, reason: `"${key}" missing hai.` };
    }
  }
  for (const [key, sub] of Object.entries(spec.properties ?? {})) {
    if (args[key] === undefined || args[key] === null) continue;
    const v = args[key];
    if ((sub.type === 'number' || sub.type === 'integer') && typeof v !== 'number' && isNaN(Number(v)))
      return { ok: false, reason: `"${key}" number honi chahiye.` };
    if (sub.enum && !sub.enum.includes(v as string | number))
      return { ok: false, reason: `"${key}" ki value valid nahi.` };
  }
  return { ok: true };
}

/** Cross-cutting safety check run before preview/commit. */
export function checkPolicy(tool: AlaraTool, args: Record<string, unknown>): GuardrailVerdict {
  const validity = validateArgs(tool.parameters, args);
  if (!validity.ok) return validity;

  // Money caps on any field that looks like an amount.
  for (const field of ['amount', 'amount_paid', 'credit_limit']) {
    const v = args[field];
    if (v != null && Number(v) > MAX_AMOUNT) {
      return {
        ok: false,
        reason: `${field} ${Number(v).toLocaleString()} bohat zyada hai — app mein manually confirm karein.`,
      };
    }
  }
  return { ok: true };
}
