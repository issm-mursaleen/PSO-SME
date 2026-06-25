'use client';

import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  CalendarDays,
  MapPin,
  Package,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { Badge, Card, MetricCard, Table, TBody, Td, Th, THead, TRow } from '@/components/ui';

const stockItems = [
  { sku: 'MILK-1L', product: 'Nestle Milkpak 1L', category: 'Dairy', current: 42, reorder: 30, stockIn: 120, stockOut: 78, route: 'Clifton Route', tone: 'success' as const },
  { sku: 'OIL-5L', product: 'Cooking Oil 5L', category: 'Grocery', current: 4, reorder: 12, stockIn: 24, stockOut: 20, route: 'Gulshan Route', tone: 'danger' as const },
  { sku: 'RICE-25', product: 'Basmati Rice 25kg', category: 'Grocery', current: 8, reorder: 15, stockIn: 40, stockOut: 32, route: 'Saddar Route', tone: 'warning' as const },
  { sku: 'SUGAR-1K', product: 'Sugar 1kg', category: 'Grocery', current: 22, reorder: 20, stockIn: 80, stockOut: 58, route: 'DHA Route', tone: 'success' as const },
  { sku: 'TEA-475', product: 'Tapal Danedar 475g', category: 'Grocery', current: 3, reorder: 10, stockIn: 36, stockOut: 33, route: 'Nazimabad Route', tone: 'danger' as const },
];

const milkRoutes = [
  { route: 'Clifton Route', loaded: 160, delivered: 142, returned: 18, cash: 31240 },
  { route: 'DHA Route', loaded: 140, delivered: 131, returned: 9, cash: 28820 },
  { route: 'Gulshan Route', loaded: 110, delivered: 96, returned: 14, cash: 21120 },
];

function money(value: number) {
  return `PKR ${value.toLocaleString()}`;
}

export default function InventoryPage() {
  const totalCurrentStock = stockItems.reduce((sum, item) => sum + item.current, 0);
  const lowStockItems = stockItems.filter((item) => item.current <= item.reorder);
  const stockIn = stockItems.reduce((sum, item) => sum + item.stockIn, 0);
  const stockOut = stockItems.reduce((sum, item) => sum + item.stockOut, 0);

  const inventoryCards = [
    { title: 'Current Stock', value: `${totalCurrentStock} units`, hint: 'All tracked items', icon: Package, tone: 'info' as const },
    { title: 'Low Stock Alerts', value: `${lowStockItems.length} SKUs`, hint: 'Needs reorder action', icon: BellRing, tone: 'danger' as const },
    { title: 'Stock In', value: `${stockIn} units`, hint: 'Received today', icon: ArrowDown, tone: 'success' as const },
    { title: 'Stock Out', value: `${stockOut} units`, hint: 'Issued or delivered', icon: ArrowUp, tone: 'warning' as const },
  ];

  return (
    <div className="max-w-[1600px] mx-auto p-gutter space-y-4 animate-fade-in">
      <div className="flex items-center justify-between border-b border-outline-variant pb-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Basic Inventory</h1>
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
            Current stock, low stock alerts, stock in, and stock out
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 active:scale-[0.98] transition-all">
          <ArrowDown className="size-3.5" />
          Stock In
        </button>
      </div>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {inventoryCards.map((card) => {
          const Icon = card.icon;
          return (
            <MetricCard
              key={card.title}
              label={card.title}
              value={card.value}
              hint={card.hint}
              hintIcon={<Icon className="size-3.5" />}
              tone={card.tone}
            />
          );
        })}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
            <Package className="size-4 text-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">Current Stock</h2>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <THead>
                <tr>
                  <Th>SKU</Th>
                  <Th>Product</Th>
                  <Th>Category</Th>
                  <Th className="text-right">Current</Th>
                  <Th className="text-right">Reorder</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <TBody>
                {stockItems.map((item) => (
                  <TRow key={item.sku}>
                    <Td className="font-mono text-xs font-semibold">{item.sku}</Td>
                    <Td className="font-semibold text-foreground whitespace-nowrap">{item.product}</Td>
                    <Td className="text-muted-foreground">{item.category}</Td>
                    <Td className="text-right font-mono font-semibold">{item.current}</Td>
                    <Td className="text-right font-mono text-muted-foreground">{item.reorder}</Td>
                    <Td>
                      <Badge tone={item.tone}>{item.current <= item.reorder ? 'Reorder' : 'Healthy'}</Badge>
                    </Td>
                  </TRow>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
            <BellRing className="size-4 text-danger" />
            <h2 className="text-sm font-semibold tracking-tight">Reorder Alerts</h2>
          </div>
          <div className="p-3 space-y-2">
            {lowStockItems.map((item) => (
              <div key={item.sku} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.product}</p>
                    <p className="text-xs text-muted-foreground mt-1">Current stock is below reorder level.</p>
                  </div>
                  <Badge tone={item.tone}>{item.current} left</Badge>
                </div>
                <button className="mt-3 h-8 w-full rounded-lg border border-outline-variant text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                  Create Reorder
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
            <Truck className="size-4 text-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">For Milk Distributors</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
            <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-info" />
                <h3 className="text-sm font-semibold">Daily Inventory</h3>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Load, delivered, returned, and cash summary for milk runs.</p>
              <p className="mt-3 font-mono text-lg font-bold text-foreground">410 loaded</p>
            </div>
            <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-warning" />
                <h3 className="text-sm font-semibold">Route-wise Delivery</h3>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Track distribution performance per route and returned stock.</p>
              <p className="mt-3 font-mono text-lg font-bold text-foreground">3 routes</p>
            </div>
          </div>
          <div className="overflow-x-auto custom-scrollbar border-t border-outline-variant">
            <Table>
              <THead>
                <tr>
                  <Th>Route</Th>
                  <Th className="text-right">Loaded</Th>
                  <Th className="text-right">Delivered</Th>
                  <Th className="text-right">Returned</Th>
                  <Th className="text-right">Cash</Th>
                </tr>
              </THead>
              <TBody>
                {milkRoutes.map((route) => (
                  <TRow key={route.route}>
                    <Td className="font-semibold">{route.route}</Td>
                    <Td className="text-right font-mono">{route.loaded}</Td>
                    <Td className="text-right font-mono">{route.delivered}</Td>
                    <Td className="text-right font-mono">{route.returned}</Td>
                    <Td className="text-right font-mono font-semibold">{money(route.cash)}</Td>
                  </TRow>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant">
            <ShoppingCart className="size-4 text-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">For Kiryana</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Reorder Alerts</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Daily list of grocery SKUs that need purchase before shelves run dry.</p>
                </div>
                <Badge tone="warning">{lowStockItems.length} open</Badge>
              </div>
            </div>
            {lowStockItems.map((item) => (
              <div key={item.sku} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">{item.product}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">Min {item.reorder} units</p>
                </div>
                <button className="h-7 px-3 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/85 transition-colors">
                  Reorder
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
