'use client';

import { Plus, MessageSquare, Sparkles } from 'lucide-react';
import type { ChatThread } from '@/lib/alara/types';

// Manual 12-hour formatter — avoids toLocaleTimeString, whose resolved locale
// (and thus "05:00" vs "05:00 AM") can differ between server and client and
// trigger a hydration mismatch.
function formatTime(ts: number): string {
  const d = new Date(ts);
  const h24 = d.getHours();
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${h12}:${mm} ${period}`;
}

export function HistorySidebar({
  threads,
  activeChatId,
  onNew,
  onSelect,
}: {
  threads: ChatThread[];
  activeChatId: string;
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="hidden md:flex w-[250px] shrink-0 flex-col border-r border-outline-variant bg-card">
      <div className="p-4 border-b border-outline-variant flex items-center justify-between">
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-foreground">Chat History</span>
        <button
          onClick={onNew}
          title="New chat"
          className="p-1 border border-outline-variant rounded-sm bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hidden p-3 space-y-1.5">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="size-6 text-muted-foreground/30 mb-2" />
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">No past chats</p>
          </div>
        ) : (
          threads
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((thread) => {
              const isActive = thread.id === activeChatId;
              return (
                <button
                  key={thread.id}
                  onClick={() => onSelect(thread.id)}
                  className={`w-full text-left p-3 rounded-sm border text-xs flex flex-col gap-1.5 transition-colors ${
                    isActive
                      ? 'border-foreground bg-muted/40 text-foreground'
                      : 'border-outline-variant bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <p className="font-semibold truncate text-foreground/90">{thread.title}</p>
                  <div className="flex items-center justify-between font-mono text-[9px] text-muted-foreground mt-0.5">
                    <span>{formatTime(thread.updatedAt)}</span>
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
          <span>Agentic — tools + guardrails</span>
        </div>
      </div>
    </div>
  );
}
