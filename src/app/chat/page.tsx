'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import {
  Bot, Plus, MessageSquare, Send, Paperclip, Sparkles, ArrowRight,
  Banknote, ShoppingCart, LineChart, UserPlus, Copy, Check, AlertTriangle, ReceiptText, Mic,
} from 'lucide-react';
import { useApp, type AlaraChatMessage } from '@/context/AppContext';
import { transcribeAudio } from '@/lib/api';

const SUGGESTED = [
  { category: 'Record Payment', prompt: 'Sana Bibi ne 3000 de diye', icon: Banknote },
  { category: 'Record Sale', prompt: 'Malik ne 1200 ka saman liya udhar', icon: ShoppingCart },
  { category: 'Query Udhar', prompt: 'Pichle hafte kitna udhar recover hua?', icon: LineChart },
  { category: 'Add Customer', prompt: 'Naya customer — Imran, Saddar, hotel wala', icon: UserPlus },
  { category: 'Create Invoice', prompt: 'Iqbal ka bill banao — 50 doodh @ 200, 10 cheeni @ 300', icon: ReceiptText },
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

function AssistantBubble({
  msg,
  onWhatsApp,
  onConfirmSale,
  onConfirmCustomer,
  onShareInvoice,
}: {
  msg: AlaraChatMessage;
  onWhatsApp: (m: AlaraChatMessage) => void;
  onConfirmSale: (messageId: string) => void;
  onConfirmCustomer: (messageId: string) => void;
  onShareInvoice: (m: AlaraChatMessage) => void;
}) {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="mt-0.5">
        <AlaraAvatar />
      </div>
      <div className="flex-1 min-w-0 bg-card border border-outline-variant rounded-lg px-4 py-3 shadow-card">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        {msg.cardType && (
          <MessageCard
            msg={msg}
            onWhatsApp={onWhatsApp}
            onConfirmSale={onConfirmSale}
            onConfirmCustomer={onConfirmCustomer}
            onShareInvoice={onShareInvoice}
          />
        )}
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
function MessageCard({
  msg,
  onWhatsApp,
  onConfirmSale,
  onConfirmCustomer,
  onShareInvoice,
}: {
  msg: AlaraChatMessage;
  onWhatsApp: (m: AlaraChatMessage) => void;
  onConfirmSale: (messageId: string) => void;
  onConfirmCustomer: (messageId: string) => void;
  onShareInvoice: (m: AlaraChatMessage) => void;
}) {
  const d = msg.cardData ?? {};
  const [copied, setCopied] = useState(false);

  if (msg.cardType === 'metric') {
    // Adaptive: render whatever the query returned (works for every template +
    // the legacy {totalOutstanding,...} shape), instead of fixed fields.
    const humanize = (k: string) =>
      k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    const isMoney = (k: string) => /total|outstanding|recovered|amount|balance/i.test(k);
    const fmt = (k: string, v: unknown) => {
      if (v === null || v === undefined) return '—';
      if (typeof v === 'number') return isMoney(k) ? `PKR ${v.toLocaleString()}` : v.toLocaleString();
      return String(v);
    };

    const topList = Array.isArray(d.top) ? (d.top as Record<string, unknown>[]) : null;
    if (topList) {
      return (
        <div className="mt-3 rounded-lg border border-outline-variant overflow-hidden">
          <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">Top Defaulters</span>
          </div>
          <div className="p-3 space-y-1.5">
            {topList.map((t, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-foreground font-medium">{i + 1}. {String(t.name ?? '')}</span>
                <span className="tabular-nums text-muted-foreground">PKR {Number(t.balance ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const entries = Object.entries(d).filter(
      ([k, v]) => !['status', 'top', 'customer_id', 'customerId', 'days'].includes(k) && typeof v !== 'object',
    );
    if (entries.length === 0) return null;
    const cols = entries.length >= 3 ? 'grid-cols-3' : entries.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
    return (
      <div className={`mt-3 grid gap-2 ${cols}`}>
        {entries.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{humanize(k)}</p>
            <p className="text-sm font-bold text-foreground mt-1 tabular-nums">{fmt(k, v)}</p>
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
    // Supports both the backend shape (invoice_id / total / items[{qty,rate}])
    // and the legacy confirm-sale shape (invoiceId / amount / items[{qty,price}]).
    const invId = String(d.invoice_id ?? d.invoiceId ?? '');
    const custName = String(d.customer_name ?? d.customerName ?? '');
    const total = Number(d.total ?? 0) || Number(String(d.amount ?? '').replace(/[^\d.]/g, '')) || 0;
    const rawItems = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
    const items = rawItems.map((it) => ({
      name: String(it.name ?? ''),
      qty: Number(it.qty ?? 1),
      lineTotal:
        Number(it.total ?? 0) ||
        Number(it.qty ?? 1) * Number(it.rate ?? 0) ||
        Number(String(it.price ?? '').replace(/[^\d.]/g, '')) ||
        0,
    }));
    return (
      <div className="mt-3 rounded-lg border border-outline-variant overflow-hidden">
        <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
            Invoice {invId}
          </span>
          <span className="font-mono text-[9px] text-success font-bold">Generated</span>
        </div>
        <div className="p-3 space-y-1.5">
          <p className="text-xs font-semibold text-foreground">{custName}</p>
          {items.map((it, i) => (
            <div key={i} className="flex justify-between text-xs text-muted-foreground">
              <span>{it.name} <span className="text-foreground/50">x {it.qty}</span></span>
              <span className="tabular-nums">Rs {it.lineTotal.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2 mt-1 border-t border-outline-variant text-sm font-bold text-foreground">
            <span>Total</span><span className="tabular-nums">Rs {total.toLocaleString()}</span>
          </div>
        </div>
        {(d.customer_id || d.customerId) && (
          <div className="px-3 py-2.5 bg-surface-container-low border-t border-outline-variant flex justify-end">
            <button
              onClick={() => onShareInvoice(msg)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all"
            >
              <Send className="size-3.5" /> Share on WhatsApp
            </button>
          </div>
        )}
      </div>
    );
  }

  if (msg.cardType === 'sale_confirmation') {
    const isConfirmed = d.status === 'confirmed';
    const amount = Number(d.amount ?? 0);
    const balanceBefore = Number(d.balance_before ?? d.balanceBefore ?? 0);
    const balanceAfter = Number(d.balance_after ?? d.balanceAfter ?? balanceBefore);
    const paymentType = String(d.payment_type ?? d.paymentType ?? 'Cash');
    const rows: [string, string][] = [
      ['Customer', String(d.customer_name ?? d.customerName ?? '')],
      ['Amount', `Rs ${amount.toLocaleString()}`],
      ['Payment', paymentType],
      ['Balance After', `Rs ${balanceAfter.toLocaleString()}`],
    ];

    return (
      <div className="mt-3 rounded-lg border border-outline-variant overflow-hidden">
        <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
            Sale Confirmation
          </span>
          <span className={`font-mono text-[9px] font-bold ${isConfirmed ? 'text-success' : 'text-warning'}`}>
            {isConfirmed ? 'Recorded' : 'Needs confirm'}
          </span>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-outline-variant bg-surface-container-low p-2.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="text-xs font-bold text-foreground mt-1 tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <div className="px-3 py-2.5 bg-surface-container-low border-t border-outline-variant flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {paymentType === 'Udhar'
              ? `Balance changes from Rs ${balanceBefore.toLocaleString()} to Rs ${balanceAfter.toLocaleString()}.`
              : 'Cash sale will be recorded with no udhar balance increase.'}
          </p>
          <button
            onClick={() => onConfirmSale(msg.id)}
            disabled={isConfirmed}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
          >
            {isConfirmed ? <Check className="size-3.5" /> : <ShoppingCart className="size-3.5" />}
            {isConfirmed ? 'Recorded' : 'Confirm Sale'}
          </button>
        </div>
      </div>
    );
  }

  if (msg.cardType === 'customer_confirmation') {
    const isConfirmed = d.status === 'confirmed';
    const duplicate = d.duplicate ? String(d.duplicate) : '';
    const rows: [string, string][] = [
      ['Name', String(d.name ?? '')],
      ['Area', String(d.area ?? '') || '—'],
      ['Type', String(d.type ?? 'Household')],
      ['Phone', String(d.phone ?? '') || '—'],
    ];
    return (
      <div className="mt-3 rounded-lg border border-outline-variant overflow-hidden">
        <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
            New Customer
          </span>
          <span className={`font-mono text-[9px] font-bold ${isConfirmed ? 'text-success' : 'text-warning'}`}>
            {isConfirmed ? 'Added' : 'Needs confirm'}
          </span>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-outline-variant bg-surface-container-low p-2.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="text-xs font-bold text-foreground mt-1 truncate">{value}</p>
            </div>
          ))}
          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Opening Balance</p>
            <p className="text-xs font-bold text-foreground mt-1 tabular-nums">Rs 0</p>
          </div>
        </div>
        {duplicate && !isConfirmed && (
          <div className="mx-3 mb-1 flex items-center gap-1.5 rounded-md bg-warning-light px-2.5 py-1.5 text-[10px] font-medium text-warning-text">
            <AlertTriangle className="size-3.5 shrink-0" />
            Possible duplicate of “{duplicate}”. Add anyway?
          </div>
        )}
        <div className="px-3 py-2.5 bg-surface-container-low border-t border-outline-variant flex items-center justify-end">
          <button
            onClick={() => onConfirmCustomer(msg.id)}
            disabled={isConfirmed}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
          >
            {isConfirmed ? <Check className="size-3.5" /> : <UserPlus className="size-3.5" />}
            {isConfirmed ? 'Added' : 'Confirm & Add'}
          </button>
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
  const {
    customers,
    chatMessages,
    chatThreads,
    activeChatId,
    sendChatMessage,
    sendWhatsAppReminder,
    confirmChatSale,
    confirmChatCustomer,
    startNewChat,
    selectChatThread,
  } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const hasMessages = chatMessages.length > 0;
  // Awaiting a reply whenever the last message is still the user's.
  const isTyping = hasMessages && chatMessages[chatMessages.length - 1].sender === 'user';

  // Voice input: record microphone audio, then transcribe through the backend API.
  const toggleVoice = async () => {
    if (listening) {
      recorderRef.current?.stop();
      setVoiceHint('Transcribing...');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceHint('Voice recording is not available in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/wav')) {
            mimeType = 'audio/wav';
          } else {
            mimeType = '';
          }
        }
      } else {
        mimeType = '';
      }

      const recorder = mimeType 
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setListening(false);
        setVoiceHint('Recording failed. Please try again.');
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = async () => {
        setListening(false);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const actualMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: actualMimeType });
        if (blob.size < 500) {
          setVoiceHint('No audio captured. Tap mic and speak again.');
          return;
        }

        try {
          const transcript = await transcribeAudio(blob);
          if (!transcript) {
            setVoiceHint('No speech detected. Try again.');
            return;
          }
          setInput((current) => `${current.trim() ? current.trim() + ' ' : ''}${transcript}`);
          setVoiceHint('Voice added to message.');
          window.setTimeout(() => setVoiceHint(''), 1800);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Transcription failed.';
          setVoiceHint(message.includes('503') || message.includes('OPENAI_API_KEY')
            ? 'Voice needs the backend API key configured.'
            : 'Could not transcribe audio. Check backend is running.');
        }
      };

      recorder.start();
      setListening(true);
      setVoiceHint('Recording... tap mic again to stop.');
    } catch (error) {
      setListening(false);
      const name = error instanceof DOMException ? error.name : '';
      setVoiceHint(name === 'NotAllowedError'
        ? 'Mic permission is blocked. Allow microphone access and try again.'
        : 'Could not start microphone recording.');
    }
  };

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

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Open WhatsApp (wa.me) with the message prefilled, and log it to the timeline.
  const openWhatsApp = (phone: string, message: string, customerId?: string) => {
    const digits = (phone || '').replace(/[^\d]/g, '');
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener');
    if (customerId) sendWhatsAppReminder(customerId, message, 'WhatsApp');
  };

  const handleWhatsApp = (m: AlaraChatMessage) => {
    const d = m.cardData ?? {};
    const customerId = String(d.customerId ?? d.customer_id ?? '');
    const message = String(d.message ?? '');
    if (!message) return;
    const phone = String(d.phoneNumber ?? customers.find((c) => c.id === customerId)?.phone ?? '');
    openWhatsApp(phone, message, customerId || undefined);
  };

  // Confirm an add-customer card, then navigate to the new customer's detail.
  const handleConfirmCustomer = (messageId: string) => {
    const created = confirmChatCustomer(messageId);
    if (created) router.push(`/customers/${created.id}`);
  };

  // Share a generated invoice on WhatsApp (logs into the customer's timeline).
  const handleShareInvoice = (m: AlaraChatMessage) => {
    const d = m.cardData ?? {};
    const customerId = String(d.customer_id ?? d.customerId ?? '');
    if (!customerId) return;
    const invId = String(d.invoice_id ?? d.invoiceId ?? '');
    const total = Number(d.total ?? 0) || Number(String(d.amount ?? '').replace(/[^\d.]/g, '')) || 0;
    const name = String(d.customer_name ?? d.customerName ?? 'Customer');
    const msgText = `Salam ${name}, aap ka bill ${invId} ban gaya — Rs ${total.toLocaleString()} (udhar). Baraye meherbani waqt par clear karein. Shukriya — PSO SME.`;
    const phone = String(customers.find((c) => c.id === customerId)?.phone ?? '');
    openWhatsApp(phone, msgText, customerId);
  };

  return (
    <div className="flex h-[calc(100vh-52px)] overflow-hidden bg-background">
      {/* History sidebar */}
      <div className="hidden md:flex w-[250px] shrink-0 flex-col border-r border-outline-variant bg-card">
        <div className="p-4 border-b border-outline-variant flex items-center justify-between">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-foreground">Chat History</span>
          <button
            onClick={startNewChat}
            title="New chat"
            className="p-1 border border-outline-variant rounded-sm bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hidden p-3 space-y-1.5">
          {chatThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="size-6 text-muted-foreground/30 mb-2" />
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">No past chats</p>
            </div>
          ) : (
            chatThreads
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((thread) => {
                const isActive = thread.id === activeChatId;
                return (
                  <button
                    key={thread.id}
                    onClick={() => selectChatThread(thread.id)}
                    className={`w-full text-left p-3 rounded-sm border text-xs flex flex-col gap-1.5 transition-colors ${
                      isActive
                        ? 'border-foreground bg-muted/40 text-foreground'
                        : 'border-outline-variant bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <p className="font-semibold truncate text-foreground/90">
                      {thread.title}
                    </p>
                    <div className="flex items-center justify-between font-mono text-[9px] text-muted-foreground mt-0.5">
                      <span>{new Date(thread.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="bg-muted px-1.5 py-0.5 rounded-sm border border-outline-variant/40 text-foreground font-bold">
                        {thread.messages.length} msg{thread.messages.length !== 1 && 's'}
                      </span>
                    </div>
                  </button>
                );
              })
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
                  <AssistantBubble
                    key={m.id}
                    msg={m}
                    onWhatsApp={handleWhatsApp}
                    onConfirmSale={confirmChatSale}
                    onConfirmCustomer={handleConfirmCustomer}
                    onShareInvoice={handleShareInvoice}
                  />
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
                <button
                  type="button"
                  onClick={toggleVoice}
                  title={listening ? 'Stop recording' : 'Speak'}
                  aria-label={listening ? 'Stop recording' : 'Speak'}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                    listening
                      ? 'bg-danger/10 text-danger animate-pulse'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <Mic className="size-4" />
                </button>
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
              {voiceHint || 'Alara can make mistakes. Verify critical financial data before acting.'}
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
