// Shared Alara types — the contract between the tool registry, the guardrail
// runner, the agent loop (useAlaraChat) and the chat UI.
//
// Design notes:
// - We keep a dependency-free, JSON-Schema-shaped `ParamSpec` so a tool's
//   parameter schema can be sent verbatim to the backend planner (OpenAI
//   tool-calling) AND validated client-side without pulling in Zod.
// - AppContext stays the single source of truth: every tool executes against
//   it via `AlaraToolContext`. The backend never mutates state.

import type {
  Customer,
  Invoice,
  ConnectQueueItem,
  CommunicationLog,
  StockItem,
  Supplier,
  SupplierInvoice,
  StockMovement,
} from '@/context/AppContext';

// ── Param schema (a small JSON-Schema subset) ───────────────────────────────
export interface ParamSpec {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: (string | number)[];
  minimum?: number;
  items?: ParamSpec;
  properties?: Record<string, ParamSpec>;
  required?: string[];
}

/** The wire shape sent to the planner so it (and OpenAI) knows the tool surface. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: ParamSpec; // always an object schema
}

// ── Tiers drive the guardrail policy ────────────────────────────────────────
export type ToolTier = 'read' | 'write' | 'destructive' | 'comms' | 'navigate';

// ── Cards (the good UX we keep + a few new ones) ─────────────────────────────
export type CardType =
  | 'metric'
  | 'list'
  | 'confirmation' // comms draft (WhatsApp/SMS)
  | 'invoice'
  | 'sale_confirmation'
  | 'customer_confirmation'
  | 'disambiguation'
  | 'next_steps' // data-derived suggested actions (each sends a follow-up prompt)
  | 'insight' // 360° analytical answer: figures + context + risks + actions
  | 'csv_export'
  | 'visualization'
  | 'navigate';

export type CardData = Record<string, unknown>;

export type ToolCallStatus = 'pending' | 'confirmed' | 'failed';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface AlaraChatMessage {
  id: string;
  sender: 'user' | 'alara';
  text: string;
  cardType?: CardType;
  cardData?: CardData;
  /** Present on write/comms cards: the action that runs when the user confirms. */
  toolCall?: ToolCall;
  /** Lifecycle of the pending action — drives idempotency in the runner. */
  status?: ToolCallStatus;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: AlaraChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ── Planner I/O ──────────────────────────────────────────────────────────────
export interface PlanResult {
  toolCalls: ToolCall[];
  /** Free-text reply when the planner chose not to call a tool. */
  finalText?: string;
  source: 'llm' | 'fallback';
}

// ── Tool execution result ────────────────────────────────────────────────────
export interface ToolResult {
  ok: boolean;
  /** Confirmation / answer text shown in the assistant bubble. */
  text: string;
  cardType?: CardType;
  cardData?: CardData;
  error?: string;
  /** A read tool can return data the agent loop feeds back to re-plan. */
  data?: Record<string, unknown>;
  /** Set by navigate / post-commit tools to route the app. */
  navigateTo?: string;
}

// ── The context every tool executes against (built from useApp() + router) ───
export interface AlaraToolContext {
  // Read selectors (live AppContext state).
  customers: Customer[];
  invoices: Invoice[];
  connectQueue: ConnectQueueItem[];
  commLogs: CommunicationLog[];
  inventory: StockItem[];
  suppliers: Supplier[];
  supplierInvoices: SupplierInvoice[];
  stockMovements: StockMovement[];

  // Mutating actions (deterministic — all math lives here, never in the model).
  addCustomer: (c: Omit<Customer, 'id' | 'lastVisitDays'>) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => Customer | null;
  recordSale: (
    customerId: string,
    items: { name: string; quantity: number; unit: string; price: number; total: number }[],
    discount: number,
    notes: string,
  ) => Invoice;
  recordPurchase: (
    supplierId: string,
    items: { name: string; quantity: number; unit: string; price: number; total: number; sku?: string }[],
    discount: number,
    notes: string,
    opts?: { status?: 'Draft' | 'Paid'; invoiceNumber?: string; date?: string },
  ) => SupplierInvoice;
  confirmDraftPurchase: (invoiceId: string) => SupplierInvoice | null;
  sendWhatsAppReminder: (
    customerId: string,
    message: string,
    type?: 'WhatsApp' | 'SMS' | 'Call',
  ) => void;
  recordStockIn: (sku: string, quantity: number) => StockItem | null;

  // App navigation.
  navigate: (route: string) => void;
}

// ── Tool definition (one per capability; registry is the single source) ──────
export interface AlaraTool {
  name: string;
  description: string;
  tier: ToolTier;
  parameters: ParamSpec;
  /**
   * read / navigate  → runs immediately, result is terminal (may feed re-plan).
   * write / comms / destructive → builds a PENDING card (no mutation yet).
   * Returns an error ToolResult (ok:false) when validation fails.
   */
  preview: (args: Record<string, unknown>, ctx: AlaraToolContext) => ToolResult;
  /** Only for write/comms/destructive: performs the mutation on user confirm. */
  commit?: (args: Record<string, unknown>, ctx: AlaraToolContext) => ToolResult;
}

/** Serialise the registry to the wire schema the planner consumes. */
export function toToolSchemas(tools: AlaraTool[]): ToolSchema[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
