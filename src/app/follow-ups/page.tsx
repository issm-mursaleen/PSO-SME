'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { BellRing, CalendarCheck, MapPin, Truck, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Badge, Card, MetricCard, Table, TBody, Td, Th, THead, TRow } from '@/components/ui';

const reminderTemplates = [
  {
    title: 'Send WhatsApp',
    description: 'Send a friendly check-in to recent or active customers.',
    icon: BellRing,
    tone: 'info' as const,
    action: 'Open messages',
  },
  {
    title: 'Re-engage (offer)',
    description: 'Win back inactive customers with a fresh offer or new arrival.',
    icon: Sparkles,
    tone: 'warning' as const,
    action: 'Send offer',
  },
  {
    title: 'Visit customer',
    description: 'Schedule a market or shop visit to strengthen the relationship.',
    icon: MapPin,
    tone: 'success' as const,
    action: 'Plan visit',
  },
  {
    title: 'Delivery reminder',
    description: 'Confirm pending delivery before route dispatch closes.',
    icon: Truck,
    tone: 'neutral' as const,
    action: 'Send reminder',
  },
];

export default function FollowUpsPage() {
  const { customers, connectQueue } = useApp();

  const followUps = useMemo(
    () =>
      customers.map((customer) => {
        const queueItem = connectQueue.find((item) => item.customerId === customer.id);
        const kind =
          customer.lastVisitDays >= 14
            ? 'Re-engage (offer)'
            : customer.lastVisitDays >= 7
            ? 'Visit customer'
            : customer.channel === 'WhatsApp'
            ? 'Send WhatsApp'
            : 'Delivery reminder';

        return {
          id: customer.id,
          customer: customer.name,
          phone: customer.phone,
          kind,
          reason:
            queueItem?.reason ??
            (customer.lastVisitDays >= 14
              ? `No visit in ${customer.lastVisitDays} days`
              : 'Regular service reminder'),
          lastVisitDays: customer.lastVisitDays,
          due: customer.lastVisitDays > 10 ? 'Today' : customer.lastVisitDays > 5 ? 'Tomorrow' : 'This week',
          tone:
            customer.lastVisitDays >= 14
              ? ('warning' as const)
              : customer.lastVisitDays >= 7
              ? ('info' as const)
              : ('neutral' as const),
        };
      }),
    [customers, connectQueue],
  );

  const reengageTasks = followUps.filter((item) => item.kind === 'Re-engage (offer)').length;
  const visitTasks = followUps.filter((item) => item.kind === 'Visit customer').length;
  const messageTasks = followUps.filter((item) => item.kind === 'Send WhatsApp').length;

  return (
    <div className="max-w-[1600px] mx-auto p-gutter space-y-4 animate-fade-in">
      <div className="flex items-center justify-between border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Customer Follow-ups</h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
            Simple reminders for messages, collections, visits, and deliveries
          </p>
        </div>
        <Link
          href="/connect"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all"
        >
          <BellRing className="size-3.5" />
          Open Connect
        </Link>
      </div>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard label="Total Reminders" value={followUps.length} hint="Active customer tasks" />
        <MetricCard label="Send WhatsApp" value={messageTasks} hint="Message follow-ups" tone="info" />
        <MetricCard label="Needs Re-engagement" value={reengageTasks} hint="Inactive 14+ days" tone="warning" />
        <MetricCard label="Visit Customer" value={visitTasks} hint="Relationship visits" tone="success" />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {reminderTemplates.map((template) => {
          const Icon = template.icon;
          return (
            <Card key={template.title} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Icon className="size-4" />
                </span>
                <Badge tone={template.tone}>Reminder</Badge>
              </div>
              <h2 className="mt-4 text-sm font-semibold text-foreground">{template.title}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description}</p>
              <button className="mt-4 h-8 w-full rounded-lg border border-outline-variant text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                {template.action}
              </button>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
          <CalendarCheck className="size-4 text-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Reminder Queue</h2>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <Table>
            <THead>
              <tr>
                <Th>Customer</Th>
                <Th>Reminder</Th>
                <Th>Reason</Th>
                <Th className="text-right">Last Visit</Th>
                <Th>Due</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </THead>
            <TBody>
              {followUps.map((item) => (
                <TRow key={item.id}>
                  <Td>
                    <p className="font-semibold text-foreground whitespace-nowrap">{item.customer}</p>
                    <p className="text-xs text-muted-foreground">{item.phone}</p>
                  </Td>
                  <Td>
                    <Badge tone={item.tone}>{item.kind}</Badge>
                  </Td>
                  <Td className="text-muted-foreground">{item.reason}</Td>
                  <Td className="text-right font-mono font-semibold">{item.lastVisitDays}d ago</Td>
                  <Td className="font-mono text-xs">{item.due}</Td>
                  <Td className="text-right">
                    <Link
                      href={`/connect?customer=${item.id}`}
                      className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/85 transition-colors"
                    >
                      Start
                    </Link>
                  </Td>
                </TRow>
              ))}
            </TBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
