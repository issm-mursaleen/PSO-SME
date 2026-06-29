'use client';

import React, { createContext, useContext, useState } from 'react';
import { SEED_INVOICES, SEED_SUPPLIER_INVOICES } from '@/data/seedHistory';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  type: string;
  channel: string;
  neighborhood: string;
  address: string;
  status: 'Active' | 'Inactive';
  notes: string;
  lastVisitDays: number;
  preferredProducts?: { name: string; pct: number }[];
}

export interface InvoiceItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  /** Links this line item to a tracked inventory product (set on supplier
   *  purchases so a restock can update the exact SKU instead of guessing by name). */
  sku?: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  dueDate: string;
  amount: number;
  discount: number;
  status: 'Paid';
  items: InvoiceItem[];
  notes: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  category: string;
  address: string;
  status: 'Active' | 'Inactive';
  notes: string;
}

export interface SupplierInvoice {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  amount: number;
  discount: number;
  /** Draft = recorded but stock not yet received/applied. Paid = received,
   *  confirmed, and already reflected in inventory. */
  status: 'Draft' | 'Paid';
  /** The supplier's own invoice/reference number, if they gave one. */
  invoiceNumber?: string;
  items: InvoiceItem[];
  notes: string;
}

export interface StockMovement {
  id: string;
  sku: string;
  type: 'Restock' | 'Adjustment' | 'Sale';
  /** Signed delta — positive increases stock, negative decreases it. */
  quantity: number;
  date: string;
  note: string;
  /** Purchase invoice id, when this movement came from a confirmed restock. */
  reference?: string;
}

export interface Notification {
  id: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  customerName: string;
  description: string;
  actions: { label: string; actionType: string }[];
  date: string;
}

export interface ConnectQueueItem {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  reason: string;
  dueDays: number;
  lastAction: string;
  health: 'good' | 'critical' | 'warning';
  channel: string;
}

export interface CommunicationLog {
  id: string;
  customerId: string;
  sender: 'Store' | 'Customer' | 'System';
  type: 'WhatsApp' | 'Call' | 'SMS';
  content: string;
  timestamp: string;
}

export interface StockItem {
  sku: string;
  product: string;
  category: string;
  current: number;
  reorder: number;
  stockIn: number;
  stockOut: number;
  route: string;
  /** The supplier this product is restocked from — links Inventory to Suppliers. */
  supplierId?: string;
}

