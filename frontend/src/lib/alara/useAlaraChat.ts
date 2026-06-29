'use client';

// useAlaraChat — the agent loop + chat thread/cache state, lifted out of
// AppContext so the provider only owns domain data. This hook:
//   1. builds the tool context from useApp() + the router,
//   2. asks the backend planner which tool(s) to call (bounded multi-step loop),
//   3. runs each call through the guardrail-enforcing toolRunner,
//   4. exposes confirm/send/pick handlers the cards wire their buttons to.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { planChat, type PlanResponse, type ChatHistoryMessage } from '@/lib/api';
import type { AlaraChatMessage, AlaraToolContext, ChatThread, ToolCall } from './types';
import { TOOLS, VIZ_KIND_META } from './tools';
import { toToolSchemas } from './types';
import { runToolCall, commitToolCall } from './toolRunner';

const CHAT_CACHE_KEY = 'alara-chat-cache-v1';
const CHAT_CACHE_BACKUP_KEY = 'alara-chat-cache-v1-backup';
const uid = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const WELCOME: AlaraChatMessage = {
  id: 'm-welcome',
  sender: 'alara',
  text:
    'Salam! Main Alara — pura app chala sakti hun. Sale/payment likhein, customer add/edit karein, ' +
    'invoice banayein, reminders bhejein, ya koi bhi page kholne ko kahein.',
};

