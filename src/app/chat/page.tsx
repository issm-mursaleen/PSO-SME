'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Bot, Plus, MessageSquare, Send, Paperclip, Sparkles, ArrowRight,
  Banknote, ShoppingCart, LineChart, UserPlus, Copy, Check,
} from 'lucide-react';
import { useApp, type AlaraChatMessage } from '@/context/AppContext';

const SUGGESTED = [
  { category: 'Record Payment', prompt: 'Sana Bibi ne 3000 de diye', icon: Banknote },
  { category: 'Record Sale', prompt: 'Malik ne 1200 ka saman liya udhar', icon: ShoppingCart },
  { category: 'Query Udhar', prompt: 'Pichle hafte kitna udhar recover hua?', icon: LineChart },
  { category: 'Add Customer', prompt: 'Naya customer — Imran, Saddar, hotel wala', icon: UserPlus },
];

function AlaraAvatar() {
  return (
    <span className="size-7 rounded-md bg-foreground flex items-center justify-center shrink-0">
      <Bot className="size-4 text-background" />
    </span>
  );
}

// ── Message bubbles ─────────────────────────────────────────────────────────
function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start justify-end gap-3 animate-fade-in">
      <div className="max-w-[75%] bg-primary text-primary-foreground rounded-lg px-4 py-2.5">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
      <span className="size-7 rounded-md bg-muted border border-outline-variant shrink-0 flex items-center justify-center mt-0.5">
        <span className="text-[11px] font-bold text-muted-foreground">U</span>
      </span>
    </div>
  );
}