interface AppContextType {
  customers: Customer[];
  invoices: Invoice[];
  suppliers: Supplier[];
  supplierInvoices: SupplierInvoice[];
  stockMovements: StockMovement[];
  notifications: Notification[];
  connectQueue: ConnectQueueItem[];
  commLogs: CommunicationLog[];
  inventory: StockItem[];
  addCustomer: (customer: Omit<Customer, 'id' | 'lastVisitDays'>) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => Customer | null;
  recordSale: (
    customerId: string,
    items: InvoiceItem[],
    discount: number,
    notes: string
  ) => Invoice;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Supplier;
  updateSupplier: (id: string, patch: Partial<Supplier>) => Supplier | null;
  recordPurchase: (
    supplierId: string,
    items: InvoiceItem[],
    discount: number,
    notes: string,
    opts?: { status?: 'Draft' | 'Paid'; invoiceNumber?: string; date?: string }
  ) => SupplierInvoice;
  confirmDraftPurchase: (invoiceId: string) => SupplierInvoice | null;
  recordStockIn: (sku: string, quantity: number) => StockItem | null;
  addInventoryItem: (item: Omit<StockItem, 'stockIn' | 'stockOut'>) => StockItem;
  updateInventoryItem: (sku: string, patch: Partial<StockItem>) => StockItem | null;
  adjustStock: (sku: string, delta: number, reason: string) => StockItem | null;
  sendWhatsAppReminder: (customerId: string, messageContent: string, type?: 'WhatsApp' | 'SMS' | 'Call') => void;
  recordCustomerReply: (customerId: string, messageContent: string, type?: 'WhatsApp' | 'SMS' | 'Call') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const TYPE_CATALOG: Record<string, { name: string; unit: string; price: number }[]> = {
  Household: [
    { name: 'Nestle Milkpak 1L', unit: 'pcs', price: 320 },
    { name: 'Cooking Oil 5L', unit: 'tin', price: 2500 },
    { name: 'Tapal Danedar 475g', unit: 'pack', price: 1150 },
    { name: 'Sugar 1kg', unit: 'kg', price: 165 },
  ],
  Retailer: [
    { name: 'Lays Chips', unit: 'ctn', price: 2200 },
    { name: 'Cadbury Dairy Milk', unit: 'box', price: 1800 },
    { name: 'Coca Cola 1.5L', unit: 'crate', price: 2400 },
    { name: 'Tapal Danedar 475g', unit: 'pack', price: 1150 },
  ],
  Wholesaler: [
    { name: 'Basmati Rice 25kg', unit: 'bag', price: 6200 },
    { name: 'Wheat Flour 10kg', unit: 'bag', price: 1450 },
    { name: 'Ghee 5kg', unit: 'tin', price: 2850 },
    { name: 'Surf Excel', unit: 'ctn', price: 3900 },
  ],
  'Hotel / Restaurant': [
    { name: 'Basmati Rice 25kg', unit: 'bag', price: 6200 },
    { name: 'Cooking Oil 5L', unit: 'tin', price: 2500 },
    { name: 'Sugar 1kg', unit: 'kg', price: 165 },
    { name: 'Tea', unit: 'pack', price: 980 },
  ],
  Corporate: [
    { name: 'Mineral Water 1.5L', unit: 'crate', price: 1250 },
    { name: 'Tea', unit: 'pack', price: 980 },
    { name: 'Sugar 1kg', unit: 'kg', price: 165 },
    { name: 'Biscuits Assorted', unit: 'box', price: 1450 },
  ],
};

const preferredItem = (name: string, type: string, fallbackIndex: number) => {
  const catalog = TYPE_CATALOG[type] ?? TYPE_CATALOG.Household;
  const match = catalog.find((item) => item.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(item.name.toLowerCase()));
  return match ?? { ...catalog[fallbackIndex % catalog.length], name };
};

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

const buildSeedInvoices = (seedCustomers: Customer[]): Invoice[] =>
  seedCustomers.flatMap((customer, index) => {
    const catalog = TYPE_CATALOG[customer.type] ?? TYPE_CATALOG.Household;
    const baseQty =
      customer.type === 'Wholesaler' ? 5 :
      customer.type === 'Hotel / Restaurant' ? 4 :
      customer.type === 'Retailer' ? 3 :
      customer.type === 'Corporate' ? 3 :
      2;
    const dates = [
      Math.max(customer.lastVisitDays, 0),
      customer.lastVisitDays + 11 + (index % 5),
    ];

    return dates.map((daysAgo, visitIndex) => {
      const firstSource = customer.preferredProducts?.[visitIndex]?.name ?? catalog[(index + visitIndex) % catalog.length].name;
      const secondSource = customer.preferredProducts?.[visitIndex + 1]?.name ?? catalog[(index + visitIndex + 1) % catalog.length].name;
      const first = preferredItem(firstSource, customer.type, index + visitIndex);
      const second = preferredItem(secondSource, customer.type, index + visitIndex + 1);
      const items: InvoiceItem[] = [
        {
          name: first.name,
          quantity: baseQty + (index % 3) + visitIndex,
          unit: first.unit,
          price: first.price,
          total: (baseQty + (index % 3) + visitIndex) * first.price,
        },
        {
          name: second.name,
          quantity: Math.max(1, baseQty - 1 + ((index + visitIndex) % 2)),
          unit: second.unit,
          price: second.price,
          total: Math.max(1, baseQty - 1 + ((index + visitIndex) % 2)) * second.price,
        },
      ];
      const amount = items.reduce((sum, item) => sum + item.total, 0);
      const invoiceNo = 2040 + index * 2 + visitIndex;
      const date = isoDaysAgo(daysAgo);

      return {
        id: `INV-${invoiceNo}`,
        customerId: customer.id,
        customerName: customer.name,
        date,
        dueDate: date,
        amount,
        discount: 0,
        status: 'Paid' as const,
        items,
        notes: `Seeded sale history for ${customer.name}; customer sales are calculated from invoices.`,
      };
    });
  });

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- Seed Data ---
  const [customers, setCustomers] = useState<Customer[]>([
    {
      id: 'cust-riaz',
      name: 'Riaz Ahmed',
      phone: '+92 300 9876543',
      type: 'Household',
      channel: 'WhatsApp',
      neighborhood: 'Clifton Block 2',
      address: 'House 43B, Lane 5, Clifton, Karachi',
      status: 'Active',
      notes: 'Long-standing Clifton household customer — keep engaged.',
      lastVisitDays: 18,
      preferredProducts: [
        { name: 'Dal Chana', pct: 40 },
        { name: 'Basmati Rice', pct: 35 },
        { name: 'Tapal Danedar', pct: 25 },
      ],
    },
    {
      id: 'cust-sana',
      name: 'Sana Bibi',
      phone: '+92 312 3456789',
      type: 'Household',
      channel: 'Call',
      neighborhood: 'DHA Phase 2',
      address: 'Flat A-4, DHA Phase 2, Karachi',
      status: 'Active',
      notes: 'Has not purchased in 9 days. Usually visits every 4 days.',
      lastVisitDays: 9,
      preferredProducts: [
        { name: 'Nestle Milkpak', pct: 50 },
        { name: 'Olpers Cream', pct: 30 },
        { name: 'Sensodyne Toothpaste', pct: 20 },
      ],
    },
    {
      id: 'cust-iqbal',
      name: 'Iqbal Confectionary',
      phone: '+92 333 4567890',
      type: 'Retailer',
      channel: 'SMS',
      neighborhood: 'Saddar',
      address: 'Shop 12, Confectionary Market, Saddar, Karachi',
      status: 'Active',
      notes: 'Invoice #INV-2041 due tomorrow.',
      lastVisitDays: 1,
      preferredProducts: [
        { name: 'Cadbury Dairy Milk', pct: 60 },
        { name: 'Lays Chips', pct: 25 },
        { name: 'Coca Cola 1.5L', pct: 15 },
      ],
    },
    {
      id: 'cust-malik',
      name: 'Malik Store',
      phone: '+92 321 5556667',
      type: 'Wholesaler',
      channel: 'WhatsApp',
      neighborhood: 'Gulshan-e-Iqbal',
      address: 'Main KDA Market, Block 6, Gulshan, Karachi',
      status: 'Active',
      notes: 'Payment failed for online transfer.',
      lastVisitDays: 5,
      preferredProducts: [
        { name: 'Wheat Flour 10kg', pct: 55 },
        { name: 'Ghee 5kg', pct: 30 },
        { name: 'Surf Excel', pct: 15 },
      ],
    },
    {
      id: 'cust-nadeem',
      name: 'Nadeem Chacha',
      phone: '+92 300 2223344',
      type: 'Household',
      channel: 'WhatsApp',
      neighborhood: 'Nazimabad',
      address: 'House 18, Nazimabad, Karachi',
      status: 'Active',
      notes: 'Regular customer. Prefers short WhatsApp updates.',
      lastVisitDays: 3,
      preferredProducts: [
        { name: 'Tea', pct: 35 },
        { name: 'Sugar', pct: 30 },
        { name: 'Cooking Oil', pct: 20 },
      ],
    },
    {
      id: 'cust-gen-1',
      name: 'Ali Khan',
      phone: '+92 311 1234567',
      type: 'Household',
      channel: 'WhatsApp',
      neighborhood: 'Clifton Block 4',
      address: 'Shop 10, Clifton Block 4, Karachi',
      status: 'Active',
      notes: 'Active account, last visit 0 days ago.',
      lastVisitDays: 0,
    },
    {
      id: 'cust-gen-2',
      name: 'Maria Qureshi',
      phone: '+92 312 2469134',
      type: 'Retailer',
      channel: 'Call',
      neighborhood: 'DHA Phase 5',
      address: 'Shop 11, DHA Phase 5, Karachi',
      status: 'Active',
      notes: 'Last seen 3 days ago.',
      lastVisitDays: 3,
    },
    {
      id: 'cust-gen-3',
      name: 'Adeel Butt',
      phone: '+92 313 3703701',
      type: 'Wholesaler',
      channel: 'SMS',
      neighborhood: 'Saddar',
      address: 'Shop 12, Saddar, Karachi',
      status: 'Active',
      notes: 'Last seen 6 days ago.',
      lastVisitDays: 6,
    },
    {
      id: 'cust-gen-4',
      name: 'Fatima Sheikh',
      phone: '+92 314 4938268',
      type: 'Hotel / Restaurant',
      channel: 'WhatsApp',
      neighborhood: 'Gulshan-e-Iqbal',
      address: 'Shop 13, Gulshan-e-Iqbal, Karachi',
      status: 'Active',
      notes: 'Last seen 9 days ago.',
      lastVisitDays: 9,
    },
    {
      id: 'cust-gen-5',
      name: 'Bilal Hussain',
      phone: '+92 315 6172835',
      type: 'Corporate',
      channel: 'Call',
      neighborhood: 'Nazimabad',
      address: 'Shop 14, Nazimabad, Karachi',
      status: 'Active',
      notes: 'Last seen 12 days ago.',
      lastVisitDays: 12,
    },
    {
      id: 'cust-gen-6',
      name: 'Ayesha Siddiqui',
      phone: '+92 316 7407402',
      type: 'Household',
      channel: 'SMS',
      neighborhood: 'PECHS Block 6',
      address: 'Shop 15, PECHS Block 6, Karachi',
      status: 'Active',
      notes: 'Active account, last visit 15 days ago.',
      lastVisitDays: 15,
    },
    {
      id: 'cust-gen-7',
      name: 'Imran Farooq',
      phone: '+92 317 8641969',
      type: 'Retailer',
      channel: 'WhatsApp',
      neighborhood: 'Korangi',
      address: 'Shop 16, Korangi, Karachi',
      status: 'Active',
      notes: 'Last seen 18 days ago.',
      lastVisitDays: 18,
    },
    {
      id: 'cust-gen-8',
      name: 'Zoya Malik',
      phone: '+92 318 9876536',
      type: 'Wholesaler',
      channel: 'Call',
      neighborhood: 'Malir Cantt',
      address: 'Shop 17, Malir Cantt, Karachi',
      status: 'Active',
      notes: 'Last seen 21 days ago.',
      lastVisitDays: 21,
    },
    {
      id: 'cust-gen-9',
      name: 'Kamran Akhtar',
      phone: '+92 319 1111110',
      type: 'Hotel / Restaurant',
      channel: 'SMS',
      neighborhood: 'North Nazimabad',
      address: 'Shop 18, North Nazimabad, Karachi',
      status: 'Active',
      notes: 'Last seen 2 days ago.',
      lastVisitDays: 2,
    },
    {
      id: 'cust-gen-10',
      name: 'Hina Raza',
      phone: '+92 320 1234567',
      type: 'Corporate',
      channel: 'WhatsApp',
      neighborhood: 'Gulistan-e-Johar',
      address: 'Shop 19, Gulistan-e-Johar, Karachi',
      status: 'Active',
      notes: 'Last seen 5 days ago.',
      lastVisitDays: 5,
    },
    {
      id: 'cust-gen-11',
      name: 'Usman Ghani',
      phone: '+92 321 1358023',
      type: 'Household',
      channel: 'Call',
      neighborhood: 'Clifton Block 4',
      address: 'Shop 20, Clifton Block 4, Karachi',
      status: 'Active',
      notes: 'Active account, last visit 8 days ago.',
      lastVisitDays: 8,
    },
    {
      id: 'cust-gen-12',
      name: 'Nida Aslam',
      phone: '+92 322 1481480',
      type: 'Retailer',
      channel: 'SMS',
      neighborhood: 'DHA Phase 5',
      address: 'Shop 21, DHA Phase 5, Karachi',
      status: 'Active',
      notes: 'Last seen 11 days ago.',
      lastVisitDays: 11,
    },
    {
      id: 'cust-gen-13',
      name: 'Tariq Mehmood',
      phone: '+92 323 1604937',
      type: 'Wholesaler',
      channel: 'WhatsApp',
      neighborhood: 'Saddar',
      address: 'Shop 22, Saddar, Karachi',
      status: 'Active',
      notes: 'Last seen 14 days ago.',
      lastVisitDays: 14,
    },
    {
      id: 'cust-gen-14',
      name: 'Saima Noor',
      phone: '+92 324 1728393',
      type: 'Hotel / Restaurant',
      channel: 'Call',
      neighborhood: 'Gulshan-e-Iqbal',
      address: 'Shop 23, Gulshan-e-Iqbal, Karachi',
      status: 'Active',
      notes: 'Last seen 17 days ago.',
      lastVisitDays: 17,
    },
    {
      id: 'cust-gen-15',
      name: 'Faisal Iqbal',
      phone: '+92 325 1851850',
      type: 'Corporate',
      channel: 'SMS',
      neighborhood: 'Nazimabad',
      address: 'Shop 24, Nazimabad, Karachi',
      status: 'Active',
      notes: 'Last seen 20 days ago.',
      lastVisitDays: 20,
    },
    {
      id: 'cust-gen-16',
      name: 'Rabia Yousuf',
      phone: '+92 326 1975307',
      type: 'Household',
      channel: 'WhatsApp',
      neighborhood: 'PECHS Block 6',
      address: 'Shop 25, PECHS Block 6, Karachi',
      status: 'Active',
      notes: 'Active account, last visit 1 days ago.',
      lastVisitDays: 1,
    },
    {
      id: 'cust-gen-17',
      name: 'Naveed Anwar',
      phone: '+92 327 2098763',
      type: 'Retailer',
      channel: 'Call',
      neighborhood: 'Korangi',
      address: 'Shop 26, Korangi, Karachi',
      status: 'Active',
      notes: 'Last seen 4 days ago.',
      lastVisitDays: 4,
    },
    {
      id: 'cust-gen-18',
      name: 'Mehwish Tariq',
      phone: '+92 328 2222220',
      type: 'Wholesaler',
      channel: 'SMS',
      neighborhood: 'Malir Cantt',
      address: 'Shop 27, Malir Cantt, Karachi',
      status: 'Active',
      notes: 'Last seen 7 days ago.',
      lastVisitDays: 7,
    },
    {
      id: 'cust-gen-19',
      name: 'Asad Raza',
      phone: '+92 329 2345677',
      type: 'Hotel / Restaurant',
      channel: 'WhatsApp',
      neighborhood: 'North Nazimabad',
      address: 'Shop 28, North Nazimabad, Karachi',
      status: 'Active',
      notes: 'Last seen 10 days ago.',
      lastVisitDays: 10,
    },
    {
      id: 'cust-gen-20',
      name: 'Sadia Kamal',
      phone: '+92 330 2469134',
      type: 'Corporate',
      channel: 'Call',
      neighborhood: 'Gulistan-e-Johar',
      address: 'Shop 29, Gulistan-e-Johar, Karachi',
      status: 'Active',
      notes: 'Last seen 13 days ago.',
      lastVisitDays: 13,
    },
    {
      id: 'cust-gen-21',
      name: 'Junaid Shah',
      phone: '+92 331 2592590',
      type: 'Household',
      channel: 'SMS',
      neighborhood: 'Clifton Block 4',
      address: 'Shop 30, Clifton Block 4, Karachi',
      status: 'Active',
      notes: 'Active account, last visit 16 days ago.',
      lastVisitDays: 16,
    },
    {
      id: 'cust-gen-22',
      name: 'Farah Naz',
      phone: '+92 332 2716047',
      type: 'Retailer',
      channel: 'WhatsApp',
      neighborhood: 'DHA Phase 5',
      address: 'Shop 31, DHA Phase 5, Karachi',
      status: 'Active',
      notes: 'Last seen 19 days ago.',
      lastVisitDays: 19,
    },
    {
      id: 'cust-gen-23',
      name: 'Waqar Younis',
      phone: '+92 333 2839504',
      type: 'Wholesaler',
      channel: 'Call',
      neighborhood: 'Saddar',
      address: 'Shop 32, Saddar, Karachi',
      status: 'Active',
      notes: 'Last seen 0 days ago.',
      lastVisitDays: 0,
    },
    {
      id: 'cust-gen-24',
      name: 'Komal Ahmed',
      phone: '+92 334 2962960',
      type: 'Hotel / Restaurant',
      channel: 'SMS',
      neighborhood: 'Gulshan-e-Iqbal',
      address: 'Shop 33, Gulshan-e-Iqbal, Karachi',
      status: 'Active',
      notes: 'Last seen 3 days ago.',
      lastVisitDays: 3,
    },
    {
      id: 'cust-gen-25',
      name: 'Shahid Mehmood',
      phone: '+92 335 3086417',
      type: 'Corporate',
      channel: 'WhatsApp',
      neighborhood: 'Nazimabad',
      address: 'Shop 34, Nazimabad, Karachi',
      status: 'Active',
      notes: 'Last seen 6 days ago.',
      lastVisitDays: 6,
    },
    {
      id: 'cust-gen-26',
      name: 'Beenish Riaz',
      phone: '+92 336 3209874',
      type: 'Household',
      channel: 'Call',
      neighborhood: 'PECHS Block 6',
      address: 'Shop 35, PECHS Block 6, Karachi',
      status: 'Active',
      notes: 'Active account, last visit 9 days ago.',
      lastVisitDays: 9,
    },
    {
      id: 'cust-gen-27',
      name: 'Daniyal Haider',
      phone: '+92 337 3333330',
      type: 'Retailer',
      channel: 'SMS',
      neighborhood: 'Korangi',
      address: 'Shop 36, Korangi, Karachi',
      status: 'Active',
      notes: 'Last seen 12 days ago.',
      lastVisitDays: 12,
    },
    {
      id: 'cust-gen-28',
      name: 'Anum Zubair',
      phone: '+92 338 3456787',
      type: 'Wholesaler',
      channel: 'WhatsApp',
      neighborhood: 'Malir Cantt',
      address: 'Shop 37, Malir Cantt, Karachi',
      status: 'Active',
      notes: 'Last seen 15 days ago.',
      lastVisitDays: 15,
    },
    {
      id: 'cust-gen-29',
      name: 'Rizwan Saeed',
      phone: '+92 339 3580244',
      type: 'Hotel / Restaurant',
      channel: 'Call',
      neighborhood: 'North Nazimabad',
      address: 'Shop 38, North Nazimabad, Karachi',
      status: 'Active',
      notes: 'Last seen 18 days ago.',
      lastVisitDays: 18,
    },
    {
      id: 'cust-gen-30',
      name: 'Lubna Khalid',
      phone: '+92 340 3703701',
      type: 'Corporate',
      channel: 'SMS',
      neighborhood: 'Gulistan-e-Johar',
      address: 'Shop 39, Gulistan-e-Johar, Karachi',
      status: 'Active',
      notes: 'Last seen 21 days ago.',
      lastVisitDays: 21,
    },
  ]);

