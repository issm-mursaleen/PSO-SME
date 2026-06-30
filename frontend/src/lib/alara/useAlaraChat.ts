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
import type { AlaraChatMessage, AlaraToolContext, CardData, ChatThread, ToolCall } from './types';
import { TOOLS, VIZ_KIND_META } from './tools';
import { toToolSchemas } from './types';
import { runToolCall, commitToolCall, type RunOutcome } from './toolRunner';
import { planLocal } from './planner';

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

type ChatCache = { threads?: ChatThread[]; activeChatId?: string };

function parseChatCache(raw: string | null): ChatCache | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ChatCache;
    return Array.isArray(parsed.threads) && parsed.threads.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function chatCacheScore(cache: ChatCache | null): number {
  if (!cache?.threads?.length) return 0;
  let userMessages = 0;
  let totalMessages = 0;
  for (const thread of cache.threads) {
    const messages = Array.isArray(thread.messages) ? thread.messages : [];
    totalMessages += messages.length;
    userMessages += messages.filter((m) => m.sender === 'user').length;
  }
  return userMessages * 1000 + totalMessages * 10 + cache.threads.length;
}

function bestChatCache(...caches: (ChatCache | null)[]): ChatCache | null {
  return caches.reduce<ChatCache | null>(
    (best, cache) => (chatCacheScore(cache) > chatCacheScore(best) ? cache : best),
    null,
  );
}

// ── Tabbed-visualization assembly ────────────────────────────────────────────
// A multi-intent message ("sales trend aur top customers dikhao") produces one
// show_visualization outcome per requested view. These are buffered, then this
// pure helper stitches them into a single 'tabbed_visualization' card: one tab
// per view (a failed kind keeps its tab as status:'error' so one bad view never
// drops the others), a shared subtitle, and a combined summary built from each
// tab's own headline/first-stat — no new prose, just stitched facts.
type VizBufferEntry = { kind: string; outcome: RunOutcome };

