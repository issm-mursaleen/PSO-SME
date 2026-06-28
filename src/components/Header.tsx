'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Bell, Settings, Plus, Calendar, User } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export const Header: React.FC = () => {
  const router = useRouter();
  const { notifications } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [todayStr, setTodayStr] = useState<string | null>(null);

  useEffect(() => {
    setTodayStr(
      new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    );
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/customers?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header className="fixed top-0 right-0 left-[208px] z-40 h-[52px] flex items-center gap-4 px-5 bg-card border-b border-outline-variant">
      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers, sales, or invoices..."
            className="w-full h-8 pl-9 pr-3 bg-muted/60 border border-outline-variant rounded-sm text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/40 focus:bg-card transition-all"
          />
        </div>
      </form>

      {/* Right actions */}
      <div className="flex items-center gap-1.5 ml-auto">
        <Link
          href="/record-sale"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all"
        >
          <Plus className="size-3.5" />
          Record Sale
        </Link>

        <button className="hidden md:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-outline-variant bg-card text-muted-foreground text-xs font-medium hover:bg-muted transition-colors">
          <Calendar className="size-3.5" />
          {todayStr ?? ' '}
        </button>

        <div className="w-px h-5 bg-outline-variant mx-1" />

        <Link
          href="/notifications"
          className="relative w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {notifications.length > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center min-w-3.5 h-3.5 px-0.5 rounded-full bg-danger text-[8px] font-bold text-white ring-1 ring-card">
              {notifications.length}
            </span>
          )}
        </Link>

        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Settings className="size-4" />
        </button>

        <div className="w-px h-5 bg-outline-variant mx-1" />

        <button
          type="button"
          aria-label="Account menu"
          title="Account"
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted transition-colors"
        >
          <span className="size-7 rounded-full bg-foreground flex items-center justify-center shrink-0">
            <User className="size-3.5 text-background" />
          </span>
        </button>
      </div>
    </header>
  );
};