function AssistantBubble({ msg, onWhatsApp }: { msg: AlaraChatMessage; onWhatsApp: (m: AlaraChatMessage) => void }) {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="mt-0.5">
        <AlaraAvatar />
      </div>
      <div className="flex-1 min-w-0 bg-card border border-outline-variant rounded-lg px-4 py-3 shadow-card">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        {msg.cardType && <MessageCard msg={msg} onWhatsApp={onWhatsApp} />}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="mt-0.5"><AlaraAvatar /></div>
      <div className="bg-card border border-outline-variant rounded-lg px-4 py-3.5 shadow-card">
        <div className="flex items-center gap-1">
          {[0, 150, 300].map((d) => (
            <span key={d} className="size-1.5 rounded-full bg-muted-foreground animate-bounce"
              style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Cards (neutral c360 styling) ────────────────────────────────────────────
function MessageCard({ msg, onWhatsApp }: { msg: AlaraChatMessage; onWhatsApp: (m: AlaraChatMessage) => void }) {
  const d = msg.cardData ?? {};
  const [copied, setCopied] = useState(false);

  if (msg.cardType === 'metric') {
    const rows: [string, unknown][] = [
      ['Total Outstanding', d.totalOutstanding],
      ['Active Defaulters', d.activeDefaulters],
      ['Recovery Rate', d.recoveryRate],
    ];
    return (
      <div className="mt-3 grid grid-cols-3 gap-2">
        {rows.map(([label, val]) => (
          <div key={label} className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="text-sm font-bold text-foreground mt-1 tabular-nums">{String(val ?? '—')}</p>
          </div>
        ))}
      </div>
    );
  }

  if (msg.cardType === 'confirmation') {
    return (
      <div className="mt-3 rounded-lg border border-outline-variant overflow-hidden">
        <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
            WhatsApp Draft — {String(d.recipientName ?? '')}
          </span>
          <span className="font-mono text-[9px] text-muted-foreground">{String(d.phoneNumber ?? '')}</span>
        </div>
        <div className="p-3">
          <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{String(d.message ?? '')}</p>
        </div>
        <div className="px-3 py-2.5 bg-surface-container-low border-t border-outline-variant flex justify-end gap-2">
          <button
            onClick={() => { navigator.clipboard?.writeText(String(d.message ?? '')); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-outline-variant text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={() => onWhatsApp(msg)}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all"
          >
            <Send className="size-3.5" /> Send on WhatsApp
          </button>
        </div>
      </div>
    );
  }

  if (msg.cardType === 'invoice') {
    const items = Array.isArray(d.items) ? (d.items as { name: string; qty: string; price: string }[]) : [];
    return (
      <div className="mt-3 rounded-lg border border-outline-variant overflow-hidden">
        <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
            Invoice {String(d.invoiceId ?? '')}
          </span>
          <span className="font-mono text-[9px] text-muted-foreground">{String(d.date ?? '')}</span>
        </div>
        <div className="p-3 space-y-1.5">
          <p className="text-xs font-semibold text-foreground">{String(d.customerName ?? '')}</p>
          {items.map((it, i) => (
            <div key={i} className="flex justify-between text-xs text-muted-foreground">
              <span>{it.name} <span className="text-foreground/50">× {it.qty}</span></span>
              <span className="tabular-nums">{it.price}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2 mt-1 border-t border-outline-variant text-sm font-bold text-foreground">
            <span>Total</span><span className="tabular-nums">{String(d.amount ?? '')}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
  return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto pt-12">
      <span className="size-12 rounded-xl bg-foreground flex items-center justify-center mb-4">
        <Bot className="size-6 text-background" />
      </span>
      <h1 className="font-mono text-xl font-bold text-foreground mb-2 tracking-tight text-center">
        Alara — Agentic Co-pilot
      </h1>
      <p className="text-sm text-muted-foreground text-center mb-10 max-w-md">
        Sales &amp; udhar likhein, customers add karein, invoices banayein — sirf likh kar batayein.
      </p>
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3">
        {SUGGESTED.map((p) => {
          const Ico = p.icon;
          return (
            <button
              key={p.category}
              onClick={() => onPrompt(p.prompt)}
              className="group p-3 text-left border border-outline-variant rounded-lg bg-card shadow-card hover:shadow-card-hover hover:border-foreground/30 transition-all flex items-start justify-between"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <Ico className="size-4 text-muted-foreground group-hover:text-foreground transition-colors mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">{p.category}</span>
                  <span className="text-xs text-foreground mt-0.5 block truncate">{p.prompt}</span>
                </div>
              </div>
              <ArrowRight className="size-3.5 text-muted-foreground shrink-0 self-center transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
function ChatWorkspace() {
  const { chatMessages, sendChatMessage, sendWhatsAppReminder } = useApp();
  const searchParams = useSearchParams();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  const hasMessages = chatMessages.length > 0;
  // Awaiting a reply whenever the last message is still the user's.
  const isTyping = hasMessages && chatMessages[chatMessages.length - 1].sender === 'user';

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    sendChatMessage(t);
    setInput('');
  };

  // Auto-send ?query= once (e.g. from dashboard "Remind" actions)
  useEffect(() => {
    const q = searchParams.get('query');
    if (q && !sentInitial.current) {
      sentInitial.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep scrolled to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleWhatsApp = (m: AlaraChatMessage) => {
    const d = m.cardData ?? {};
    if (d.customerId && d.message) {
      sendWhatsAppReminder(String(d.customerId), String(d.message), 'WhatsApp');
    }
  };

  return (
    <div className="flex h-[calc(100vh-52px)] overflow-hidden bg-background">
      {/* History sidebar */}
      <div className="hidden md:flex w-[250px] shrink-0 flex-col border-r border-outline-variant bg-card">
        <div className="p-4 border-b border-outline-variant flex items-center justify-between">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-foreground">Chat History</span>
          <button
            onClick={() => window.location.reload()}
            title="New chat"
            className="p-1 border border-outline-variant rounded-sm bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hidden p-3 space-y-1.5">
          {!hasMessages ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="size-6 text-muted-foreground/30 mb-2" />
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">No past chats</p>
            </div>
          ) : (
            <button className="w-full text-left p-3 rounded-sm border border-foreground bg-muted/40 text-foreground text-xs flex flex-col gap-1.5">
              <p className="font-semibold truncate text-foreground/90">
                {chatMessages.find((m) => m.sender === 'user')?.text ?? 'Current session'}
              </p>
              <div className="flex items-center justify-between font-mono text-[9px] text-muted-foreground mt-0.5">
                <span>just now</span>
                <span className="bg-muted px-1.5 py-0.5 rounded-sm border border-outline-variant/40 text-foreground font-bold">
                  {chatMessages.length} msg{chatMessages.length !== 1 && 's'}
                </span>
              </div>
            </button>
          )}
        </div>
        <div className="p-3 border-t border-outline-variant">
          <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <Sparkles className="size-3.5" />
            <span>Powered by deterministic workflows</span>
          </div>
        </div>
      </div>

      {/* Workspace */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex-1 overflow-y-auto scrollbar-hidden px-6 pt-8 pb-36">
          {!hasMessages && !isTyping ? (
            <EmptyState onPrompt={send} />
          ) : (
            <div className="w-full max-w-3xl mx-auto space-y-4">
              {chatMessages.map((m) =>
                m.sender === 'user' ? (
                  <UserBubble key={m.id} text={m.text} />
                ) : (
                  <AssistantBubble key={m.id} msg={m} onWhatsApp={handleWhatsApp} />
                ),
              )}
              {isTyping && <TypingBubble />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="absolute bottom-0 left-0 w-full px-6 pb-6 pt-12 bg-linear-to-t from-background via-background/95 to-transparent">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-center bg-card border border-outline-variant rounded-lg shadow-md overflow-hidden focus-within:border-foreground/30 focus-within:ring-1 focus-within:ring-foreground/10 transition-all">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Message Alara…  (e.g. “Riaz ne 2000 de diye”)"
                className="flex-1 bg-transparent px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <div className="flex items-center gap-1 pr-2">
                <button className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <Paperclip className="size-4" />
                </button>
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim()}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/85 active:scale-95 transition-all disabled:opacity-30"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
            </div>
            <p className="text-center mt-2.5 text-[11px] text-muted-foreground/70">
              Alara can make mistakes. Verify critical financial data before acting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-gutter text-sm text-muted-foreground">Loading chat…</div>}>
      <ChatWorkspace />
    </Suspense>
  );
}
