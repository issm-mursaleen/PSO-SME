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
import { TOOLS } from './tools';
import { toToolSchemas } from './types';
import { runToolCall, commitToolCall } from './toolRunner';

const CHAT_CACHE_KEY = 'alara-chat-cache-v1';
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
  useEffect(() => {
    ctxRef.current = {
      customers: app.customers,
      invoices: app.invoices,
      connectQueue: app.connectQueue,
      commLogs: app.commLogs,
      inventory: app.inventory,
      addCustomer: app.addCustomer,
      updateCustomer: app.updateCustomer,
      recordSale: app.recordSale,
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
    try {
      const raw = window.localStorage.getItem(CHAT_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { threads?: ChatThread[]; activeChatId?: string };
        if (Array.isArray(cached.threads) && cached.threads.length) {
          const activeId =
            cached.activeChatId && cached.threads.some((t) => t.id === cached.activeChatId)
              ? cached.activeChatId
              : cached.threads[0].id;
          const active = cached.threads.find((t) => t.id === activeId) ?? cached.threads[0];
          setChatThreads(cached.threads);
          setActiveChatId(activeId);
          setChatMessages(active.messages);
        }
      }
    } catch {
      /* ignore corrupt cache */
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
    window.localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify({ threads: chatThreads, activeChatId }));
  }, [chatThreads, activeChatId, cacheReady]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const append = useCallback((msg: AlaraChatMessage) => {
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  /** Run one plan's tool calls; returns read data (for re-plan) + whether any
   *  call paused for confirmation or terminated the turn. */
  const applyPlan = useCallback((plan: PlanResponse): { readData: unknown[]; halted: boolean } => {
    const readData: unknown[] = [];
    let halted = false;
    for (const call of plan.tool_calls) {
      const outcome = runToolCall(call as ToolCall, ctxRef.current);
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
      };

      try {
        let plan: PlanResponse;
        try {
          plan = await planChat(t, tools, context, baseHistory);
        } catch {
          plan = localPlan(t); // backend unreachable
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
    [app.customers, append, applyPlan, chatMessages],
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
    setChatMessages((prev) => {
      const msg = prev.find((m) => m.id === messageId);
      if (!msg || !msg.toolCall || msg.status !== 'pending') return prev; // idempotent
      const res = commitToolCall(msg.toolCall, ctxRef.current);
      const newStatus: 'confirmed' | 'failed' = res.ok ? 'confirmed' : 'failed';
      const updated = prev.map((m) =>
        m.id === messageId
          ? { ...m, status: newStatus, cardData: { ...(m.cardData ?? {}), status: newStatus } }
          : m,
      );
      const follow: AlaraChatMessage = {
        id: uid(),
        sender: 'alara',
        text: res.text,
        cardType: res.cardType,
        cardData: res.cardData,
      };
      if (res.navigateTo) ctxRef.current.navigate(res.navigateTo);
      return [...updated, follow];
    });
  }, []);

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
    markStatus(messageId, 'confirmed');
    const call: ToolCall = { name: toolName, args: { ...baseArgs, customer: candidate.name } };
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
  };
}

// ── Offline fallback planner (only when the backend is unreachable) ──────────
function localPlan(message: string): PlanResponse {
  const text = message.trim();
  const low = text.toLowerCase();
  const amt = (low.match(/\d[\d,]*/)?.[0] ?? '').replace(/,/g, '');
  const nameBefore = (stop: string) =>
    text.match(new RegExp(`^\\s*([A-Za-z][A-Za-z\\s]+?)\\s+(?:${stop})\\b`, 'i'))?.[1]?.trim();

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
  // Dynamic visualization cards: charts/graphs with explanations + suggested actions.
  if (/(visual|visualization|chart|graph|dashboard|breakdown|trend|compare|comparison)/.test(low)) {
    if (/(inventory|stock|sku|reorder|low)/.test(low))
      return fb([{ name: 'show_visualization', args: { kind: 'inventory_risk' } }]);
    if (/(product|item|sku|mix)/.test(low))
      return fb([{ name: 'show_visualization', args: { kind: 'product_mix' } }]);
    if (/(customer|grahak|client|top|best)/.test(low))
      return fb([{ name: 'show_visualization', args: { kind: 'top_customers' } }]);
    return fb([{ name: 'show_visualization', args: { kind: 'sales_trend' } }]);
  }
  // Proactive next-steps: "ab kya karun", "next step", "what next", "suggestion".
  if (/(ab kya|next step|what next|kya karu|suggest|suggestion|recommend|advice|mashwara)/.test(low)) {
    const c = nameBefore('ke|ka|ki|ko|for');
    return fb([{ name: 'suggest_next_steps', args: c ? { customer: c } : {} }]);
  }
  // "Most business / best customer" = lifetime sales.
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
