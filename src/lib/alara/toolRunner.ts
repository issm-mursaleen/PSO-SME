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

function normalizeVisualizationCall(call: ToolCall): ToolCall {
  if (call.name !== 'show_visualization') return call;

  const kindAliases: Record<string, string> = {
    sales: 'sales_trend',
    sales_chart: 'sales_trend',
    sales_trend: 'sales_trend',
    trend: 'sales_trend',
    top: 'top_customers',
    customers: 'top_customers',
    top_customers: 'top_customers',
    products: 'product_mix',
    product_mix: 'product_mix',
    inventory: 'inventory_risk',
    stock: 'inventory_risk',
    inventory_risk: 'inventory_risk',
    customer_split: 'customer_type_split',
    customer_type_split: 'customer_type_split',
    reorder: 'reorder_progress',
    progress: 'reorder_progress',
    reorder_progress: 'reorder_progress',
  };
  const chartAliases: Record<string, string> = {
    pie: 'donut',
    doughnut: 'donut',
    donut: 'donut',
    line: 'line',
    trend: 'line',
    area: 'line',
    bar: 'bar',
    column: 'bar',
    progress: 'progress',
    kpi: 'kpi',
    metric: 'kpi',
  };

  const args = { ...call.args };
  const kind = String(args.kind ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const chartType = String(args.chartType ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  args.kind = kindAliases[kind] ?? 'sales_trend';
  if (args.chartType != null && args.chartType !== '') {
    const normalizedChartType = chartAliases[chartType];
    if (normalizedChartType) args.chartType = normalizedChartType;
    else delete args.chartType;
  }

  return { ...call, args };
}

export function runToolCall(call: ToolCall, ctx: AlaraToolContext): RunOutcome {
  call = normalizeVisualizationCall(call);
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