export function useAlaraChat() {
  const app = useApp();
  const router = useRouter();

  const [chatThreads, setChatThreads] = useState<ChatThread[]>([
    { id: 'chat-demo', title: 'New chat', messages: [WELCOME], createdAt: 0, updatedAt: 0 },
  ]);
  const [activeChatId, setActiveChatId] = useState('chat-demo');
  const [chatMessages, setChatMessages] = useState<AlaraChatMessage[]>([WELCOME]);
  const [isTyping, setIsTyping] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);

  // Always-fresh tool context (avoids stale closures in async handlers). Updated
  // after every render so handlers read the latest AppContext state.
  const ctxRef = useRef<AlaraToolContext>(null as unknown as AlaraToolContext);
  // Remembers the show_visualization call(s) behind the most recently shown
  // chart(s) — lets a bare follow-up ("sirf top 2 kar do") re-run them with
  // one field adjusted, without the user repeating the whole request.
  const lastVisualizationCallsRef = useRef<ToolCall[]>([]);
  useEffect(() => {
    ctxRef.current = {
      customers: app.customers,
      invoices: app.invoices,
      connectQueue: app.connectQueue,
      commLogs: app.commLogs,
      inventory: app.inventory,
      suppliers: app.suppliers,
      supplierInvoices: app.supplierInvoices,
      stockMovements: app.stockMovements,
      addCustomer: app.addCustomer,
      updateCustomer: app.updateCustomer,
      recordSale: app.recordSale,
      recordPurchase: app.recordPurchase,
      confirmDraftPurchase: app.confirmDraftPurchase,
      sendWhatsAppReminder: app.sendWhatsAppReminder,
      recordStockIn: app.recordStockIn,
      navigate: (route: string) => router.push(route),
    };
  });

  // ── Cache (load once, persist on change) ───────────────────────────────────
  // Hydrating from localStorage is a one-time client-only sync from an external
  // store (not derivable during SSR), so setState in these effects is intended.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const hydrate = (raw: string | null) => {
      if (!raw) return false;
      const cached = JSON.parse(raw) as { threads?: ChatThread[]; activeChatId?: string };
      if (!Array.isArray(cached.threads) || cached.threads.length === 0) return false;
      const activeId =
        cached.activeChatId && cached.threads.some((t) => t.id === cached.activeChatId)
          ? cached.activeChatId
          : cached.threads[0].id;
      const active = cached.threads.find((t) => t.id === activeId) ?? cached.threads[0];
      setChatThreads(cached.threads);
      setActiveChatId(activeId);
      setChatMessages(active.messages);
      return true;
    };

    try {
      const raw = window.localStorage.getItem(CHAT_CACHE_KEY);
      if (!hydrate(raw)) hydrate(window.localStorage.getItem(CHAT_CACHE_BACKUP_KEY));
    } catch {
      try {
        hydrate(window.localStorage.getItem(CHAT_CACHE_BACKUP_KEY));
      } catch {
        /* ignore corrupt cache */
      }
    }
    setCacheReady(true);
  }, []);

  // Mirror the active thread's transcript so history/persistence stay in sync.
  useEffect(() => {
    if (!cacheReady) return;
    setChatThreads((prev) =>
      prev.map((t) =>
        t.id === activeChatId
          ? {
              ...t,
              title: chatMessages.find((m) => m.sender === 'user')?.text.slice(0, 64) || 'New chat',
              messages: chatMessages,
              updatedAt: Date.now(),
            }
          : t,
      ),
    );
  }, [activeChatId, chatMessages, cacheReady]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!cacheReady) return;
    const nextCache = JSON.stringify({ threads: chatThreads, activeChatId });
    const previousCache = window.localStorage.getItem(CHAT_CACHE_KEY);
    if (previousCache && previousCache !== nextCache) {
      window.localStorage.setItem(CHAT_CACHE_BACKUP_KEY, previousCache);
    }
    window.localStorage.setItem(CHAT_CACHE_KEY, nextCache);
  }, [chatThreads, activeChatId, cacheReady]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const append = useCallback((msg: AlaraChatMessage) => {
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  /** Run one plan's tool calls; returns read data (for re-plan) + whether any
   *  call paused for confirmation or terminated the turn.
   *
   *  show_visualization calls are buffered instead of appended immediately:
   *  a single one renders as today (one 'visualization' card), but 2+ from
   *  the same plan are merged into one 'tabbed_visualization' card so a
   *  multi-intent request ("sales trend aur top customers dikhao") shows as
   *  one card with tabs instead of several separate chat bubbles. A failed
   *  visualization still gets its own tab (status:'error'), so one bad kind
   *  never drops the others. */
  const applyPlan = useCallback((plan: PlanResponse): { readData: unknown[]; halted: boolean } => {
    const readData: unknown[] = [];
    let halted = false;
    const vizBuffer: { kind: string; outcome: ReturnType<typeof runToolCall> }[] = [];
    const successfulVizCalls: ToolCall[] = [];

    const flushViz = () => {
      if (vizBuffer.length === 0) return;
      if (vizBuffer.length === 1) {
        const { outcome } = vizBuffer[0];
        append({
          id: uid(),
          sender: 'alara',
          text: outcome.text,
          cardType: outcome.cardType,
          cardData: outcome.cardData,
          toolCall: outcome.toolCall,
          status: outcome.status,
        });
      } else {
        const tabs = vizBuffer.map(({ kind, outcome }) => {
          const meta = VIZ_KIND_META[kind] ?? { label: 'Chart', icon: 'BarChart3' };
          const stats = outcome.cardData?.stats as { label: string; value: unknown }[] | undefined;
          const firstStatValue = stats?.[0]?.value;
          const badge = typeof firstStatValue === 'number' && firstStatValue < 100 ? String(firstStatValue) : undefined;
          const isSuccess = outcome.cardType === 'visualization';
          return {
            id: kind,
            label: meta.label,
            icon: meta.icon,
            badge,
            status: isSuccess ? 'success' : 'error',
            cardData: outcome.cardData ?? {},
            error: isSuccess ? undefined : outcome.text,
          };
        });
        const subtitle = vizBuffer
          .map(({ outcome }) => outcome.cardData?.subtitle)
          .find((s): s is string => typeof s === 'string');
        const facts = vizBuffer
          .map(({ outcome }) => {
            const insights = outcome.cardData?.insights as { headline?: string } | undefined;
            if (insights?.headline) return insights.headline;
            const stats = outcome.cardData?.stats as { label: string; value: unknown }[] | undefined;
            const first = stats?.[0];
            return first ? `${first.label}: ${String(first.value)}.` : null;
          })
          .filter((s): s is string => Boolean(s));
        append({
          id: uid(),
          sender: 'alara',
          text: `${tabs.length} views ready — ${tabs.map((t) => t.label).join(', ')}.`,
          cardType: 'tabbed_visualization',
          cardData: {
            title: 'Business performance',
            subtitle,
            combinedSummary: facts.length ? { headline: facts.join(' '), facts } : undefined,
            tabs,
          },
        });
      }
      vizBuffer.length = 0;
    };

    for (const call of plan.tool_calls) {
      const outcome = runToolCall(call as ToolCall, ctxRef.current);
      // TEMP DEBUG LOGGING — verifying the customer-ranking routing fix;
      // remove once confirmed query_data(top_by_sales) no longer fires for
      // ranking/top-N customer requests.
      if (call.name === 'show_visualization' || call.name === 'query_data') {
        console.log('[alara:plan]', {
          tool: call.name,
          kind: (call as ToolCall).args.kind,
          limit: (call as ToolCall).args.limit,
          scope: (call as ToolCall).args.scope,
          ranking_metric: (call as ToolCall).args.ranking_metric,
          template: (call as ToolCall).args.template,
          renderer:
            call.name === 'show_visualization'
              ? (call as ToolCall).args.kind === 'top_customers'
                ? 'TopCustomersVisualization'
                : 'VisualizationCard'
              : 'MostBusinessCard(legacy)',
        });
      }
      if (call.name === 'show_visualization') {
        const kind = String((call as ToolCall).args.kind ?? outcome.cardData?.kind ?? 'sales_trend');
        vizBuffer.push({ kind, outcome });
        if (outcome.cardType === 'visualization') successfulVizCalls.push(call as ToolCall);
        continue; // flushed below once a non-visualization call appears, or at the end
      }
      flushViz();
      append({
        id: uid(),
        sender: 'alara',
        text: outcome.text,
        cardType: outcome.cardType,
        cardData: outcome.cardData,
        toolCall: outcome.toolCall,
        status: outcome.status,
      });
      if (outcome.navigateTo) ctxRef.current.navigate(outcome.navigateTo);
      if (outcome.pending) halted = true; // awaiting confirmation
      else if (outcome.data) readData.push({ tool: call.name, ...outcome.data });
      else if (outcome.cardType === 'disambiguation') halted = true;
    }
    flushViz();
    if (successfulVizCalls.length) lastVisualizationCallsRef.current = successfulVizCalls;
    return { readData, halted };
  }, [append]);

  const historyFrom = (msgs: AlaraChatMessage[]): ChatHistoryMessage[] =>
    msgs.slice(-12).map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));

  const sendMessage = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      const userMsg: AlaraChatMessage = { id: uid(), sender: 'user', text: t };
      const baseHistory = historyFrom(chatMessages);
      append(userMsg);
      setIsTyping(true);

      const tools = toToolSchemas(TOOLS).map((s) => ({
        name: s.name,
        description: s.description,
        parameters: s.parameters as unknown as Record<string, unknown>,
      }));
      const context = {
        current_page: 'chat',
        customers: app.customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          status: c.status,
          lastVisitDays: c.lastVisitDays,
        })),
        suppliers: app.suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          status: s.status,
        })),
        // Send supplier invoices so the backend can build accurate supplier
        // purchase trend visualizations from real AppContext data.
        supplier_invoices: app.supplierInvoices.map((inv) => ({
          id: inv.id,
          supplierId: inv.supplierId,
          supplierName: inv.supplierName,
          date: inv.date,
          amount: inv.amount,
          status: inv.status,
        })),
      };

      try {
        let plan: PlanResponse;
        // A bare follow-up ("sirf top 2 kar do", "date range 6 weeks kar do")
        // adjusts the last shown chart(s) directly — no planner round-trip,
        // so it works the same whether the backend/LLM is reachable or not.
        const adjustment = buildFollowUpAdjustment(t, lastVisualizationCallsRef.current);
        if (adjustment) {
          plan = { tool_calls: adjustment, source: 'fallback' };
        } else {
          try {
            plan = await planChat(t, tools, context, baseHistory);
          } catch {
            plan = localPlan(t); // backend unreachable
          }
        }

        if (plan.tool_calls.length === 0) {
          append({ id: uid(), sender: 'alara', text: plan.final_text || 'Ji, batayein main kaise madad karun?' });
        } else {
          applyPlan(plan);
          if (plan.final_text) append({ id: uid(), sender: 'alara', text: plan.final_text });
        }
      } finally {
        setIsTyping(false);
      }
    },
    [app.customers, app.suppliers, append, applyPlan, chatMessages],
  );

  // ── Card actions ─────────────────────────────────────────────────────────────
  const markStatus = (messageId: string, status: 'confirmed' | 'failed') =>
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, status, cardData: { ...(m.cardData ?? {}), status } } : m,
      ),
    );

  /** Confirm a write/destructive card (sale, payment, invoice, update, bulk). */
  const confirmCard = useCallback((messageId: string) => {
    const msg = chatMessages.find((m) => m.id === messageId);
    if (!msg || !msg.toolCall || msg.status !== 'pending') return; // idempotent
    const res = commitToolCall(msg.toolCall, ctxRef.current);
    const newStatus: 'confirmed' | 'failed' = res.ok ? 'confirmed' : 'failed';
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, status: newStatus, cardData: { ...(m.cardData ?? {}), status: newStatus } }
          : m,
      ),
    );
    append({
      id: uid(),
      sender: 'alara',
      text: res.text,
      cardType: res.cardType,
      cardData: res.cardData,
    });
    if (res.navigateTo) ctxRef.current.navigate(res.navigateTo);
  }, [chatMessages, append]);

  /** Send a comms draft card: dispatch it into the Outreach workspace (logs to
   *  commLogs via the tool's commit), instead of opening an external WhatsApp tab. */
  const sendDraftCard = useCallback((messageId: string) => {
    const msg = chatMessages.find((m) => m.id === messageId);
    if (!msg || msg.status !== 'pending') return;
    if (msg.toolCall) commitToolCall(msg.toolCall, ctxRef.current);
    markStatus(messageId, 'confirmed');
    append({
      id: uid(),
      sender: 'alara',
      text: `Message Outreach tab mein bhej diya — ${String(msg.cardData?.recipientName ?? '')}. Connect page par dekh sakte hain.`,
    });
  }, [append, chatMessages]);

  /** Pick a candidate from a disambiguation card and re-run the original tool. */
  const pickCandidate = useCallback((messageId: string, candidate: { id: string; name: string }) => {
    const msg = chatMessages.find((m) => m.id === messageId);
    if (!msg || msg.cardType !== 'disambiguation') return;
    const d = msg.cardData ?? {};
    const toolName = String(d.forTool ?? '');
    const baseArgs = (d.baseArgs ?? {}) as Record<string, unknown>;
    const argKey = String(d.argKey ?? 'customer');
    markStatus(messageId, 'confirmed');
    const call: ToolCall = { name: toolName, args: { ...baseArgs, [argKey]: candidate.name } };
    const outcome = runToolCall(call, ctxRef.current);
    append({
      id: uid(),
      sender: 'alara',
      text: outcome.text,
      cardType: outcome.cardType,
      cardData: outcome.cardData,
      toolCall: outcome.toolCall,
      status: outcome.status,
    });
    if (outcome.navigateTo) ctxRef.current.navigate(outcome.navigateTo);
  }, [append, chatMessages]);

  // ── Threads ──────────────────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    const now = Date.now();
    const thread: ChatThread = { id: `chat-thread-${now}`, title: 'New chat', messages: [], createdAt: now, updatedAt: now };
    setChatThreads((prev) => [thread, ...prev]);
    setActiveChatId(thread.id);
    setChatMessages([]);
  }, []);

  const selectChatThread = useCallback(
    (threadId: string) => {
      const thread = chatThreads.find((t) => t.id === threadId);
      if (!thread) return;
      setActiveChatId(thread.id);
      setChatMessages(thread.messages);
    },
    [chatThreads],
  );

  const deleteChatThread = useCallback(
    (threadId: string) => {
      setChatThreads((prev) => {
        const remaining = prev.filter((t) => t.id !== threadId);
        if (remaining.length === 0) {
          const now = Date.now();
          const welcomeThread: ChatThread = {
            id: 'chat-demo',
            title: 'New chat',
            messages: [WELCOME],
            createdAt: now,
            updatedAt: now,
          };
          setActiveChatId(welcomeThread.id);
          setChatMessages([WELCOME]);
          return [welcomeThread];
        }
        if (threadId === activeChatId) {
          const nextActive = remaining[0];
          setActiveChatId(nextActive.id);
          setChatMessages(nextActive.messages);
        }
        return remaining;
      });
    },
    [activeChatId],
  );

  return {
    chatMessages,
    chatThreads,
    activeChatId,
    isTyping,
    sendMessage,
    confirmCard,
    sendDraftCard,
    pickCandidate,
    startNewChat,
    selectChatThread,
    deleteChatThread,
  };
}

