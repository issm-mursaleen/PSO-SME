'use client';

// CardRenderer — a registry keyed by cardType, replacing the old 250-line
// conditional inside the chat page. Each card is a small focused component;
// add a new card by writing one and registering it in CARDS below.

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Send, Copy, Check, ShoppingCart, UserPlus, AlertTriangle, ArrowRight, Package, Users,
  Lightbulb, AlertCircle, Sparkles, ChevronRight, BarChart3, TrendingUp, LineChart, PieChart, Target,
  Download, FileSpreadsheet, Eye,
} from 'lucide-react';
import type { AlaraChatMessage, CardData } from '@/lib/alara/types';
import type { BillableDoc } from '@/lib/invoiceDocument';
import { downloadDocFile } from '@/lib/invoiceDocument';
import { VisualizationCard as BetterVisualizationCard } from './VisualizationCard';
import { TabbedVisualizationCard } from './TabbedVisualizationCard';

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
  const details: [string, string][] = [];
  if (d.subtotal != null) details.push(['Subtotal', `Rs ${num(d.subtotal).toLocaleString()}`]);
  if (d.discount != null) details.push(['Discount', `Rs ${num(d.discount).toLocaleString()}`]);
  if (d.tax != null) details.push(['Tax', `Rs ${num(d.tax).toLocaleString()}`]);
  if (d.deliveryCharges != null) details.push(['Delivery', `Rs ${num(d.deliveryCharges).toLocaleString()}`]);
  if (d.paidAmount != null) details.push(['Paid', `Rs ${num(d.paidAmount).toLocaleString()}`]);
  if (d.balance != null) details.push(['Balance', `Rs ${num(d.balance).toLocaleString()}`]);
  if (d.dueDate) details.push(['Due Date', str(d.dueDate)]);
  const sourceIds = Array.isArray(d.sourceInvoiceIds) ? (d.sourceInvoiceIds as unknown[]).map(String) : [];
  if (sourceIds.length) details.push(['Source', sourceIds.join(', ')]);
  return (
    <div className={shell}>
      <div className={header}>
        <span className={headLabel}>{d.invoice_id ? `Invoice ${str(d.invoice_id)}` : str(d.invoice_label) || 'Invoice Draft'}</span>
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
        {details.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 pt-2">
            {details.map(([label, value]) => (
              <div key={label} className="rounded-md bg-surface-container-low px-2 py-1.5">
                <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="mt-0.5 truncate text-[10px] font-semibold text-foreground tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        )}
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
      {!pending && Boolean(d.invoice_id) && Boolean(d.document) && (
        <div className={footer}>
          <Link
            href={`/invoices?preview=${encodeURIComponent(str(d.invoice_id))}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-outline-variant text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Eye className="size-3.5" />
            View in Invoices
          </Link>
          <button
            onClick={() => downloadDocFile(d.document as BillableDoc)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all"
          >
            <Download className="size-3.5" />
            Download
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

// ── visualization (kpi / bar / line / donut / progress) ──────────────────────
type VisualPoint = { label: string; value: number; target?: number; meta?: string; tone?: string };

const toneClass = (tone?: string) =>
  tone === 'urgent' ? 'bg-danger' : tone === 'opportunity' ? 'bg-success' : 'bg-primary';
const DONUT_PALETTE = [
  'var(--color-primary)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-info)',
  'var(--color-danger)',
  'var(--color-secondary)',
];

const CHART_META: Record<string, { icon: typeof BarChart3; label: string }> = {
  kpi: { icon: BarChart3, label: 'Live data' },
  bar: { icon: BarChart3, label: 'Live data' },
  line: { icon: LineChart, label: 'Live trend' },
  donut: { icon: PieChart, label: 'Live split' },
  progress: { icon: Target, label: 'Live progress' },
};

function BarPoints({ points }: { points: VisualPoint[] }) {
  const max = Math.max(1, ...points.map((p) => Number(p.value)));
  return (
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
              <div className={`h-full rounded-full ${toneClass(p.tone)}`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProgressPoints({ points }: { points: VisualPoint[] }) {
  return (
    <div className="space-y-2.5 p-3">
      {points.map((p, i) => {
        const target = Math.max(1, Number(p.target ?? p.value) || 1);
        const pct = Math.max(2, Math.min(100, Math.round((Number(p.value) / target) * 100)));
        return (
          <div key={`${p.label}-${i}`} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate font-medium text-foreground">{p.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{p.meta ?? `${p.value}/${target}`}</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-container-high">
              <div className={`h-full rounded-full ${toneClass(p.tone)}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LinePoints({ points }: { points: VisualPoint[] }) {
  const max = Math.max(1, ...points.map((p) => Number(p.value)));
  const min = Math.min(0, ...points.map((p) => Number(p.value)));
  const range = Math.max(1, max - min);
  const n = points.length;
  const coords = points.map((p, i) => ({
    x: n > 1 ? (i / (n - 1)) * 100 : 50,
    y: 36 - ((Number(p.value) - min) / range) * 32,
  }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  return (
    <div className="p-3">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-28 w-full">
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="1.6" fill="var(--color-primary)" />
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between gap-1">
        {points.map((p, i) => (
          <div key={`${p.label}-${i}`} className="min-w-0 flex-1 text-center">
            <p className="truncate text-[9px] font-medium text-muted-foreground">{p.label}</p>
            <p className="truncate font-mono text-[10px] font-bold text-foreground">{p.meta ?? p.value.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutPoints({ points }: { points: VisualPoint[] }) {
  const total = Math.max(1, points.reduce((s, p) => s + Number(p.value), 0));
  const r = 15.9155; // circumference ≈ 100, so each % = 1 unit of stroke-dasharray
  const pcts = points.map((p) => (Number(p.value) / total) * 100);
  const segments = points.map((p, i) => {
    const pct = pcts[i];
    const before = pcts.slice(0, i).reduce((s, v) => s + v, 0);
    return {
      ...p,
      pct,
      dashArray: `${pct} ${100 - pct}`,
      dashOffset: 25 - before, // start at 12 o'clock, go clockwise
      color: DONUT_PALETTE[i % DONUT_PALETTE.length],
    };
  });
  return (
    <div className="flex items-center gap-4 p-3">
      <svg viewBox="0 0 40 40" className="size-24 shrink-0 -rotate-90">
        {segments.map((s, i) => (
          <circle
            key={i}
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="7"
            strokeDasharray={s.dashArray}
            strokeDashoffset={s.dashOffset}
          />
        ))}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate font-medium text-foreground">{s.label}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
              {s.meta ?? `${Math.round(s.pct)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function VisualizationCard({ msg, actions }: CardProps) {
  const d = msg.cardData ?? {};
  const points = Array.isArray(d.points)
    ? (d.points as VisualPoint[]).filter((p) => Number.isFinite(Number(p.value)))
    : [];
  const stats = Array.isArray(d.stats) ? (d.stats as { label: string; value: unknown }[]) : [];
  const explanation = Array.isArray(d.explanation) ? (d.explanation as string[]) : [];
  const steps = Array.isArray(d.steps) ? (d.steps as Step[]) : [];
  const chartType = str(d.chartType) || 'bar';
  const meta = CHART_META[chartType] ?? CHART_META.bar;
  const HeaderIcon = meta.icon;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-outline-variant bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.16),transparent_34%),linear-gradient(135deg,var(--surface-container-lowest),var(--surface-container-low))] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/80 px-3 py-2.5">
        <span className={headLabel}>
          <HeaderIcon className="inline size-3 mr-1 -mt-0.5 text-primary" />{str(d.title) || 'Visualization'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-primary">
          <TrendingUp className="size-3" /> {meta.label}
        </span>
      </div>

      {stats.length > 0 && (
        <div className={`grid gap-2 border-b border-outline-variant/80 p-3 ${chartType === 'kpi' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {stats.map((s, i) => (
            <div key={i} className="rounded-xl border border-outline-variant/80 bg-white/55 p-2.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
              <p className={`mt-1 font-bold tabular-nums text-foreground ${chartType === 'kpi' ? 'text-lg' : 'text-xs'}`}>{str(s.value)}</p>
            </div>
          ))}
        </div>
      )}

      {chartType !== 'kpi' && (
        points.length > 0 ? (
          chartType === 'line' ? (
            <LinePoints points={points} />
          ) : chartType === 'donut' ? (
            <DonutPoints points={points} />
          ) : chartType === 'progress' ? (
            <ProgressPoints points={points} />
          ) : (
            <BarPoints points={points} />
          )
        ) : (
          <div className="p-3 text-xs text-muted-foreground">Visualization ke liye abhi data available nahi.</div>
        )
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
function CsvExportCard({ msg }: CardProps) {
  const d = msg.cardData ?? {};
  const columns = Array.isArray(d.columns) ? (d.columns as string[]) : [];
  const filters = Array.isArray(d.filters) ? (d.filters as string[]) : [];
  const previewRows = Array.isArray(d.previewRows) ? (d.previewRows as Record<string, unknown>[]) : [];
  const csv = str(d.csv);
  const filename = str(d.filename) || 'supplier-export.csv';

  const download = () => {
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={shell}>
      <div className={header}>
        <span className={headLabel}>
          <FileSpreadsheet className="inline size-3 mr-1 -mt-0.5" />{str(d.title) || 'CSV Preview'}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">{num(d.count)} records</span>
      </div>
      <div className="space-y-2 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Columns</p>
            <p className="mt-1 text-[11px] text-foreground">{columns.join(', ') || 'No columns selected'}</p>
          </div>
          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Showing</p>
            <p className="mt-1 text-[11px] text-foreground">{filters.join(', ') || 'none'}</p>
          </div>
        </div>
        <div className="max-h-56 overflow-auto rounded-lg border border-outline-variant">
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-surface-container-low text-muted-foreground">
              <tr>
                {columns.slice(0, 6).map((col) => (
                  <th key={col} className="whitespace-nowrap px-2 py-1.5 font-mono text-[9px] uppercase tracking-widest">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/70">
              {previewRows.map((row, i) => (
                <tr key={i}>
                  {columns.slice(0, 6).map((col) => (
                    <td key={col} className="max-w-40 truncate px-2 py-1.5 text-foreground">
                      {str(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
              {previewRows.length === 0 && (
                <tr>
                  <td className="px-2 py-3 text-muted-foreground" colSpan={Math.max(1, columns.slice(0, 6).length)}>
                    Preview ke liye koi row nahi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className={footer}>
        <button onClick={download} disabled={!csv || columns.length === 0} className={confirmBtn}>
          <Download className="size-3.5" />
          Download CSV
        </button>
      </div>
    </div>
  );
}

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
  csv_export: CsvExportCard,
  visualization: BetterVisualizationCard,
  tabbed_visualization: TabbedVisualizationCard,
  navigate: NavigateCard,
};

export function CardRenderer({ msg, actions }: CardProps) {
  if (!msg.cardType) return null;
  const Card = CARDS[msg.cardType];
  return Card ? <Card msg={msg} actions={actions} /> : null;
}