  const [invoices, setInvoices] = useState<Invoice[]>(SEED_INVOICES);

  const [suppliers, setSuppliers] = useState<Supplier[]>([
    {
      id: 'sup-grain',
      name: 'Al-Madina Grain Traders',
      contactPerson: 'Hassan Ali',
      phone: '+92 300 1112233',
      category: 'Grains & Pulses',
      address: 'Shop 8, Lyari Grain Market, Karachi',
      status: 'Active',
      notes: 'Bulk rice, wheat flour and pulses. Delivers weekly.',
    },
    {
      id: 'sup-spice',
      name: 'Karachi Spice Co.',
      contactPerson: 'Imran Sheikh',
      phone: '+92 301 2223344',
      category: 'Spices',
      address: 'Plot 14, Jodia Bazaar, Karachi',
      status: 'Active',
      notes: 'Whole and ground spices, sourced from Sindh.',
    },
    {
      id: 'sup-dairy',
      name: 'Sindh Dairy Suppliers',
      contactPerson: 'Bilal Qureshi',
      phone: '+92 302 3334455',
      category: 'Dairy & Beverages',
      address: 'Warehouse 3, SITE Area, Karachi',
      status: 'Active',
      notes: 'Milk, cream and packaged beverages — cold chain delivery.',
    },
    {
      id: 'sup-general',
      name: 'City Wholesale Mart',
      contactPerson: 'Faisal Rana',
      phone: '+92 303 4445566',
      category: 'General Goods',
      address: 'Warehouse 11, Korangi Industrial Area, Karachi',
      status: 'Active',
      notes: 'Detergents, toiletries and packaged snacks.',
    },
    {
      id: 'sup-snacks',
      name: 'Metro Snacks & Confectionery',
      contactPerson: 'Waqar Hussain',
      phone: '+92 304 5556677',
      category: 'Snacks & Confectionery',
      address: 'Shop 22, Bahadurabad Market, Karachi',
      status: 'Active',
      notes: 'Chips, chocolates and soft drinks — twice-weekly delivery.',
    },
  ]);

  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>(() => {
    const drafts: SupplierInvoice[] = [
      {
        id: 'PINV-9001',
        supplierId: 'sup-spice',
        supplierName: 'Karachi Spice Co.',
        date: new Date().toISOString().slice(0, 10),
        amount: 15000,
        discount: 0,
        status: 'Draft',
        items: [{ name: 'Red Chilli Powder 1kg', quantity: 20, unit: 'kg', price: 750, total: 15000 }],
        notes: 'Awaiting delivery — confirm once received to update stock.',
      },
      {
        id: 'PINV-9002',
        supplierId: 'sup-grain',
        supplierName: 'Al-Madina Grain Traders',
        date: new Date().toISOString().slice(0, 10),
        amount: 25000,
        discount: 0,
        status: 'Draft',
        items: [{ name: 'Basmati Rice 25kg', quantity: 8, unit: 'bag', price: 3125, total: 25000 }],
        notes: 'Awaiting delivery.',
      }
    ];
    return [...SEED_SUPPLIER_INVOICES, ...drafts];
  });