// ── Bare follow-up adjustment ("sirf top 2 kar do", "date range 6 weeks kar
// do") — re-runs the last shown show_visualization call(s) with one field
// changed, instead of requiring the user to repeat the whole request. ───────
function parsePeriodUnit(raw: string): 'days' | 'weeks' | 'months' | 'years' {
  if (/din|day/.test(raw)) return 'days';
  if (/hafte|hafton|week/.test(raw)) return 'weeks';
  if (/maheene|mahine|month/.test(raw)) return 'months';
  return 'years';
}

function buildFollowUpAdjustment(text: string, lastCalls: ToolCall[]): ToolCall[] | null {
  if (lastCalls.length === 0) return null;
  const low = text.trim().toLowerCase();

  const topMatch = low.match(/^\s*(?:sirf\s+)?top\s*(\d+)\s*(?:kar\s*do|karo|kardo)?\s*\.?$/);
  if (topMatch) {
    const limit = Number(topMatch[1]);
    let touched = false;
    const adjusted = lastCalls.map((c) => {
      if (c.name === 'show_visualization' && c.args.kind === 'top_customers') {
        touched = true;
        return { ...c, args: { ...c.args, limit } };
      }
      return c;
    });
    return touched ? adjusted : null;
  }

  const rangeMatch = low.match(
    /^\s*(?:date\s*range|range)\s+(\d+)\s*(din|dino|days?|hafte|hafton|weeks?|maheene|mahine|months?|saal|years?)\s*(?:kar\s*do|karo|kardo)?\s*\.?$/,
  );
  if (rangeMatch) {
    const value = Number(rangeMatch[1]);
    const unit = parsePeriodUnit(rangeMatch[2].toLowerCase());
    const group_by =
      unit === 'days' ? 'day' : unit === 'weeks' ? (value <= 4 ? 'day' : 'week') : unit === 'months' ? (value <= 2 ? 'week' : 'month') : 'month';
    let touched = false;
    const adjusted = lastCalls.map((c) => {
      if (c.name !== 'show_visualization') return c;
      touched = true;
      const { date_from, date_to, ...rest } = c.args;
      void date_from;
      void date_to;
      return { ...c, args: { ...rest, period_value: value, period_unit: unit, group_by } };
    });
    return touched ? adjusted : null;
  }

  return null;
}

