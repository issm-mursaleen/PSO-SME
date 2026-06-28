'use client';

import { useEffect, useState } from 'react';
import { Plus, MessageSquare, Sparkles, MoreVertical, Trash2 } from 'lucide-react';
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
  onDelete,
}: {
  threads: ChatThread[];
  activeChatId: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = () => setOpenMenuId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

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
              const isMenuOpen = openMenuId === thread.id;
              return (
                <div
                  key={thread.id}
                  onClick={() => onSelect(thread.id)}
                  className={`group/thread relative w-full text-left p-3 rounded-sm border text-xs flex flex-col gap-1.5 transition-colors cursor-pointer select-none ${
                    isActive
                      ? 'border-foreground bg-muted/40 text-foreground'
                      : 'border-outline-variant bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 pr-6">
                    <p className="font-semibold truncate text-foreground/90">{thread.title}</p>
                  </div>

                  {/* Options Menu */}
                  <div className="absolute top-2.5 right-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(isMenuOpen ? null : thread.id);
                      }}
                      className={`p-1 rounded-sm hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground transition-all ${
                        isMenuOpen ? 'opacity-100 bg-muted-foreground/10' : 'opacity-0 group-hover/thread:opacity-100 focus-within:opacity-100'
                      }`}
                      title="Chat options"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>

                    {isMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 mt-1 w-28 bg-card border border-outline-variant rounded shadow-lg z-10 py-1 animate-fade-in"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(thread.id);
                            setOpenMenuId(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 text-[11px] text-danger hover:bg-danger/10 flex items-center gap-1.5 font-medium transition-colors"
                        >
                          <Trash2 className="size-3" />
                          Delete Chat
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between font-mono text-[9px] text-muted-foreground mt-0.5">
                    <span>{formatTime(thread.updatedAt)}</span>
                    <span className="bg-muted px-1.5 py-0.5 rounded-sm border border-outline-variant/40 text-foreground font-bold">
                      {thread.messages.length} msg{thread.messages.length !== 1 && 's'}
                    </span>
                  </div>
                </div>
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
