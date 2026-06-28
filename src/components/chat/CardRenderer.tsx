'use client';

// CardRenderer — a registry keyed by cardType, replacing the old 250-line
// conditional inside the chat page. Each card is a small focused component;
// add a new card by writing one and registering it in CARDS below.

import { useState, type ReactNode } from 'react';
import {
  Send, Copy, Check, ShoppingCart, UserPlus, AlertTriangle, ArrowRight, Package, Users,
  Lightbulb, AlertCircle, Sparkles, ChevronRight, BarChart3, TrendingUp,
} from 'lucide-react';
import type { AlaraChatMessage, CardData } from '@/lib/alara/types';

export interface CardActions {
  onConfirm: (messageId: string) => void;
  onSend: (messageId: string) => void;
  onPick: (messageId: string, candidate: { id: string; name: string }) => void;
  /** Fire a follow-up prompt back into the chat (used by next-steps suggestions). */
  onPrompt: (prompt: string) => void;
}

interface CardProps {
  msg: AlaraChatMessage;
  actions: CardActions;
}

const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => String(v ?? '');
const isConfirmed = (d: CardData) => d.status === 'confirmed';

const shell = 'mt-3 rounded-lg border border-outline-variant overflow-hidden';
const header =
  'px-3 py-2 bg-surface-container-low border-b border-outline-variant flex items-center justify-between';
const headLabel = 'font-mono text-[10px] font-bold uppercase tracking-widest text-foreground';
const footer =
  'px-3 py-2.5 bg-surface-container-low border-t border-outline-variant flex items-center justify-end gap-2';
const confirmBtn =
  'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100';