// ── Offline fallback planner (only when the backend is unreachable) ──────────
function localPlan(message: string): PlanResponse {
  const text = message.trim();
  const low = text.toLowerCase();
  const amt = (low.match(/\d[\d,]*/)?.[0] ?? '').replace(/,/g, '');
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

  const fb = (tool_calls: { name: string; args: Record<string, unknown> }[], final_text?: string): PlanResponse => ({
    tool_calls,
    final_text,
    source: 'fallback',
  });

  if (/\b(liya|le liya|saman|kharid|becha|sale|bika)\b/.test(low) && amt) {
    const c = nameBefore('ne|ka|ki');
    if (c)
      return fb([
        { name: 'record_sale', args: { customer: c, amount: Number(amt) } },
      ]);
  }
  if (/(naya customer|add customer|new customer)/.test(low)) {
    const rest = text.split(/[—\-:]/).slice(1).join(' ').trim() || text;
    const parts = rest.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return fb([{ name: 'add_customer', args: { name: parts[0], area: parts[1] } }]);
  }
  // Show/preview a PREVIOUSLY generated invoice (not a new one): an explicit
  // ID, or "<customer> ka last/pichla bill dikhao" — checked BEFORE the
  // invoice-creation block below, since both mention "bill"/"invoice".
  const invoiceIdMatch = text.match(/\bINV-[\w-]+/i);
  if (invoiceIdMatch && /(dikhao|kholo|show|preview|dekho)/.test(low)) {
    return fb([{ name: 'get_invoice', args: { invoice_id: invoiceIdMatch[0].toUpperCase() } }]);
  }
  if (
    /\b(bill|invoice)\b/.test(low) &&
    /(last|pichla|pichli|purana|purani|previous|recent|dikhao|dekho|kholo|preview)/.test(low) &&
    !text.includes('@')
  ) {
    const cust = nameBefore('ka|ki|ke');
    if (cust) return fb([{ name: 'get_invoice', args: { customer: cust } }]);
  }
  // Invoice: "Tariq Hotel ka bill — 50L doodh @ 200, 10kg cheeni @ 300".
  if (/\b(bill|invoice)\b/.test(low)) {
    const custM = text.match(/^\s*(.+?)\s+(?:ka|ki)\s+(?:bill|invoice)/i);
    const customer = custM?.[1]?.trim();
    const items: { name: string; qty: number; rate: number }[] = [];
    const re = /(\d+(?:\.\d+)?)\s*[a-zA-Z]*\s+([a-zA-Z][a-zA-Z\s]*?)\s*@\s*(\d+(?:\.\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      items.push({ qty: Number(m[1]), name: m[2].trim(), rate: Number(m[3]) });
    }
    if (customer && items.length) return fb([{ name: 'create_invoice', args: { customer, items } }]);
    if (customer) return fb([], `${customer} ka bill banane ke liye har item ka rate bhi likhein, e.g. "50 doodh @ 200, 10 cheeni @ 300".`);
  }
  // Bulk outreach FIRST: "inactive/lapsed walon ko message bhejo".
  if (/(sab|sabko|sab ko|bulk|inactive|lapsed|purane|walon)/.test(low) && /(reminder|message|bhej|yaad|offer)/.test(low)) {
    return fb([{ name: 'bulk_remind', args: { filter: 'inactive' } }]);
  }
  // Single reminder / outreach: "X ko message likhdo", "reminder bhejo", "yaad dilao".
  if (/(message|msg|reminder|remind|yaad dila|likh ?do|likho|draft)/.test(low)) {
    const c = nameBefore('ko|ka|ki|ke');
    if (c) return fb([{ name: 'draft_reminder', args: { customer: c } }]);
  }
  // Visit / recency for ONE customer: "X last time kab aaya/aayi", "kitne din se nahi aaya".
  if (/(kab aa\w*|last time|aakhri baar|kitne din|kab aaye|visit kab|kab aya)/.test(low)) {
    const c = nameBefore('last|kab|kitne|aakhri|ka|ki|ko|ne');
    if (c) return fb([{ name: 'customer_visit', args: { customer: c } }]);
  }
  // "Which customers haven't come in the last N days" → inactive list.
  if (/(nahi aa\w*|nahin aa\w*|inactive|gayab)/.test(low) && /(din|days|customer|grahak|kaun|konsi|konse)/.test(low)) {
    const dm = low.match(/(\d+)\s*(din|day)/);
    const idle = dm ? Number(dm[1]) : 7;
    return fb([{ name: 'list_customers', args: { filter: 'inactive', idle_days: idle } }]);
  }
  const periodArgs = parsePeriod();
  // Supplier operations can be phrased without the literal word "supplier".
  if (/(purchase|purchases|payable|outstanding|overdue|due|payment|inventory receive|receive hui)/.test(low)) {
    const s = nameBefore('ki|ka|ke|se');
    if (Object.keys(periodArgs).length > 0 && /(purchase|purchases)/.test(low))
      return fb([{ name: 'show_visualization', args: { kind: 'supplier_purchase_trend', chartType: /(compare|comparison)/.test(low) ? 'bar' : 'area', ...periodArgs } }]);
    if (/(csv|export|download)/.test(low))
      return fb([{ name: 'export_supplier_csv', args: { dataset: 'supplier_invoices', ...(s ? { supplier: s } : {}) } }]);
    if (/(payable|outstanding|overdue|due|payment|pending)/.test(low)) {
      const status = /overdue/.test(low) ? 'overdue' : /due/.test(low) ? 'due_soon' : /paid/.test(low) ? 'paid' : /pending|outstanding/.test(low) ? 'pending' : 'all';
      return fb([{ name: 'supplier_payables', args: { status, ...(s ? { supplier: s } : {}) } }]);
    }
    if (/(invoice|bill|draft|generate|banao|banado|receive hui)/.test(low))
      return fb([{ name: 'draft_supplier_invoice', args: { ...(s ? { supplier: s } : {}) } }]);
    return fb([{ name: 'supplier_purchase_analysis', args: { ...(s ? { supplier: s } : {}) } }]);
  }
  // Supplier directory / one supplier's profile.
  if (/(supplier)/.test(low)) {
    const s = nameBefore('se|ka|ki|supplier|ke');
    if (/(csv|export|download)/.test(low)) {
      const dataset = /(item|line)/.test(low) ? 'supplier_purchase_items' : /(directory|list|contact)/.test(low) ? 'suppliers' : 'supplier_invoices';
      return fb([{ name: 'export_supplier_csv', args: { dataset, ...(s ? { supplier: s } : {}) } }]);
    }
    if (/(payable|outstanding|overdue|due|pending|payment)/.test(low)) {
      const status = /overdue/.test(low) ? 'overdue' : /due/.test(low) ? 'due_soon' : /paid/.test(low) ? 'paid' : /pending|outstanding/.test(low) ? 'pending' : 'all';
      return fb([{ name: 'supplier_payables', args: { status, ...(s ? { supplier: s } : {}) } }]);
    }
    if (/(purchase|purchases|analysis|trend|rank|compare|contribution|history)/.test(low)) {
      return fb([{ name: 'supplier_purchase_analysis', args: { ...(s ? { supplier: s } : {}) } }]);
    }
    if (/(invoice|bill|draft|generate|banao|banado)/.test(low)) {
      return fb([{ name: 'draft_supplier_invoice', args: { ...(s ? { supplier: s } : {}) } }]);
    }
    if (/(list|sab|all|directory|kitne)/.test(low))
      return fb([{ name: 'list_suppliers', args: {} }]);
    if (s) return fb([{ name: 'get_supplier', args: { supplier: s } }]);
    return fb([{ name: 'list_suppliers', args: {} }]);
  }
  // Inventory listing: low/out-of-stock products.
  if (/(low stock|out of stock|stock khatam|reorder)/.test(low) && /(product|item|inventory|list|kaunsi|konsi|sku)/.test(low)) {
    const filter = /out of stock|khatam/.test(low) ? 'out_of_stock' : 'low_stock';
    return fb([{ name: 'list_inventory', args: { filter } }]);
  }
  // One product's stock level: "<product> kitna stock hai / stock check".
  if (/(kitna stock|stock check|stock hai|kitne (units|pieces)|stock kitna)/.test(low)) {
    const p = nameBefore('ka|ki|mein|ke|kitna|stock');
    if (p) return fb([{ name: 'get_product', args: { product: p } }]);
  }
  // Multi-intent visualization detection: scan for ALL requested chart kinds
  // (not just the first match), so "sales trend aur top 3 customers dikhao"
  // returns ONE show_visualization call per requested view, in the user's
  // order, sharing the same date range — instead of collapsing into one
  // generic chart. A single matched kind behaves exactly as before (one call).
  // Customer-ranking detection — HIGH PRIORITY: must win over the legacy
  // query_data top_by_sales template (further down) for anything beyond a
  // bare singular question. A plural "customers" mention reaching this point
  // (every more-specific earlier intent already ruled out) is treated as a
  // ranking request even with no explicit rank/top-N word — matches phrasing
  // like "customers based on business". A bare SINGULAR "customer" mention
  // only counts when paired with an explicit number, a rank word, or an
  // action word (chart/list/report/...) — so "mera best customer kaun hai?"
  // stays a plain question (→ query_data), while "best customer ka chart
  // dikhao" routes here with limit=1.
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

  if (orderedKinds.length > 0) {
    const calls = orderedKinds.slice(0, 6).map((kind) => {
      const args: Record<string, unknown> = { kind, ...periodArgs };
      if (kind === 'top_customers') {
        args.chartType = 'bar';
        // Explicit number wins; a bare singular "customer" mention implies
        // exactly one; otherwise omit it and let the tool default to 5.
        const limitValue = topLimitMatch ? Number(topLimitMatch[1]) : mentionsCustomerSingular ? 1 : undefined;
        if (limitValue != null) args.limit = limitValue;
        args.ranking_metric = /(invoice count|invoice_count|transactions?|number of invoices)/.test(low)
          ? 'invoice_count'
          : 'revenue';
        args.scope = Object.keys(periodArgs).length > 0 ? 'selected_period' : 'lifetime';
      } else if ((kind === 'sales_trend' || kind === 'supplier_purchase_trend') && /(compare|comparison)/.test(low)) {
        args.chartType = 'bar';
      }
      return { name: 'show_visualization', args };
    });
    return fb(calls);
  }
  // Bare "invoices dikhao" / "inki invoices bhi dikhao" → open the Invoices page.
  if (/^\s*(inki\s+|unki\s+|in\s+)?invoices?\s*(bhi)?\s*(dikhao|kholo|do|chahiye)?\s*\.?$/.test(low)) {
    return fb([{ name: 'navigate', args: { page: 'invoices' } }]);
  }
  // Proactive next-steps: "ab kya karun", "next step", "what next", "suggestion".
  if (/(ab kya|next step|what next|kya karu|suggest|suggestion|recommend|advice|mashwara)/.test(low)) {
    const c = nameBefore('ke|ka|ki|ko|for');
    return fb([{ name: 'suggest_next_steps', args: c ? { customer: c } : {} }]);
  }
  // LEGACY — only reachable for a bare singular question with no ranking/
  // graph/list/report/top-N wording (the scanner above already intercepted
  // every plural "customers" mention and every triggered singular one).
  if (/(sab se zyada|sabse zyada|most|best|top).*(business|sale|customer|grahak)|business.*(zyada|most)/.test(low))
    return fb([{ name: 'query_data', args: { template: 'top_by_sales' } }]);
  // Single-customer analysis: "X ka business / X kaisa customer / X ki performance".
  if (/(business|performance|profile|kaisa|kaisi|kitna|analysis|insight|360)/.test(low)) {
    const c = nameBefore('ka|ki|ke|kaisa|kaisi');
    if (c) return fb([{ name: 'customer_insight', args: { customer: c } }]);
  }
  if (low.includes('sales today') || (low.includes('aaj') && low.includes('sale')))
    return fb([{ name: 'query_data', args: { template: 'sales_today' } }]);
  if (low.startsWith('open ') || low.includes('kholo') || low.includes('khol'))
    return fb([{ name: 'navigate', args: { page: low.replace(/open |kholo|khol/g, '').trim() } }]);

  return fb(
    [],
    'Ji, main sale likh sakti hun, customer add/update kar sakti hun, invoice bana sakti hun, ' +
      'outreach message bhej sakti hun, ya koi page khol sakti hun. Kya karna hai?',
  );
}
