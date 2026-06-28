'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import psoLogo from '@/assets/pso-logo.png';
import {
  LayoutDashboard,
  ShoppingCart,
  ReceiptText,
  FileBarChart,
  LineChart,
  Package,
  Users,
  ClipboardList,
  Network,
  Bot,
  Bell,
  Store,
  Settings,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/components/ui/cn';

interface NavItem {
  name: string;
  icon: LucideIcon;
  href: string;
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Core Workspace',
    items: [
      { name: 'Alara Chat AI', icon: Bot, href: '/chat' },
      { name: 'Today Dashboard', icon: LayoutDashboard, href: '/' },
      { name: 'Record Sale', icon: ShoppingCart, href: '/record-sale' },
      { name: 'Invoices List', icon: ReceiptText, href: '/invoices' },
      { name: 'Inventory & Suppliers', icon: Package, href: '/inventory' },
      { name: 'Analytics Insights', icon: LineChart, href: '/insights' },
      { name: 'Reports', icon: FileBarChart, href: '/reports' },
    ],
  },
  {
    title: 'Customers & Outreach',
    items: [
      { name: 'Customers Directory', icon: Users, href: '/customers' },
      { name: 'Customer Follow-ups', icon: ClipboardList, href: '/follow-ups' },
      { name: 'Customer Connect', icon: Network, href: '/connect' },
    ],
  },
  {
    title: 'Communications',
    items: [
      { name: 'Notifications Feed', icon: Bell, href: '/notifications' },
    ],
  },
];

const SUB_ITEMS: NavItem[] = [
  { name: 'Business Profile', icon: Store, href: '/business-profile' },
  { name: 'Settings', icon: Settings, href: '#' },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'group relative flex items-center px-3 py-1.5 rounded-sm text-xs font-medium transition-all duration-150',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-foreground rounded-r-sm" />
      )}
      <Icon
        className={cn(
          'size-3.5 shrink-0 transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
        )}
      />
      <span className="truncate transition-all duration-300 opacity-0 max-w-0 group-hover/sidebar:opacity-100 group-hover/sidebar:max-w-[150px] group-hover/sidebar:ml-2.5 overflow-hidden whitespace-nowrap">
        {item.name}
      </span>
    </Link>
  );
}

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  return (
    <aside className="fixed left-0 top-0 z-50 h-screen w-16 hover:w-[208px] transition-all duration-300 ease-in-out flex flex-col bg-card border-r border-outline-variant overflow-hidden group/sidebar shadow-none hover:shadow-2xl">
      {/* Brand */}
      <div className="px-3 group-hover/sidebar:px-4 pt-5 pb-3 flex flex-col items-center text-center border-b border-outline-variant shrink-0 transition-all duration-300">
        <Image 
          src={psoLogo} 
          alt="PSO" 
          className="size-10 object-contain transition-transform duration-300 group-hover/sidebar:scale-105" 
          priority 
        />
        <div className="transition-all duration-300 opacity-0 max-h-0 group-hover/sidebar:opacity-100 group-hover/sidebar:max-h-12 overflow-hidden flex flex-col items-center text-center mt-0 group-hover/sidebar:mt-1.5">
          <p className="text-foreground text-[13px] font-extrabold font-mono tracking-[0.18em] uppercase leading-tight whitespace-nowrap">
            PSO SME
          </p>
          <p className="text-muted-foreground text-[9px] leading-tight tracking-wide uppercase mt-0.5 whitespace-nowrap">
            Customer 360 · Karachi Hub
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto scrollbar-hidden">
        {GROUPS.map((group, idx) => (
          <div key={group.title} className="space-y-0.5">
            {idx > 0 && (
              <div className="h-px bg-outline-variant/30 my-2 mx-3 group-hover/sidebar:hidden" />
            )}
            <p className="px-3 pt-3 pb-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-widest transition-all duration-300 opacity-0 max-w-0 group-hover/sidebar:opacity-100 group-hover/sidebar:max-w-[150px] overflow-hidden whitespace-nowrap">
              {group.title}
            </p>
            {group.items.map((item) => (
              <NavLink key={item.name} item={item} active={isActive(item.href)} />
            ))}
          </div>
        ))}

        <div className="mt-3 pt-2 border-t border-outline-variant space-y-0.5">
          {SUB_ITEMS.map((item) => (
            <NavLink key={item.name} item={item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>

      {/* Bottom — help + profile */}
      <div className="px-2 pb-3 shrink-0">
        <Link
          href="#"
          className="flex items-center px-3 py-1.5 rounded-sm text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mb-2"
        >
          <HelpCircle className="size-3.5 shrink-0" />
          <span className="truncate transition-all duration-300 opacity-0 max-w-0 group-hover/sidebar:opacity-100 group-hover/sidebar:max-w-[150px] group-hover/sidebar:ml-2.5 overflow-hidden whitespace-nowrap">
            Help Center
          </span>
        </Link>

        <div className="flex items-center p-2 rounded-lg bg-surface-container-low border border-outline-variant overflow-hidden transition-all duration-300">
          <div className="size-7 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-bold shrink-0">
            AK
          </div>
          <div className="transition-all duration-300 opacity-0 max-w-0 group-hover/sidebar:opacity-100 group-hover/sidebar:max-w-[120px] group-hover/sidebar:ml-2.5 overflow-hidden shrink-0">
            <p className="text-[11px] font-bold text-foreground truncate whitespace-nowrap">Ahmed Khan</p>
            <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider whitespace-nowrap">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
