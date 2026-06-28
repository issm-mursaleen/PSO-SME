'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Coins } from 'lucide-react';
import { useAlaraChat } from '@/lib/alara/useAlaraChat';
import { HistorySidebar } from '@/components/chat/HistorySidebar';
import { ChatInput } from '@/components/chat/ChatInput';
import { UsagePanel } from '@/components/chat/UsagePanel';
import {
  UserBubble, AssistantBubble, TypingBubble, EmptyState,
} from '@/components/chat/ChatParts';
import type { CardActions } from '@/components/chat/CardRenderer';

function ChatWorkspace() {
  const {
    chatMessages, chatThreads, activeChatId, isTyping,
    sendMessage, confirmCard, sendDraftCard, pickCandidate,
    startNewChat, selectChatThread,
  } = useAlaraChat();

  const searchParams = useSearchParams();
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);
  const [tab, setTab] = useState<'chat' | 'usage'>('chat');

  const hasMessages = chatMessages.length > 0;

  const actions: CardActions = {
    onConfirm: confirmCard,
    onSend: sendDraftCard,
    onPick: pickCandidate,
    onPrompt: sendMessage,
  };

  // Auto-send ?query= once (e.g. from dashboard "Remind" actions).
  useEffect(() => {
    const q = searchParams.get('query');
    if (q && !sentInitial.current) {
      sentInitial.current = true;
      sendMessage(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  return (
    <div className="flex h-[calc(100vh-52px)] overflow-hidden bg-background">
      <HistorySidebar
        threads={chatThreads}
        activeChatId={activeChatId}
        onNew={startNewChat}
        onSelect={selectChatThread}
      />

      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Workspace tabs */}
        <div className="flex items-center gap-1 border-b border-outline-variant px-4 h-11 shrink-0 bg-card/40">
          {([['chat', 'Chat', MessageSquare], ['usage', 'Usage', Coins]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                tab === key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === 'usage' ? (
          <UsagePanel />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto scrollbar-hidden pt-0 pb-36">
              {!hasMessages && !isTyping ? (
                <EmptyState onPrompt={sendMessage} />
              ) : (
                <div className="w-full max-w-3xl mx-auto space-y-4 px-6 pt-8">
                  {chatMessages.map((m) =>
                    m.sender === 'user' ? (
                      <UserBubble key={m.id} text={m.text} />
                    ) : (
                      <AssistantBubble key={m.id} msg={m} actions={actions} />
                    ),
                  )}
                  {isTyping && <TypingBubble />}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <ChatInput onSend={sendMessage} />
          </>
        )}
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
