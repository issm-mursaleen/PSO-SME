// The tool runner — the one place tools actually execute. It enforces the
// guardrail policy around every call so the agent loop (useAlaraChat) and the
// confirmation buttons never touch tools directly.
//
//   runToolCall   → validate + preview. Read/navigate are terminal; write/comms/
//                   destructive return a PENDING outcome (card awaiting confirm).
//   commitToolCall → validate + commit. Called by the card's Confirm/Send button.

import type { AlaraToolContext, CardData, CardType, ToolCall, ToolResult } from './types';
import { TOOL_BY_NAME } from './tools';
import { checkPolicy, requiresConfirmation } from './guardrails';

export interface RunOutcome {
  text: string;
  cardType?: CardType;
  cardData?: CardData;
  /** Present when the outcome is a card awaiting user confirmation. */
  toolCall?: ToolCall;
  status?: 'pending' | 'failed';
  /** Route to push (navigate tier, or post-commit redirects). */
  navigateTo?: string;
  /** Structured data from a read tool — fed back to the planner for re-planning. */
  data?: Record<string, unknown>;
  /** True when execution is deferred until the user confirms. */
  pending: boolean;
}

export function runToolCall(call: ToolCall, ctx: AlaraToolContext): RunOutcome {
  const tool = TOOL_BY_NAME[call.name];
  if (!tool) return { text: `"${call.name}" naam ka koi tool nahi.`, pending: false, status: 'failed' };

  const verdict = checkPolicy(tool, call.args);
  if (!verdict.ok) return { text: verdict.reason ?? 'Guardrail block.', pending: false, status: 'failed' };

  const res = tool.preview(call.args, ctx);

  if (!res.ok) {
    // Disambiguation is not a failure — it's a prompt for the user to choose.
    if (res.cardType === 'disambiguation')
      return { text: res.text, cardType: res.cardType, cardData: res.cardData, pending: false };
    return { text: res.text, pending: false, status: 'failed' };
  }

  if (requiresConfirmation(tool)) {
    return {
      text: res.text,
      cardType: res.cardType,
      cardData: { ...(res.cardData ?? {}), status: 'pending' },
      toolCall: call,
      status: 'pending',
      pending: true,
    };
  }

  // read / navigate → terminal, runs now.
  return {
    text: res.text,
    cardType: res.cardType,
    cardData: res.cardData,
    navigateTo: res.navigateTo,
    data: res.data,
    pending: false,
  };
}

export function commitToolCall(call: ToolCall, ctx: AlaraToolContext): ToolResult {
  const tool = TOOL_BY_NAME[call.name];
  if (!tool?.commit) return { ok: false, text: 'Yeh action confirm nahi ho sakta.', error: 'no_commit' };

  const verdict = checkPolicy(tool, call.args);
  if (!verdict.ok) return { ok: false, text: verdict.reason ?? 'Guardrail block.', error: 'policy' };

  return tool.commit(call.args, ctx);
}
