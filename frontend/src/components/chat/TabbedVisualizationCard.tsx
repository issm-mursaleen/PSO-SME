'use client';

// TabbedVisualizationCard — renders 2+ show_visualization results from one
// multi-intent message ("sales trend aur top 3 customers dikhao") as ONE
// card with tabs, instead of several separate chat bubbles. Built by
// useAlaraChat's applyPlan (see the tab-merge logic there); each tab's
// cardData is the exact same shape a single VisualizationCard would get, so
// the chart rendering itself (VisualizationBody) is never duplicated.

import { useState } from 'react';
import {
  BarChart3, TrendingUp, Truck, Users, Package, PieChart, AlertTriangle, Target,
  ChevronDown, AlertCircle,
} from 'lucide-react';
import type { AlaraChatMessage } from '@/lib/alara/types';
import { VisualizationBody } from './VisualizationCard';

const ICONS: Record<string, typeof BarChart3> = {
  TrendingUp, Truck, Users, Package, PieChart, AlertTriangle, Target, BarChart3,
};

interface VizTab {
  id: string;
  label: string;
  icon?: string;
  badge?: string;
  status: 'success' | 'error';
  cardData: Record<string, unknown>;
  error?: string;
}

const str = (v: unknown) => String(v ?? '');

interface TabbedVisualizationCardProps {
  msg: AlaraChatMessage;
  actions: { onPrompt: (prompt: string) => void };
}

export function TabbedVisualizationCard({ msg, actions }: TabbedVisualizationCardProps) {
  const d = msg.cardData ?? {};
  const tabs = Array.isArray(d.tabs) ? (d.tabs as VizTab[]) : [];
  const combinedSummary = d.combinedSummary as { headline: string; facts: string[] } | undefined;
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id);
  const [moreOpen, setMoreOpen] = useState(false);

  if (tabs.length === 0) return null;
  const visible = tabs.slice(0, 4);
  const overflow = tabs.slice(4);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-outline-variant bg-card shadow-sm">
      <div className="border-b border-outline-variant bg-surface-container-lowest px-3 py-2.5">
        <span className="font-mono text-[10px] font-bold uppercase text-foreground">{str(d.title) || 'Business performance'}</span>
        {str(d.subtitle) && <p className="mt-0.5 text-[10px] text-muted-foreground">{str(d.subtitle)}</p>}
      </div>

      {combinedSummary && (
        <div className="border-b border-outline-variant bg-card p-3">
          <p className="text-[11px] leading-relaxed text-foreground/90">{combinedSummary.headline}</p>
        </div>
      )}

      <div className="flex items-center gap-1 overflow-x-auto border-b border-outline-variant bg-surface-container-lowest px-2 py-1.5 scrollbar-hidden">
        {visible.map((tab) => {
          const TabIcon = ICONS[tab.icon ?? ''] ?? BarChart3;
          const isActive = tab.id === activeTab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTabId(tab.id);
                setMoreOpen(false);
              }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/60'
              }`}
            >
              {tab.status === 'error' ? <AlertCircle className="size-3.5 text-danger" /> : <TabIcon className="size-3.5" />}
              {tab.label}
              {tab.badge && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{tab.badge}</span>
              )}
            </button>
          );
        })}
        {overflow.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-card/60"
            >
              More <ChevronDown className="size-3" />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded-lg border border-outline-variant bg-card p-1 shadow-md">
                {overflow.map((tab) => {
                  const TabIcon = ICONS[tab.icon ?? ''] ?? BarChart3;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTabId(tab.id);
                        setMoreOpen(false);
                      }}
                      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] text-foreground hover:bg-muted"
                    >
                      {tab.status === 'error' ? <AlertCircle className="size-3.5 text-danger" /> : <TabIcon className="size-3.5" />}
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {activeTab.status === 'error' ? (
        <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
          <AlertCircle className="size-4 shrink-0 text-danger" />
          <span>{activeTab.error || 'Yeh view load nahi ho saka.'}</span>
        </div>
      ) : (
        <VisualizationBody cardData={activeTab.cardData} onPrompt={actions.onPrompt} />
      )}
    </div>
  );
}
