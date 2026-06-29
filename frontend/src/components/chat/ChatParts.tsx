'use client';

import { Bot, ArrowRight } from 'lucide-react';
import type { AlaraChatMessage } from '@/lib/alara/types';
import { CardRenderer, type CardActions } from './CardRenderer';
import { PixelMarketHero } from './PixelMarketHero';

export function AlaraAvatar() {
  return (
    <span className="size-7 rounded-md bg-foreground flex items-center justify-center shrink-0">
      <Bot className="size-4 text-background" />
    </span>
  );
}

export function UserBubble({ text }: { text: string }) {
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

export function AssistantBubble({ msg, actions }: { msg: AlaraChatMessage; actions: CardActions }) {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="mt-0.5"><AlaraAvatar /></div>
      <div className="flex-1 min-w-0 bg-card border border-outline-variant rounded-lg px-4 py-3 shadow-card">
        {msg.text && <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
        <CardRenderer msg={msg} actions={actions} />
      </div>
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="mt-0.5"><AlaraAvatar /></div>
      <div className="bg-card border border-outline-variant rounded-lg px-4 py-3.5 shadow-card">
        <div className="flex items-center gap-1">
          {[0, 150, 300].map((d) => (
            <span key={d} className="size-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

const SUGGESTED = [
  'Riaz Ahmed last time kab aaya tha?',
  'Sab se zyada business kis ka hai?',
  'Konsi customers pichle 10 din mein nahi aayin?',
  'Credit limit se upar walon ko reminder bhejo',
];

export function EmptyState({ onPrompt }: { onPrompt: (p: string) => void }) {
  return (
    <div className="w-full">
      {/* Full-width hero connected to top border */}
      <PixelMarketHero />

      {/* Normal centred content below */}
      <div className="w-full max-w-2xl mx-auto px-4 pt-8 text-center">
        <p className="text-sm text-muted-foreground mb-8">
          Pura app chalayein — sale/payment likhein, customers add/edit karein, invoices banayein, reminders bhejein, ya koi bhi page kholne ko kahein.
        </p>

        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {SUGGESTED.map((p) => (
            <button
              key={p}
              onClick={() => onPrompt(p)}
              className="group p-4 text-left border border-outline-variant/60 rounded-xl bg-card shadow-sm hover:shadow-md hover:border-foreground/20 transition-all flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="text-xs font-medium text-foreground/95 leading-relaxed min-w-0">{p}</span>
              <ArrowRight className="size-3.5 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