  const [notifications] = useState<Notification[]>([
    {
      id: 'ntf-1',
      urgency: 'HIGH',
      customerName: 'Riaz Ahmed',
      description: 'Long-standing Clifton household customer — keep engaged.',
      actions: [
        { label: 'Message', actionType: 'chat' },
        { label: 'Record Payment', actionType: 'payment' },
      ],
      date: '10 mins ago',
    },
    {
      id: 'ntf-2',
      urgency: 'MEDIUM',
      customerName: 'Sana Bibi',
      description: 'Has not purchased in 9 days. Usually visits every 4 days.',
      actions: [
        { label: 'Send Message', actionType: 'chat' },
        { label: 'Send Promo', actionType: 'promo' },
      ],
      date: '2 hours ago',
    },
    {
      id: 'ntf-3',
      urgency: 'LOW',
      customerName: 'Iqbal Confectionary',
      description: 'Invoice #INV-2041 due tomorrow (PKR 4,500).',
      actions: [
        { label: 'Email', actionType: 'email' },
        { label: 'Remind', actionType: 'remind' },
      ],
      date: '5 hours ago',
    },
    {
      id: 'ntf-4',
      urgency: 'HIGH',
      customerName: 'Malik Store',
      description: 'Payment failed for online transfer (PKR 12,000).',
      actions: [
        { label: 'Review', actionType: 'review' },
        { label: 'Re-Verify', actionType: 'verify' },
      ],
      date: '1 day ago',
    },
  ]);

