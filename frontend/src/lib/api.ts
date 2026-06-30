// Frontend → backend client. Base URL mirrors the c360 convention.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001';

export interface ChatAction {
  workflow: string;
  params: Record<string, unknown>;
}

export interface ChatResponse {
  text: string;
  card_type?: 'metric' | 'confirmation' | 'invoice' | 'sale_confirmation' | 'customer_confirmation' | null;
  card_data?: Record<string, unknown> | null;
  action?: ChatAction | null;
  source: 'llm' | 'fallback';
}

/** A customer row sent so the backend can resolve names against the live roster. */
export interface ChatCustomerCtx {
  id: string;
  name: string;
  phone?: string;
  status?: string;
  lastVisitDays: number;
}

export interface ChatSupplierCtx {
  id: string;
  name: string;
  category?: string;
  status?: string;
}

export interface ChatSupplierInvoiceCtx {
  id: string;
  supplierId?: string;
  supplierName?: string;
  date: string;
  amount: number;
  status?: string;
}

export interface ChatContext {
  active_customer_id?: string | null;
  current_page?: string;
  customers?: ChatCustomerCtx[];
  suppliers?: ChatSupplierCtx[];
  /** Supplier purchase invoices — used by the backend to build accurate
   *  supplier_purchase_trend visualizations. */
  supplier_invoices?: ChatSupplierInvoiceCtx[];
}

/** One prior turn of the conversation, sent so the agent remembers earlier chats. */
export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** POST a message to the deterministic-workflow chat backend. Throws on
 * network/HTTP failure so callers can fall back to local handling. */
export async function sendChatToBackend(
  message: string,
  context: ChatContext = {},
  history: ChatHistoryMessage[] = [],
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, history }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}`);
  return res.json();
}

// ── Agentic planner ──────────────────────────────────────────────────────────
// The frontend owns the tool registry and sends its schema with every request,
// so the backend stays a stateless planner with no hardcoded tool list.

export interface ToolSchemaWire {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallWire {
  name: string;
  args: Record<string, unknown>;
}

export interface PlanResponse {
  tool_calls: ToolCallWire[];
  final_text?: string | null;
  source: 'llm' | 'fallback';
}

/** POST a message + tool catalog to the planner; returns the tool calls to run.
 *  Throws on network/HTTP failure so callers can fall back to a local plan. */
export async function planChat(
  message: string,
  tools: ToolSchemaWire[],
  context: ChatContext = {},
  history: ChatHistoryMessage[] = [],
): Promise<PlanResponse> {
  const res = await fetch(`${API_BASE_URL}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tools, context, history }),
  });
  if (!res.ok) throw new Error(`plan ${res.status}`);
  return res.json();
}

// ── OpenAI usage / credits ────────────────────────────────────────────────────
export interface UsageBucket {
  cost: number;
  cost_usd: number;
  tokens: number;
  requests: number;
}

export interface UsageSummary {
  today: UsageBucket;
  week: UsageBucket;
  month: UsageBucket;
  total: UsageBucket;
  series: { date: string; cost: number; cost_usd: number; requests: number }[];
  model: string;
  currency: string;
  llm_enabled: boolean;
  total_budget_usd: number;
  total_budget_pkr: number;
  remaining_usd: number;
  remaining_pkr: number;
}

/** Fetch OpenAI credits used by the chat. Throws on network/HTTP failure. */
export async function fetchUsage(): Promise<UsageSummary> {
  const res = await fetch(`${API_BASE_URL}/api/usage`);
  if (!res.ok) throw new Error(`usage ${res.status}`);
  return res.json();
}

export async function transcribeAudio(audio: Blob): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'audio/webm' },
    body: audio,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `transcribe ${res.status}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? '';
}
