'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { Icon } from '@/components/ui/Icon';

export default function NotificationsList() {
  const router = useRouter();
  const { notifications } = useApp();

  const [activeUrgencyFilter, setActiveUrgencyFilter] = useState<'All' | 'HIGH' | 'MEDIUM' | 'LOW'>('All');

  // Filtered list
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeUrgencyFilter === 'All') return true;
      return n.urgency === activeUrgencyFilter;
    });
  }, [notifications, activeUrgencyFilter]);

  return (
    <div className="p-gutter space-y-6 max-w-[1200px] mx-auto w-full">
      
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight">Notifications Feed</h2>
        <p className="text-body-md text-on-surface-variant text-sm mt-1">
          Stay informed of inactive customers, re-engagement opportunities, new sales, and stock alerts.
        </p>
      </div>

      {/* Filter Options */}
      <div className="flex bg-surface-container p-1 rounded-lg w-full md:w-max select-none">
        {(['All', 'HIGH', 'MEDIUM', 'LOW'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveUrgencyFilter(filter)}
            className={`px-4 py-1.5 rounded-md font-label-md transition-all text-xs font-bold ${
              activeUrgencyFilter === filter
                ? 'bg-white shadow-sm text-primary'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {filter === 'All' ? 'All Alerts' : `${filter} Urgency`}
          </button>
        ))}
      </div>

      {/* Alert Feed Container */}
      <div className="space-y-4">
        {filteredNotifications.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-8 text-center text-on-surface-variant italic text-xs">
            No system notifications active for this category filter.
          </div>
        ) : (
          filteredNotifications.map((item) => (
            <div
              key={item.id}
              className={`bg-surface-container-lowest border rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-outline ${
                item.urgency === 'HIGH'
                  ? 'border-l-4 border-l-error border-outline-variant'
                  : item.urgency === 'MEDIUM'
                  ? 'border-l-4 border-l-secondary border-outline-variant'
                  : 'border-l-4 border-l-outline border-outline-variant'
              }`}
            >
              <div className="flex gap-4 items-start">
                <div
                  className={`p-2 rounded-lg flex items-center justify-center shrink-0 ${
                    item.urgency === 'HIGH'
                      ? 'bg-error-container text-on-error-container'
                      : item.urgency === 'MEDIUM'
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  <Icon name={item.urgency === 'HIGH' ? 'gpp_bad' : item.urgency === 'MEDIUM' ? 'warning' : 'info'} size={20} />
                </div>
                
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        item.urgency === 'HIGH'
                          ? 'bg-error-container text-on-error-container'
                          : item.urgency === 'MEDIUM'
                          ? 'bg-secondary-container text-on-secondary-container'
                          : 'bg-surface-variant text-on-surface-variant'
                      }`}
                    >
                      {item.urgency}
                    </span>
                    <span className="text-[10px] text-outline font-bold">{item.date}</span>
                  </div>
                  <p className="text-xs font-bold text-on-surface mt-1.5">{item.customerName}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{item.description}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                {item.actions.map((act) => {
                  if (act.actionType === 'chat') {
                    return (
                      <Link
                        key={act.label}
                        href="/chat"
                        className="px-3.5 py-1.5 border border-outline-variant hover:bg-surface-container rounded-lg font-bold text-xs text-on-surface-variant"
                      >
                        {act.label}
                      </Link>
                    );
                  }
                  if (act.actionType === 'remind') {
                    return (
                      <button
                        key={act.label}
                        onClick={() => router.push(`/chat?query=Draft+reminder+for+${item.customerName}`)}
                        className="px-3.5 py-1.5 border border-primary text-primary hover:bg-primary-fixed/20 rounded-lg font-bold text-xs"
                      >
                        {act.label}
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={act.label}
                      href="/connect"
                      className="px-3.5 py-1.5 border border-outline-variant hover:bg-surface-container rounded-lg font-bold text-xs text-on-surface-variant"
                    >
                      {act.label}
                    </Link>
                  );
                })}
              </div>

            </div>
          ))
        )}
      </div>

      {/* Floating Action Button */}
      <Link
        href="/record-sale"
        className="fixed bottom-8 right-8 w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-50"
      >
        <Icon name="add" size={28} />
      </Link>

    </div>
  );
}