  const [connectQueue, setConnectQueue] = useState<ConnectQueueItem[]>([
    {
      id: 'q-1',
      customerId: 'cust-riaz',
      customerName: 'Riaz Ahmed',
      phone: '+92 300 9876543',
      reason: 'No purchase in 18 days',
      dueDays: 18,
      lastAction: 'Called 2 days ago',
      health: 'critical',
      channel: 'WhatsApp',
    },
    {
      id: 'q-2',
      customerId: 'cust-sana',
      customerName: 'Sana Bibi',
      phone: '+92 312 3456789',
      reason: 'Inactivity Warning (9 days)',
      dueDays: 5,
      lastAction: 'No outreach',
      health: 'warning',
      channel: 'Call',
    },
    {
      id: 'q-3',
      customerId: 'cust-malik',
      customerName: 'Malik Store',
      phone: '+92 321 5556667',
      reason: 'Failed Online Transfer Re-Verify',
      dueDays: 1,
      lastAction: 'SMS sent yesterday',
      health: 'critical',
      channel: 'WhatsApp',
    },
    {
      id: 'q-gen-1',
      customerId: 'cust-gen-2',
      customerName: 'Maria Qureshi',
      phone: '+92 312 2469134',
      reason: 'No purchase in 18 days',
      dueDays: 3,
      lastAction: 'WhatsApp sent 2 days ago',
      health: 'warning',
      channel: 'Call',
    },
    {
      id: 'q-gen-2',
      customerId: 'cust-gen-3',
      customerName: 'Adeel Butt',
      phone: '+92 313 3703701',
      reason: 'Inactivity Warning (PKR 5,400)',
      dueDays: 6,
      lastAction: 'Called last week',
      health: 'warning',
      channel: 'SMS',
    },
    {
      id: 'q-gen-3',
      customerId: 'cust-gen-4',
      customerName: 'Fatima Sheikh',
      phone: '+92 314 4938268',
      reason: 'Failed Online Transfer Re-Verify (PKR 7,100)',
      dueDays: 9,
      lastAction: 'No outreach',
      health: 'warning',
      channel: 'WhatsApp',
    },
    {
      id: 'q-gen-4',
      customerId: 'cust-gen-5',
      customerName: 'Bilal Hussain',
      phone: '+92 315 6172835',
      reason: 'High-value customer — re-engage',
      dueDays: 12,
      lastAction: 'WhatsApp sent 2 days ago',
      health: 'warning',
      channel: 'Call',
    },
    {
      id: 'q-gen-5',
      customerId: 'cust-gen-6',
      customerName: 'Ayesha Siddiqui',
      phone: '+92 316 7407402',
      reason: 'Inactivity Warning (15 days)',
      dueDays: 15,
      lastAction: 'Called last week',
      health: 'warning',
      channel: 'SMS',
    },
    {
      id: 'q-gen-6',
      customerId: 'cust-gen-7',
      customerName: 'Imran Farooq',
      phone: '+92 317 8641969',
      reason: 'Buying Pattern Drop Detected (PKR 12,200)',
      dueDays: 18,
      lastAction: 'No outreach',
      health: 'warning',
      channel: 'WhatsApp',
    },
    {
      id: 'q-gen-7',
      customerId: 'cust-gen-8',
      customerName: 'Zoya Malik',
      phone: '+92 318 9876536',
      reason: 'Pending Invoice Follow-up (PKR 13,900)',
      dueDays: 21,
      lastAction: 'WhatsApp sent 2 days ago',
      health: 'warning',
      channel: 'Call',
    },
    {
      id: 'q-gen-8',
      customerId: 'cust-gen-9',
      customerName: 'Kamran Akhtar',
      phone: '+92 319 1111110',
      reason: 'Immediate RM Intervention Needed (PKR 15,600)',
      dueDays: 2,
      lastAction: 'Called last week',
      health: 'warning',
      channel: 'SMS',
    },
    {
      id: 'q-gen-9',
      customerId: 'cust-gen-10',
      customerName: 'Hina Raza',
      phone: '+92 320 1234567',
      reason: 'No purchase in 18 days',
      dueDays: 5,
      lastAction: 'No outreach',
      health: 'warning',
      channel: 'WhatsApp',
    },
    {
      id: 'q-gen-10',
      customerId: 'cust-gen-11',
      customerName: 'Usman Ghani',
      phone: '+92 321 1358023',
      reason: 'Inactivity Warning (8 days)',
      dueDays: 8,
      lastAction: 'WhatsApp sent 2 days ago',
      health: 'warning',
      channel: 'Call',
    },
    {
      id: 'q-gen-11',
      customerId: 'cust-gen-12',
      customerName: 'Nida Aslam',
      phone: '+92 322 1481480',
      reason: 'Failed Online Transfer Re-Verify (PKR 20,700)',
      dueDays: 11,
      lastAction: 'Called last week',
      health: 'warning',
      channel: 'SMS',
    },
    {
      id: 'q-gen-12',
      customerId: 'cust-gen-13',
      customerName: 'Tariq Mehmood',
      phone: '+92 323 1604937',
      reason: 'High-value customer — re-engage',
      dueDays: 14,
      lastAction: 'No outreach',
      health: 'warning',
      channel: 'WhatsApp',
    },
    {
      id: 'q-gen-13',
      customerId: 'cust-gen-14',
      customerName: 'Saima Noor',
      phone: '+92 324 1728393',
      reason: 'Repeat Order Reminder Due (PKR 24,100)',
      dueDays: 17,
      lastAction: 'WhatsApp sent 2 days ago',
      health: 'warning',
      channel: 'Call',
    },
    {
      id: 'q-gen-14',
      customerId: 'cust-gen-15',
      customerName: 'Faisal Iqbal',
      phone: '+92 325 1851850',
      reason: 'Buying Pattern Drop Detected (PKR 25,800)',
      dueDays: 20,
      lastAction: 'Called last week',
      health: 'warning',
      channel: 'SMS',
    },
    {
      id: 'q-gen-15',
      customerId: 'cust-gen-17',
      customerName: 'Naveed Anwar',
      phone: '+92 327 2098763',
      reason: 'High-value customer — re-engage',
      dueDays: 4,
      lastAction: 'WhatsApp sent 2 days ago',
      health: 'critical',
      channel: 'Call',
    },
    {
      id: 'q-gen-16',
      customerId: 'cust-gen-18',
      customerName: 'Mehwish Tariq',
      phone: '+92 328 2222220',
      reason: 'No purchase in 18 days',
      dueDays: 7,
      lastAction: 'Called last week',
      health: 'warning',
      channel: 'SMS',
    },
    {
      id: 'q-gen-17',
      customerId: 'cust-gen-19',
      customerName: 'Asad Raza',
      phone: '+92 329 2345677',
      reason: 'Inactivity Warning (PKR 4,600)',
      dueDays: 10,
      lastAction: 'No outreach',
      health: 'warning',
      channel: 'WhatsApp',
    },
    {
      id: 'q-gen-18',
      customerId: 'cust-gen-20',
      customerName: 'Sadia Kamal',
      phone: '+92 330 2469134',
      reason: 'Failed Online Transfer Re-Verify (PKR 6,300)',
      dueDays: 13,
      lastAction: 'WhatsApp sent 2 days ago',
      health: 'warning',
      channel: 'Call',
    },
    {
      id: 'q-gen-19',
      customerId: 'cust-gen-21',
      customerName: 'Junaid Shah',
      phone: '+92 331 2592590',
      reason: 'Inactivity Warning (16 days)',
      dueDays: 16,
      lastAction: 'Called last week',
      health: 'warning',
      channel: 'SMS',
    },
    {
      id: 'q-gen-20',
      customerId: 'cust-gen-22',
      customerName: 'Farah Naz',
      phone: '+92 332 2716047',
      reason: 'Repeat Order Reminder Due (PKR 9,700)',
      dueDays: 19,
      lastAction: 'No outreach',
      health: 'warning',
      channel: 'WhatsApp',
    },
    {
      id: 'q-gen-21',
      customerId: 'cust-gen-23',
      customerName: 'Waqar Younis',
      phone: '+92 333 2839504',
      reason: 'Buying Pattern Drop Detected (PKR 11,400)',
      dueDays: 0,
      lastAction: 'WhatsApp sent 2 days ago',
      health: 'warning',
      channel: 'Call',
    },
    {
      id: 'q-gen-22',
      customerId: 'cust-gen-24',
      customerName: 'Komal Ahmed',
      phone: '+92 334 2962960',
      reason: 'Pending Invoice Follow-up (PKR 13,100)',
      dueDays: 3,
      lastAction: 'Called last week',
      health: 'warning',
      channel: 'SMS',
    },
    {
      id: 'q-gen-23',
      customerId: 'cust-gen-25',
      customerName: 'Shahid Mehmood',
      phone: '+92 335 3086417',
      reason: 'Immediate RM Intervention Needed (PKR 14,800)',
      dueDays: 6,
      lastAction: 'No outreach',
      health: 'warning',
      channel: 'WhatsApp',
    },
    {
      id: 'q-gen-24',
      customerId: 'cust-gen-26',
      customerName: 'Beenish Riaz',
      phone: '+92 336 3209874',
      reason: 'Inactivity Warning (9 days)',
      dueDays: 9,
      lastAction: 'WhatsApp sent 2 days ago',
      health: 'warning',
      channel: 'Call',
    },
    {
      id: 'q-gen-25',
      customerId: 'cust-gen-27',
      customerName: 'Daniyal Haider',
      phone: '+92 337 3333330',
      reason: 'Inactivity Warning (PKR 18,200)',
      dueDays: 12,
      lastAction: 'Called last week',
      health: 'warning',
      channel: 'SMS',
    },
    {
      id: 'q-gen-26',
      customerId: 'cust-gen-28',
      customerName: 'Anum Zubair',
      phone: '+92 338 3456787',
      reason: 'Failed Online Transfer Re-Verify (PKR 19,900)',
      dueDays: 15,
      lastAction: 'No outreach',
      health: 'warning',
      channel: 'WhatsApp',
    },
    {
      id: 'q-gen-27',
      customerId: 'cust-gen-29',
      customerName: 'Rizwan Saeed',
      phone: '+92 339 3580244',
      reason: 'High-value customer — re-engage',
      dueDays: 18,
      lastAction: 'WhatsApp sent 2 days ago',
      health: 'warning',
      channel: 'Call',
    },
    {
      id: 'q-gen-28',
      customerId: 'cust-gen-30',
      customerName: 'Lubna Khalid',
      phone: '+92 340 3703701',
      reason: 'Repeat Order Reminder Due (PKR 23,300)',
      dueDays: 21,
      lastAction: 'Called last week',
      health: 'warning',
      channel: 'SMS',
    },
  ]);