// ── metric ───────────────────────────────────────────────────────────────────
function MetricCard({ msg }: CardProps) {
  const d = msg.cardData ?? {};
  const stats = Array.isArray(d.stats) ? (d.stats as { label: string; value: unknown }[]) : [];
  const top = Array.isArray(d.top) ? (d.top as { name: string; value: unknown }[]) : [];
  if (top.length) {
    return (
      <div className={shell}>
        <div className={header}><span className={headLabel}>{str(d.title) || 'Top'}</span></div>
        <div className="p-3 space-y-1.5">
          {top.map((t, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-foreground font-medium">{i + 1}. {t.name}</span>
              <span className="tabular-nums text-muted-foreground">{str(t.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!stats.length) return null;
  const cols = stats.length >= 3 ? 'grid-cols-3' : stats.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <div className={`mt-3 grid gap-2 ${cols}`}>
      {stats.map((s, i) => (
        <div key={i} className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
          <p className="text-sm font-bold text-foreground mt-1 tabular-nums">{str(s.value)}</p>
        </div>
      ))}
    </div>
  );
}

// ── list (customers / alerts / bulk target preview) ──────────────────────────
function ListCard({ msg, actions }: CardProps) {
  const d = msg.cardData ?? {};
  const rows = Array.isArray(d.rows)
    ? (d.rows as { primary: string; secondary?: string; meta?: string }[])
    : [];
  const destructive = Boolean(d.destructive);
  const confirmed = isConfirmed(d);
  return (
    <div className={shell}>
      <div className={header}>
        <span className={headLabel}>{str(d.title) || 'Results'}</span>
        <span className="font-mono text-[9px] text-muted-foreground">{rows.length}{d.count ? ` of ${num(d.count)}` : ''}</span>
      </div>
      <div className="p-2 max-h-64 overflow-y-auto scrollbar-hidden divide-y divide-outline-variant/60">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2 px-1.5 py-2 text-xs">
            <div className="min-w-0">
              <p className="text-foreground font-medium truncate">{r.primary}</p>
              {r.secondary && <p className="text-[10px] text-muted-foreground truncate">{r.secondary}</p>}
            </div>
            {r.meta && <span className="tabular-nums text-muted-foreground shrink-0">{r.meta}</span>}
          </div>
        ))}
      </div>
      {destructive && (
        <div className={footer}>
          <p className="mr-auto flex items-center gap-1.5 text-[10px] text-warning-text">
            <AlertTriangle className="size-3.5" /> {num(d.count)} customers ko bhejega.
          </p>
          <button onClick={() => actions.onConfirm(msg.id)} disabled={confirmed} className={confirmBtn}>
            {confirmed ? <Check className="size-3.5" /> : <Users className="size-3.5" />}
            {confirmed ? 'Sent' : `Confirm all ${num(d.count)}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── confirmation (comms draft → Send) ────────────────────────────────────────
function DraftCard({ msg, actions }: CardProps) {
  const d = msg.cardData ?? {};
  const [copied, setCopied] = useState(false);
  const confirmed = isConfirmed(d);
  return (
    <div className={shell}>
      <div className={header}>
        <span className={headLabel}>{str(d.channel) || 'WhatsApp'} Draft — {str(d.recipientName)}</span>
        <span className="font-mono text-[9px] text-muted-foreground">{str(d.phoneNumber)}</span>
      </div>
      <div className="p-3">
        <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{str(d.message)}</p>
      </div>
      <div className={footer}>
        <button
          onClick={() => { navigator.clipboard?.writeText(str(d.message)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg border border-outline-variant text-xs font-medium text-foreground hover:bg-muted transition-colors"
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={() => actions.onSend(msg.id)} disabled={confirmed} className={confirmBtn.replace('h-8', 'h-7')}>
          {confirmed ? <Check className="size-3.5" /> : <Send className="size-3.5" />}
          {confirmed ? 'Sent' : 'Send to Outreach'}
        </button>
      </div>
    </div>
  );
}

// ── invoice (pending → Confirm; or committed) ────────────────────────────────
function InvoiceCard({ msg, actions }: CardProps) {
  const d = msg.cardData ?? {};
  const pending = Boolean(d.pending) && msg.status === 'pending';
  const confirmed = isConfirmed(d);
  const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
  const total = num(d.total);
  return (
    <div className={shell}>
      <div className={header}>
        <span className={headLabel}>{d.invoice_id ? `Invoice ${str(d.invoice_id)}` : 'Invoice Draft'}</span>
        {d.invoice_id ? <span className="font-mono text-[9px] text-success font-bold">Generated</span> : null}
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-xs font-semibold text-foreground">{str(d.customer_name)}</p>
        {items.map((it, i) => (
          <div key={i} className="flex justify-between text-xs text-muted-foreground">
            <span>{str(it.name)} <span className="text-foreground/50">x {num(it.qty)}</span></span>
            <span className="tabular-nums">Rs {num(it.total).toLocaleString()}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 mt-1 border-t border-outline-variant text-sm font-bold text-foreground">
          <span>Total</span><span className="tabular-nums">Rs {total.toLocaleString()}</span>
        </div>
      </div>
      {pending && (
        <div className={footer}>
          <button onClick={() => actions.onConfirm(msg.id)} disabled={confirmed} className={confirmBtn}>
            {confirmed ? <Check className="size-3.5" /> : <Send className="size-3.5" />}
            {confirmed ? 'Created' : 'Confirm Bill'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── sale_confirmation (also payment / stock-in confirm) ──────────────────────
function ConfirmCard({ msg, actions }: CardProps) {
  const d = msg.cardData ?? {};
  const confirmed = isConfirmed(d);
  const unit = Boolean(d.unit_mode);
  const paymentType = str(d.payment_type) || 'Paid';
  const fmt = (v: unknown) => (unit ? `${num(v)} units` : `Rs ${num(v).toLocaleString()}`);
  const Icon = paymentType === 'Stock In' ? Package : ShoppingCart;
  const rows: [string, string][] = unit
    ? [
        ['Item', str(d.customer_name)],
        ['Add Qty', fmt(d.amount)],
        ['Type', paymentType],
        ['After', fmt(d.balance_after)],
      ]
    : [
        ['Customer', str(d.customer_name)],
        ['Amount', fmt(d.amount)],
      ];
  return (
    <div className={shell}>
      <div className={header}>
        <span className={headLabel}>{paymentType === 'Stock In' ? 'Stock In' : 'Sale'} Confirmation</span>
        <span className={`font-mono text-[9px] font-bold ${confirmed ? 'text-success' : 'text-warning'}`}>
          {confirmed ? 'Recorded' : 'Needs confirm'}
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
      <div className={footer}>
        <button onClick={() => actions.onConfirm(msg.id)} disabled={confirmed} className={confirmBtn}>
          {confirmed ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
          {confirmed ? 'Recorded' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}

// ── customer_confirmation (add or update) ────────────────────────────────────
function CustomerCard({ msg, actions }: CardProps) {
  const d = msg.cardData ?? {};
  const confirmed = isConfirmed(d);
  const update = d.mode === 'update';
  const rows: [string, string][] = update
    ? (Array.isArray(d.changes) ? (d.changes as [string, string][]) : [])
    : [
        ['Name', str(d.name)],
        ['Area', str(d.area) || '—'],
        ['Type', str(d.type) || 'Household'],
        ['Phone', str(d.phone) || '—'],
      ];
  const dupe = str(d.duplicate);
  return (
    <div className={shell}>
      <div className={header}>
        <span className={headLabel}>{update ? `Update — ${str(d.name)}` : 'New Customer'}</span>
        <span className={`font-mono text-[9px] font-bold ${confirmed ? 'text-success' : 'text-warning'}`}>
          {confirmed ? 'Saved' : 'Needs confirm'}
        </span>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-outline-variant bg-surface-container-low p-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="text-xs font-bold text-foreground mt-1 truncate">{value}</p>
          </div>
        ))}
      </div>
      {dupe && !confirmed && (
        <div className="mx-3 mb-1 flex items-center gap-1.5 rounded-md bg-warning-light px-2.5 py-1.5 text-[10px] font-medium text-warning-text">
          <AlertTriangle className="size-3.5 shrink-0" /> Possible duplicate of “{dupe}”. Add anyway?
        </div>
      )}
      <div className={footer}>
        <button onClick={() => actions.onConfirm(msg.id)} disabled={confirmed} className={confirmBtn}>
          {confirmed ? <Check className="size-3.5" /> : <UserPlus className="size-3.5" />}
          {confirmed ? 'Saved' : update ? 'Confirm Update' : 'Confirm & Add'}
        </button>
      </div>
    </div>
  );
}

// ── disambiguation (pick a candidate) ────────────────────────────────────────
function DisambiguationCard({ msg, actions }: CardProps) {
  const d = msg.cardData ?? {};
  const resolved = isConfirmed(d);
  const candidates = Array.isArray(d.candidates)
    ? (d.candidates as { id: string; name: string; meta?: string }[])
    : [];
  return (
    <div className={shell}>
      <div className={header}><span className={headLabel}>Kaunsa “{str(d.query)}”?</span></div>
      <div className="p-2 space-y-1.5">
        {candidates.map((c) => (
          <button
            key={c.id}
            disabled={resolved}
            onClick={() => actions.onPick(msg.id, { id: c.id, name: c.name })}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-outline-variant bg-card text-xs hover:bg-muted hover:border-foreground/30 transition-colors disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="text-foreground font-medium block truncate">{c.name}</span>
              {c.meta && <span className="text-[10px] text-muted-foreground">{c.meta}</span>}
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── next_steps (data-derived suggested actions) ──────────────────────────────
function NextStepsCard({ msg, actions }: CardProps) {
  const d = msg.cardData ?? {};
  const steps = Array.isArray(d.steps) ? (d.steps as Step[]) : [];
  if (!steps.length) return null;
  return (
    <div className={shell}>
      <div className={header}>
        <span className={headLabel}>
          <Lightbulb className="inline size-3 mr-1 -mt-0.5" />{str(d.title) || 'Suggested Next Steps'}
        </span>
      </div>
      <div className="p-2 space-y-1.5">
        {steps.map((s, i) => <StepButton key={i} s={s} onPrompt={actions.onPrompt} />)}
      </div>
    </div>
  );
}

// ── insight (360° analytical answer) ─────────────────────────────────────────
type Step = { label: string; prompt: string; reason?: string; tone?: string };
const stepColor = (tone?: string) =>
  tone === 'urgent' ? 'text-danger' : tone === 'opportunity' ? 'text-success' : 'text-warning';

function StepButton({ s, onPrompt }: { s: Step; onPrompt: (p: string) => void }) {
  const iconClass = `size-3.5 shrink-0 ${stepColor(s.tone)}`;
  return (
    <button
      onClick={() => onPrompt(s.prompt)}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-outline-variant bg-card text-left hover:bg-muted hover:border-foreground/30 transition-colors group"
    >
      {s.tone === 'urgent' ? (
        <AlertCircle className={iconClass} />
      ) : s.tone === 'opportunity' ? (
        <Sparkles className={iconClass} />
      ) : (
        <Lightbulb className={iconClass} />
      )}
      <span className="min-w-0 flex-1">
        <span className="text-xs text-foreground font-medium block truncate">{s.label}</span>
        {s.reason && <span className="text-[10px] text-muted-foreground block truncate">{s.reason}</span>}
      </span>
      <ChevronRight className="size-3.5 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

function InsightCard({ msg, actions }: CardProps) {
  const d = msg.cardData ?? {};
  const stats = Array.isArray(d.stats) ? (d.stats as { label: string; value: unknown }[]) : [];
  const context = Array.isArray(d.context) ? (d.context as string[]) : [];
  const risks = Array.isArray(d.risks) ? (d.risks as string[]) : [];
  const missing = Array.isArray(d.missing) ? (d.missing as string[]) : [];
  const steps = Array.isArray(d.steps) ? (d.steps as Step[]) : [];
  return (
    <div className={shell}>
      <div className={header}>
        <span className={headLabel}>
          <Sparkles className="inline size-3 mr-1 -mt-0.5" />{str(d.title) || 'Insight'}
        </span>
      </div>

      {stats.length > 0 && (
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 border-b border-outline-variant">
          {stats.map((s, i) => (
            <div key={i} className="rounded-lg border border-outline-variant bg-surface-container-low p-2.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
              <p className="text-xs font-bold text-foreground mt-1 tabular-nums">{str(s.value)}</p>
            </div>
          ))}
        </div>
      )}

      {context.length > 0 && (
        <ul className="p-3 space-y-1 border-b border-outline-variant">
          {context.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px] text-foreground/90">
              <span className="mt-1 size-1 rounded-full bg-muted-foreground shrink-0" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}

      {risks.map((r, i) => (
        <div key={i} className="mx-3 mt-2 flex items-center gap-1.5 rounded-md bg-warning-light px-2.5 py-1.5 text-[10px] font-medium text-warning-text">
          <AlertTriangle className="size-3.5 shrink-0" /> {r}
        </div>
      ))}

      {missing.map((m, i) => (
        <div key={i} className="mx-3 mt-2 flex items-center gap-1.5 rounded-md bg-surface-container-low border border-outline-variant px-2.5 py-1.5 text-[10px] text-muted-foreground">
          <AlertCircle className="size-3.5 shrink-0" /> {m}
        </div>
      ))}

      {steps.length > 0 && (
        <div className="p-2 pt-2.5 space-y-1.5">
          {steps.map((s, i) => <StepButton key={i} s={s} onPrompt={actions.onPrompt} />)}
        </div>
      )}
    </div>
  );
}

// ── navigate ──────────────────────────────────────────────────────────────────
type VisualPoint = { label: string; value: number; meta?: string; tone?: string };

function VisualizationCard({ msg, actions }: CardProps) {
  const d = msg.cardData ?? {};
  const points = Array.isArray(d.points)
    ? (d.points as VisualPoint[]).filter((p) => Number.isFinite(Number(p.value)))
    : [];
  const stats = Array.isArray(d.stats) ? (d.stats as { label: string; value: unknown }[]) : [];
  const explanation = Array.isArray(d.explanation) ? (d.explanation as string[]) : [];
  const steps = Array.isArray(d.steps) ? (d.steps as Step[]) : [];
  const max = Math.max(1, ...points.map((p) => Number(p.value)));

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-outline-variant bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.16),transparent_34%),linear-gradient(135deg,var(--surface-container-lowest),var(--surface-container-low))] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/80 px-3 py-2.5">
        <span className={headLabel}>
          <BarChart3 className="inline size-3 mr-1 -mt-0.5 text-primary" />{str(d.title) || 'Visualization'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-primary">
          <TrendingUp className="size-3" /> Live data
        </span>
      </div>

      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-2 border-b border-outline-variant/80 p-3 sm:grid-cols-3">
          {stats.map((s, i) => (
            <div key={i} className="rounded-xl border border-outline-variant/80 bg-white/55 p-2.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-xs font-bold tabular-nums text-foreground">{str(s.value)}</p>
            </div>
          ))}
        </div>
      )}

      {points.length > 0 ? (
        <div className="space-y-2.5 p-3">
          {points.map((p, i) => {
            const width = Math.max(6, Math.round((Number(p.value) / max) * 100));
            return (
              <div key={`${p.label}-${i}`} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate font-medium text-foreground">{p.label}</span>
                  <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{p.meta ?? p.value.toLocaleString()}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-container-high">
                  <div
                    className={`h-full rounded-full ${p.tone === 'urgent' ? 'bg-danger' : p.tone === 'opportunity' ? 'bg-success' : 'bg-primary'}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3 text-xs text-muted-foreground">Visualization ke liye abhi data available nahi.</div>
      )}

      {explanation.length > 0 && (
        <div className="border-t border-outline-variant/80 p-3">
          <p className="mb-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Explanation</p>
          <ul className="space-y-1">
            {explanation.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground/90">
                <span className="mt-1.5 size-1 rounded-full bg-primary/70 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {steps.length > 0 && (
        <div className="border-t border-outline-variant/80 p-2 space-y-1.5">
          {steps.map((s, i) => <StepButton key={i} s={s} onPrompt={actions.onPrompt} />)}
        </div>
      )}
    </div>
  );
}

function NavigateCard({ msg }: CardProps) {
  const d = msg.cardData ?? {};
  return (
    <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-foreground">
      <ArrowRight className="size-3.5 text-muted-foreground" />
      <span className="font-medium">Opened {str(d.label)}</span>
    </div>
  );
}

// ── registry ──────────────────────────────────────────────────────────────────
const CARDS: Record<string, (p: CardProps) => ReactNode> = {
  metric: MetricCard,
  list: ListCard,
  confirmation: DraftCard,
  invoice: InvoiceCard,
  sale_confirmation: ConfirmCard,
  customer_confirmation: CustomerCard,
  disambiguation: DisambiguationCard,
  next_steps: NextStepsCard,
  insight: InsightCard,
  visualization: VisualizationCard,
  navigate: NavigateCard,
};

export function CardRenderer({ msg, actions }: CardProps) {
  if (!msg.cardType) return null;
  const Card = CARDS[msg.cardType];
  return Card ? <Card msg={msg} actions={actions} /> : null;
}