function buildTabbedVizCard(buffer: VizBufferEntry[]): { text: string; cardData: CardData } {
  const tabs = buffer.map(({ kind, outcome }) => {
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
  const subtitle = buffer
    .map(({ outcome }) => outcome.cardData?.subtitle)
    .find((s): s is string => typeof s === 'string');
  const facts = buffer
    .map(({ outcome }) => {
      const insights = outcome.cardData?.insights as { headline?: string } | undefined;
      if (insights?.headline) return insights.headline;
      const stats = outcome.cardData?.stats as { label: string; value: unknown }[] | undefined;
      const first = stats?.[0];
      return first ? `${first.label}: ${String(first.value)}.` : null;
    })
    .filter((s): s is string => Boolean(s));
  return {
    text: `${tabs.length} views ready — ${tabs.map((t) => t.label).join(', ')}.`,
    cardData: {
      title: 'Business performance',
      subtitle,
      combinedSummary: facts.length ? { headline: facts.join(' '), facts } : undefined,
      tabs,
    },
  };
}

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
    const hydrate = (cached: ChatCache | null) => {
      if (!cached?.threads?.length) return false;
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
      const primary = parseChatCache(window.localStorage.getItem(CHAT_CACHE_KEY));
      const backup = parseChatCache(window.localStorage.getItem(CHAT_CACHE_BACKUP_KEY));
      const restored = bestChatCache(primary, backup);
      hydrate(restored);
    } catch {
      try {
        hydrate(parseChatCache(window.localStorage.getItem(CHAT_CACHE_BACKUP_KEY)));
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
    const nextCacheObject: ChatCache = { threads: chatThreads, activeChatId };
    const nextCache = JSON.stringify(nextCacheObject);
    const previousCache = window.localStorage.getItem(CHAT_CACHE_KEY);
    const backupCache = window.localStorage.getItem(CHAT_CACHE_BACKUP_KEY);
    const bestBackup = bestChatCache(parseChatCache(backupCache), parseChatCache(previousCache));
    if (bestBackup && chatCacheScore(bestBackup) > chatCacheScore(nextCacheObject)) {
      window.localStorage.setItem(CHAT_CACHE_BACKUP_KEY, JSON.stringify(bestBackup));
    } else if (previousCache && previousCache !== nextCache && chatCacheScore(parseChatCache(previousCache)) > 0) {
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
  const applyPlan = useCallback((plan: PlanResponse): {
    readData: unknown[];
    halted: boolean;
    lastCardType?: string;
    lastCardData?: Record<string, unknown>;
    lastToolCall?: ToolCall;
  } => {
    const readData: unknown[] = [];
    let halted = false;
    let lastCardType: string | undefined;
    let lastCardData: Record<string, unknown> | undefined;
    let lastToolCall: ToolCall | undefined;
    const vizBuffer: VizBufferEntry[] = [];
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
        lastCardType = outcome.cardType;
        lastCardData = outcome.cardData;
      } else {
        const { text, cardData } = buildTabbedVizCard(vizBuffer);
        append({ id: uid(), sender: 'alara', text, cardType: 'tabbed_visualization', cardData });
        lastCardType = 'tabbed_visualization';
      }
      vizBuffer.length = 0;
    };

    for (const call of plan.tool_calls) {
      const outcome = runToolCall(call as ToolCall, ctxRef.current);
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
      lastCardType = outcome.cardType;
      lastCardData = outcome.cardData;
      lastToolCall = call as ToolCall;
      if (outcome.navigateTo) ctxRef.current.navigate(outcome.navigateTo);
      if (outcome.pending) halted = true; // awaiting confirmation
      else if (outcome.data) readData.push({ tool: call.name, ...outcome.data });
      else if (outcome.cardType === 'disambiguation') halted = true;
    }
    flushViz();
    if (successfulVizCalls.length) lastVisualizationCallsRef.current = successfulVizCalls;
    return { readData, halted, lastCardType, lastCardData, lastToolCall };
  }, [append]);

  /** True when a card already carries its own connected next-action(s) —
   *  visualizations/insights/get_supplier/get_product/top_customers all do.
   *  Auto-suggesting on top of these would just be a second, disconnected
   *  opinion, so we skip it entirely in that case. */
  function hasOwnNextSteps(cardData?: Record<string, unknown>): boolean {
    if (!cardData) return false;
    const steps = cardData.steps;
    if (Array.isArray(steps) && steps.length > 0) return true;
    const insights = cardData.insights as { recommendedAction?: unknown } | undefined;
    if (insights?.recommendedAction) return true;
    // An invoice card already has its own Download / View-in-Invoices buttons.
    if (cardData.invoice_id && cardData.document) return true;
    return false;
  }

  /** A single, topic-relevant follow-up for the handful of read tools whose
   *  card has no built-in steps and no customer in context — built from the
   *  exact tool/args just used, never a generic shop-wide guess. */
  function topicFollowup(lastToolCall?: ToolCall): { label: string; prompt: string; reason: string } | null {
    if (lastToolCall?.name === 'query_data' && lastToolCall.args.template === 'sales_today') {
      return { label: 'Sales trend dikhao', prompt: 'Sales trend dikhao', reason: 'Pichle dinon ka trend dekhein' };
    }
    return null;
  }

  /** Appends a "Suggested next steps" card after a turn completes — but only
   *  when it's actually connected to what was just discussed: skipped if the
   *  card already has its own next action, otherwise tailored to whichever
   *  customer the turn was about, or to one topic-relevant follow-up for a
   *  handful of known contextless tools. No generic shop-wide fallback —
   *  better to suggest nothing than something unrelated. */
  const appendNextSteps = useCallback((cardData?: Record<string, unknown>, lastToolCall?: ToolCall) => {
    if (hasOwnNextSteps(cardData)) return;

    const customerName = cardData?.customer_name;
    if (typeof customerName === 'string' && customerName) {
      const outcome = runToolCall({ name: 'suggest_next_steps', args: { customer: customerName } }, ctxRef.current);
      if (outcome.cardType === 'next_steps') {
        append({ id: uid(), sender: 'alara', text: outcome.text, cardType: outcome.cardType, cardData: outcome.cardData });
      }
      return;
    }

    const followup = topicFollowup(lastToolCall);
    if (followup) {
      append({
        id: uid(),
        sender: 'alara',
        text: 'Aap shayad yeh dekhna chahein:',
        cardType: 'next_steps',
        cardData: { title: 'Suggested next step', steps: [{ ...followup, tone: 'normal' }] },
      });
    }
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
          // No tool ran, so there's no connected next step to offer — a plain
          // conversational reply doesn't get a bolted-on suggestion.
        } else {
          const { halted, lastCardType, lastCardData, lastToolCall } = applyPlan(plan);
          if (plan.final_text) append({ id: uid(), sender: 'alara', text: plan.final_text });
          // A next-best-action suggestion follows, but only when it's
          // actually connected to what was just shown (see appendNextSteps) —
          // and never while something is still awaiting confirmation/choice.
          if (!halted && lastCardType !== 'next_steps' && lastCardType !== 'disambiguation') {
            appendNextSteps(lastCardData, lastToolCall);
          }
        }
      } finally {
        setIsTyping(false);
      }
    },
    [app.customers, app.suppliers, app.supplierInvoices, append, applyPlan, appendNextSteps, chatMessages],
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
    if (res.ok && res.cardType !== 'next_steps') {
      appendNextSteps(res.cardData);
    }
  }, [chatMessages, append, appendNextSteps]);

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
    const name = msg.cardData?.recipientName;
    appendNextSteps(typeof name === 'string' ? { customer_name: name } : undefined);
  }, [append, chatMessages, appendNextSteps]);

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
    if (!outcome.pending && outcome.cardType !== 'disambiguation' && outcome.cardType !== 'next_steps') {
      appendNextSteps(outcome.cardData ?? { customer_name: candidate.name }, call);
    }
  }, [append, chatMessages, appendNextSteps]);

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
// Delegates to the generic, spec-driven interpreter in planner.ts. That planner
// is built from the SAME shared/alara-intents.json the backend reads, so the two
// cannot drift. In development we surface the planner trace for debugging.
function localPlan(message: string): PlanResponse {
  const result = planLocal(message);
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[alara:planner]', { hash: result.intent_spec_hash, ...result.trace });
  }
  return result;
}