  const [commLogs, setCommLogs] = useState<CommunicationLog[]>([
    {
      id: 'log-1',
      customerId: 'cust-riaz',
      sender: 'Store',
      type: 'WhatsApp',
      content: 'Salam Riaz Sahib, kaafi din se mulaqat nahi hui. Aaj kuch khaas offers hain — zaroor tashreef laaiye. Shukriya.',
      timestamp: 'Oct 21, 2023 11:00 AM',
    },
    {
      id: 'log-2',
      customerId: 'cust-riaz',
      sender: 'Customer',
      type: 'WhatsApp',
      content: 'Walaikum salam, Ahmed sahib. I am out of Karachi, will return on Wednesday and clear it. Please keep my ledger updated.',
      timestamp: 'Oct 21, 2023 02:30 PM',
    },
    {
      id: 'log-3',
      customerId: 'cust-riaz',
      sender: 'Store',
      type: 'Call',
      content: 'Call made to Riaz Ahmed. He confirmed he is returning tomorrow and will send his manager with the cash payment.',
      timestamp: 'Oct 22, 2023 04:00 PM',
    },
    {
      id: 'log-gen-1',
      customerId: 'cust-gen-3',
      sender: 'Store',
      type: 'SMS',
      content: 'Reminder: humare paas aap ke pasandeeda items dobara aa gaye hain. Shukriya.',
      timestamp: 'Oct 22, 2023 11:00 AM',
    },
    {
      id: 'log-gen-2',
      customerId: 'cust-gen-10',
      sender: 'Store',
      type: 'WhatsApp',
      content: 'Assalam o Alaikum, fresh stock arrived at discount today. Let us know for delivery. Shukriya.',
      timestamp: 'Oct 23, 2023 10:30 AM',
    },
    {
      id: 'log-gen-3',
      customerId: 'cust-gen-17',
      sender: 'Store',
      type: 'Call',
      content: 'Salam, this is PSO SME. Just checking in — humare latest offers aap ka intezaar kar rahe hain. Shukriya.',
      timestamp: 'Oct 24, 2023 9:00 AM',
    },
    {
      id: 'log-gen-4',
      customerId: 'cust-gen-24',
      sender: 'Store',
      type: 'SMS',
      content: 'Salam, we missed your regular order this week. Shall we arrange your usual items? Shukriya.',
      timestamp: 'Oct 25, 2023 16:30 AM',
    },
  ]);

  const [inventory, setInventory] = useState<StockItem[]>([
    // Dairy & beverages — Sindh Dairy Suppliers
    { sku: 'MILK-1L', product: 'Nestle Milkpak 1L', category: 'Dairy', current: 42, reorder: 30, stockIn: 120, stockOut: 78, route: 'Clifton Route', supplierId: 'sup-dairy' },
    { sku: 'CREAM-200', product: 'Olpers Cream 200ml', category: 'Dairy', current: 18, reorder: 15, stockIn: 60, stockOut: 42, route: 'Clifton Route', supplierId: 'sup-dairy' },
    { sku: 'WATER-1.5L', product: 'Mineral Water 1.5L', category: 'Beverages', current: 30, reorder: 24, stockIn: 96, stockOut: 66, route: 'DHA Route', supplierId: 'sup-dairy' },
    // Grocery & household — City Wholesale Mart
    { sku: 'OIL-5L', product: 'Cooking Oil 5L', category: 'Grocery', current: 4, reorder: 12, stockIn: 24, stockOut: 20, route: 'Gulshan Route', supplierId: 'sup-general' },
    { sku: 'SUGAR-1K', product: 'Sugar 1kg', category: 'Grocery', current: 22, reorder: 20, stockIn: 80, stockOut: 58, route: 'DHA Route', supplierId: 'sup-general' },
    { sku: 'TEA-475', product: 'Tapal Danedar 475g', category: 'Grocery', current: 3, reorder: 10, stockIn: 36, stockOut: 33, route: 'Nazimabad Route', supplierId: 'sup-general' },
    { sku: 'SURF-1K', product: 'Surf Excel 1kg', category: 'Household', current: 14, reorder: 12, stockIn: 40, stockOut: 26, route: 'Saddar Route', supplierId: 'sup-general' },
    // Grains & pulses — Al-Madina Grain Traders
    { sku: 'RICE-25', product: 'Basmati Rice 25kg', category: 'Grocery', current: 8, reorder: 15, stockIn: 40, stockOut: 32, route: 'Saddar Route', supplierId: 'sup-grain' },
    { sku: 'FLOUR-10', product: 'Wheat Flour 10kg', category: 'Grocery', current: 6, reorder: 15, stockIn: 30, stockOut: 24, route: 'Korangi Route', supplierId: 'sup-grain' },
    { sku: 'GHEE-5K', product: 'Ghee 5kg', category: 'Grocery', current: 0, reorder: 8, stockIn: 16, stockOut: 16, route: 'Korangi Route', supplierId: 'sup-grain' },
    // Spices — Karachi Spice Co.
    { sku: 'MASALA-BIRYANI', product: 'Shan Biryani Masala 50g', category: 'Spices', current: 25, reorder: 20, stockIn: 80, stockOut: 55, route: 'PECHS Route', supplierId: 'sup-spice' },
    { sku: 'CHILLI-1K', product: 'Red Chilli Powder 1kg', category: 'Spices', current: 9, reorder: 10, stockIn: 30, stockOut: 21, route: 'PECHS Route', supplierId: 'sup-spice' },
    { sku: 'GARAM-MASALA', product: 'National Garam Masala 200g', category: 'Spices', current: 16, reorder: 12, stockIn: 36, stockOut: 20, route: 'PECHS Route', supplierId: 'sup-spice' },
    // Snacks & confectionery — Metro Snacks & Confectionery
    { sku: 'CHIPS-FP', product: 'Lays Chips Family Pack', category: 'Snacks', current: 11, reorder: 15, stockIn: 50, stockOut: 39, route: 'Malir Route', supplierId: 'sup-snacks' },
    { sku: 'CADBURY-DM', product: 'Cadbury Dairy Milk', category: 'Snacks', current: 28, reorder: 20, stockIn: 70, stockOut: 42, route: 'Malir Route', supplierId: 'sup-snacks' },
    { sku: 'COLA-1.5L', product: 'Coca Cola 1.5L', category: 'Beverages', current: 19, reorder: 18, stockIn: 60, stockOut: 41, route: 'North Nazimabad Route', supplierId: 'sup-snacks' },
    { sku: 'BISC-AST', product: 'Biscuits Assorted', category: 'Snacks', current: 0, reorder: 10, stockIn: 20, stockOut: 20, route: 'Gulistan-e-Johar Route', supplierId: 'sup-snacks' },
  ]);

  const [stockMovements, setStockMovements] = useState<StockMovement[]>([
    { id: 'MOV-1001', sku: 'RICE-25', type: 'Restock', quantity: 12, date: isoDaysAgo(6), note: 'Purchased from Al-Madina Grain Traders', reference: 'PINV-1001' },
    { id: 'MOV-1002', sku: 'MILK-1L', type: 'Restock', quantity: 24, date: isoDaysAgo(3), note: 'Purchased from Sindh Dairy Suppliers', reference: 'PINV-1002' },
    { id: 'MOV-1003', sku: 'OIL-5L', type: 'Sale', quantity: -6, date: isoDaysAgo(2), note: 'Sold to walk-in customers' },
    { id: 'MOV-1004', sku: 'TEA-475', type: 'Sale', quantity: -4, date: isoDaysAgo(1), note: 'Sold to walk-in customers' },
    { id: 'MOV-1005', sku: 'SUGAR-1K', type: 'Adjustment', quantity: -2, date: isoDaysAgo(4), note: 'Damaged packaging written off' },
    { id: 'MOV-1006', sku: 'FLOUR-10', type: 'Restock', quantity: 8, date: isoDaysAgo(6), note: 'Purchased from Al-Madina Grain Traders', reference: 'PINV-1001' },
    { id: 'MOV-1007', sku: 'GHEE-5K', type: 'Restock', quantity: 10, date: isoDaysAgo(18), note: 'Purchased from Al-Madina Grain Traders', reference: 'PINV-1010' },
    { id: 'MOV-1008', sku: 'GHEE-5K', type: 'Sale', quantity: -10, date: isoDaysAgo(2), note: 'Sold out during weekend rush' },
    { id: 'MOV-1009', sku: 'CREAM-200', type: 'Restock', quantity: 25, date: isoDaysAgo(3), note: 'Purchased from Sindh Dairy Suppliers', reference: 'PINV-1002' },
    { id: 'MOV-1010', sku: 'WATER-1.5L', type: 'Restock', quantity: 30, date: isoDaysAgo(12), note: 'Purchased from Sindh Dairy Suppliers', reference: 'PINV-1009' },
    { id: 'MOV-1011', sku: 'MASALA-BIRYANI', type: 'Restock', quantity: 40, date: isoDaysAgo(10), note: 'Purchased from Karachi Spice Co.', reference: 'PINV-1004' },
    { id: 'MOV-1012', sku: 'CHILLI-1K', type: 'Restock', quantity: 15, date: isoDaysAgo(10), note: 'Purchased from Karachi Spice Co.', reference: 'PINV-1004' },
    { id: 'MOV-1013', sku: 'GARAM-MASALA', type: 'Restock', quantity: 20, date: isoDaysAgo(10), note: 'Purchased from Karachi Spice Co.', reference: 'PINV-1004' },
    { id: 'MOV-1014', sku: 'SURF-1K', type: 'Restock', quantity: 20, date: isoDaysAgo(1), note: 'Purchased from City Wholesale Mart', reference: 'PINV-1003' },
    { id: 'MOV-1015', sku: 'CHIPS-FP', type: 'Restock', quantity: 26, date: isoDaysAgo(5), note: 'Purchased from Metro Snacks & Confectionery', reference: 'PINV-1005' },
    { id: 'MOV-1016', sku: 'CADBURY-DM', type: 'Restock', quantity: 30, date: isoDaysAgo(5), note: 'Purchased from Metro Snacks & Confectionery', reference: 'PINV-1005' },
    { id: 'MOV-1017', sku: 'COLA-1.5L', type: 'Restock', quantity: 15, date: isoDaysAgo(5), note: 'Purchased from Metro Snacks & Confectionery', reference: 'PINV-1005' },
    { id: 'MOV-1018', sku: 'BISC-AST', type: 'Restock', quantity: 25, date: isoDaysAgo(15), note: 'Purchased from Metro Snacks & Confectionery', reference: 'PINV-1013' },
    { id: 'MOV-1019', sku: 'BISC-AST', type: 'Sale', quantity: -25, date: isoDaysAgo(2), note: 'Cleared out before Eid rush' },
    { id: 'MOV-1020', sku: 'CHIPS-FP', type: 'Sale', quantity: -15, date: isoDaysAgo(1), note: 'Sold to walk-in customers' },
  ]);

  // --- Actions ---

  const addCustomer = (customerData: Omit<Customer, 'id' | 'lastVisitDays'>): Customer => {
    const newId = `cust-${Math.random().toString(36).substr(2, 9)}`;
    const newCustomer: Customer = {
      ...customerData,
      id: newId,
      lastVisitDays: 0,
      preferredProducts: customerData.preferredProducts ?? [],
    };

    setCustomers((prev) => [...prev, newCustomer]);
    return newCustomer;
  };

  const recordSale = (
    customerId: string,
    items: InvoiceItem[],
    discount: number,
    notes: string
  ): Invoice => {
    const customer = customers.find((c) => c.id === customerId) || {
      id: 'walk-in',
      name: 'Walk-in Customer',
    };

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const grandTotal = subtotal - discount;

    const newInvoiceId = `INV-${Math.floor(Math.random() * 10000 + 3000)}`;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const dueDateStr = dateStr;

    const newInvoice: Invoice = {
      id: newInvoiceId,
      customerId: customer.id,
      customerName: customer.name,
      date: dateStr,
      dueDate: dueDateStr,
      amount: grandTotal,
      discount,
      status: 'Paid',
      items,
      notes,
    };

    setInvoices((prev) => [newInvoice, ...prev]);

    // A completed sale counts as a visit — reset recency for that customer.
    if (customer.id !== 'walk-in') {
      setCustomers((prev) =>
        prev.map((c) => (c.id === customer.id ? { ...c, lastVisitDays: 0 } : c))
      );
    }

    return newInvoice;
  };

  const addSupplier = (supplierData: Omit<Supplier, 'id'>): Supplier => {
    const newSupplier: Supplier = {
      ...supplierData,
      id: `sup-${Math.random().toString(36).substr(2, 9)}`,
    };
    setSuppliers((prev) => [...prev, newSupplier]);
    return newSupplier;
  };

  const updateSupplier = (id: string, patch: Partial<Supplier>): Supplier | null => {
    let updated: Supplier | null = null;
    setSuppliers((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        updated = { ...s, ...patch };
        return updated;
      }),
    );
    return updated;
  };

  /** Apply a confirmed (Paid) purchase to inventory: restock the exact SKU
   *  when known, match an existing product of this supplier by name, or
   *  create a new tracked product linked to this supplier. Logs a
   *  Restock movement per line so "View Stock History" stays accurate. */
  const applyPurchaseToInventory = (supplier: Supplier, items: InvoiceItem[], invoiceId: string) => {
    const resolved = items.map((item) => {
      if (item.sku) return { item, sku: item.sku, isNew: false };
      const existing = inventory.find(
        (s) => s.supplierId === supplier.id && s.product.toLowerCase() === item.name.toLowerCase(),
      );
      if (existing) return { item, sku: existing.sku, isNew: false };
      const newSku = `SKU-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 100)}`;
      return { item, sku: newSku, isNew: true };
    });

    setInventory((prev) => {
      let next = prev;
      for (const { item, sku, isNew } of resolved) {
        if (isNew) {
          next = [
            ...next,
            {
              sku,
              product: item.name,
              category: supplier.category,
              current: item.quantity,
              reorder: Math.max(5, Math.ceil(item.quantity * 0.25)),
              stockIn: item.quantity,
              stockOut: 0,
              route: '—',
              supplierId: supplier.id,
            },
          ];
        } else {
          next = next.map((s) =>
            s.sku === sku
              ? {
                  ...s,
                  current: s.current + item.quantity,
                  stockIn: s.stockIn + item.quantity,
                  // First purchase from a supplier establishes the preferred
                  // supplier for a previously-unlinked product.
                  supplierId: s.supplierId ?? supplier.id,
                }
              : s,
          );
        }
      }
      return next;
    });

    setStockMovements((prev) => [
      ...resolved.map(({ item, sku }) => ({
        id: `MOV-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        sku,
        type: 'Restock' as const,
        quantity: item.quantity,
        date: new Date().toISOString().split('T')[0],
        note: `Purchased from ${supplier.name}`,
        reference: invoiceId,
      })),
      ...prev,
    ]);
  };

  const recordPurchase = (
    supplierId: string,
    items: InvoiceItem[],
    discount: number,
    notes: string,
    opts?: { status?: 'Draft' | 'Paid'; invoiceNumber?: string; date?: string }
  ): SupplierInvoice => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) throw new Error('Supplier not found');

    const status = opts?.status ?? 'Paid';
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const grandTotal = subtotal - discount;

    const newInvoiceId = `PINV-${Math.floor(Math.random() * 10000 + 2000)}`;
    const dateStr = opts?.date ?? new Date().toISOString().split('T')[0];

    const newPurchase: SupplierInvoice = {
      id: newInvoiceId,
      supplierId: supplier.id,
      supplierName: supplier.name,
      date: dateStr,
      amount: grandTotal,
      discount,
      status,
      invoiceNumber: opts?.invoiceNumber,
      items,
      notes,
    };

    setSupplierInvoices((prev) => [newPurchase, ...prev]);

    // A draft purchase hasn't been received yet — stock only moves once it's
    // confirmed (here immediately, or later via confirmDraftPurchase).
    if (status === 'Paid') {
      applyPurchaseToInventory(supplier, items, newInvoiceId);
    }

    return newPurchase;
  };

  /** Confirm a previously drafted purchase: flips it to Paid and applies the
   *  stock movement that was deferred when it was saved as a draft. */
  const confirmDraftPurchase = (invoiceId: string): SupplierInvoice | null => {
    const draft = supplierInvoices.find((inv) => inv.id === invoiceId && inv.status === 'Draft');
    if (!draft) return null;
    const supplier = suppliers.find((s) => s.id === draft.supplierId);
    if (!supplier) return null;

    const confirmed: SupplierInvoice = { ...draft, status: 'Paid' };
    setSupplierInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? confirmed : inv)));
    applyPurchaseToInventory(supplier, draft.items, draft.id);
    return confirmed;
  };

  const updateCustomer = (id: string, patch: Partial<Customer>): Customer | null => {
    let updated: Customer | null = null;
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, ...patch };
        return updated;
      }),
    );
    return updated;
  };

  const recordStockIn = (sku: string, quantity: number): StockItem | null => {
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    let updated: StockItem | null = null;
    setInventory((prev) =>
      prev.map((item) => {
        if (item.sku !== sku) return item;
        updated = { ...item, current: item.current + quantity, stockIn: item.stockIn + quantity };
        return updated;
      }),
    );
    return updated;
  };

  const addInventoryItem = (item: Omit<StockItem, 'stockIn' | 'stockOut'>): StockItem => {
    const cleanName = item.product.trim().toLowerCase();
    let result: StockItem = { ...item, stockIn: item.current, stockOut: 0 };
    setInventory((prev) => {
      const existing = prev.find((entry) => entry.product.trim().toLowerCase() === cleanName);
      if (!existing) return [...prev, result];

      result = {
        ...existing,
        current: existing.current + item.current,
        stockIn: existing.stockIn + item.current,
        reorder: existing.reorder || item.reorder,
      };
      return prev.map((entry) => (entry.sku === existing.sku ? result : entry));
    });
    return result;
  };

  /** Edit a product's metadata (name, category, reorder level, preferred
   *  supplier). Does not touch stock levels — that's restock/adjust's job. */
  const updateInventoryItem = (sku: string, patch: Partial<StockItem>): StockItem | null => {
    let updated: StockItem | null = null;
    setInventory((prev) =>
      prev.map((item) => {
        if (item.sku !== sku) return item;
        updated = { ...item, ...patch };
        return updated;
      }),
    );
    return updated;
  };

  /** Manual stock correction (damage, recount, write-off) — independent of
   *  any purchase, logged as an Adjustment movement. */
  const adjustStock = (sku: string, delta: number, reason: string): StockItem | null => {
    if (!Number.isFinite(delta) || delta === 0) return null;
    let updated: StockItem | null = null;
    setInventory((prev) =>
      prev.map((item) => {
        if (item.sku !== sku) return item;
        updated = { ...item, current: Math.max(0, item.current + delta) };
        return updated;
      }),
    );
    if (updated) {
      setStockMovements((prev) => [
        {
          id: `MOV-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
          sku,
          type: 'Adjustment',
          quantity: delta,
          date: new Date().toISOString().split('T')[0],
          note: reason || 'Manual adjustment',
        },
        ...prev,
      ]);
    }
    return updated;
  };

  const getCommTimestamp = () => {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }) + ' ' + now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const sendWhatsAppReminder = (
    customerId: string,
    messageContent: string,
    type: 'WhatsApp' | 'SMS' | 'Call' = 'WhatsApp'
  ) => {
    // Adds message log to customer communication history
    const newLog: CommunicationLog = {
      id: `log-${Math.random()}`,
      customerId,
      sender: 'Store',
      type,
      content: messageContent,
      timestamp: getCommTimestamp(),
    };

    setCommLogs((prev) => [...prev, newLog]);

    // Update queue to show message sent
    setConnectQueue((prev) =>
      prev.map((item) =>
        item.customerId === customerId
          ? { ...item, lastAction: `${type} sent just now` }
          : item
      )
    );
  };

  const recordCustomerReply = (
    customerId: string,
    messageContent: string,
    type: 'WhatsApp' | 'SMS' | 'Call' = 'WhatsApp'
  ) => {
    const newLog: CommunicationLog = {
      id: `log-${Math.random()}`,
      customerId,
      sender: 'Customer',
      type,
      content: messageContent,
      timestamp: getCommTimestamp(),
    };

    setCommLogs((prev) => [...prev, newLog]);

    setConnectQueue((prev) =>
      prev.map((item) =>
        item.customerId === customerId
          ? { ...item, lastAction: `${type} reply just now` }
          : item
      )
    );
  };

  return (
    <AppContext.Provider
      value={{
        customers,
        invoices,
        suppliers,
        supplierInvoices,
        stockMovements,
        notifications,
        connectQueue,
        commLogs,
        inventory,
        addCustomer,
        updateCustomer,
        recordSale,
        addSupplier,
        updateSupplier,
        recordPurchase,
        confirmDraftPurchase,
        recordStockIn,
        addInventoryItem,
        updateInventoryItem,
        adjustStock,
        sendWhatsAppReminder,
        recordCustomerReply,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppContextProvider');
  }
  return context;
};
