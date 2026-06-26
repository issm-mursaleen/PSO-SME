'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { sendChatToBackend, type ChatResponse } from '@/lib/api';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  type: string;
  channel: string;
  neighborhood: string;
  address: string;
  creditLimit: number;
  balance: number;
  status: 'Active' | 'Inactive';
  notes: string;
  healthScore: number;
  lastVisitDays: number;
  preferredProducts?: { name: string; pct: number }[];
}

export interface InvoiceItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  dueDate: string;
  amount: number;
  discount: number;
  status: 'Paid' | 'Unpaid' | 'Partial' | 'Overdue';
  paymentType: 'Cash' | 'Udhar' | 'Partial';
  items: InvoiceItem[];
  notes: string;
}

export interface Transaction {
  id: string;
  customerId: string;
  customerName: string;
  type: 'Credit Sale' | 'Repayment' | 'Opening Balance';
  amount: number;
  date: string;
  ref: string;
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

export interface AlaraChatMessage {
  id: string;
  sender: 'user' | 'alara';
  text: string;
  cardType?: 'metric' | 'confirmation' | 'invoice' | 'sale_confirmation' | 'customer_confirmation';
  cardData?: any;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: AlaraChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface AppContextType {
  customers: Customer[];
  invoices: Invoice[];
  transactions: Transaction[];
  notifications: Notification[];
  connectQueue: ConnectQueueItem[];
  commLogs: CommunicationLog[];
  chatThreads: ChatThread[];
  activeChatId: string;
  chatMessages: AlaraChatMessage[];
  addCustomer: (customer: Omit<Customer, 'id' | 'healthScore' | 'lastVisitDays'>) => Customer;
  recordSale: (
    customerId: string,
    paymentType: 'Cash' | 'Udhar' | 'Partial',
    items: InvoiceItem[],
    discount: number,
    notes: string,
    amountPaid: number
  ) => Invoice;
  recordPayment: (customerId: string, amount: number) => void;
  sendChatMessage: (text: string) => void;
  startNewChat: () => void;
  selectChatThread: (threadId: string) => void;
  confirmChatSale: (messageId: string) => void;
  confirmChatCustomer: (messageId: string) => Customer | null;
  sendWhatsAppReminder: (customerId: string, messageContent: string, type?: 'WhatsApp' | 'SMS' | 'Call') => void;
  recordCustomerReply: (customerId: string, messageContent: string, type?: 'WhatsApp' | 'SMS' | 'Call') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const CHAT_CACHE_KEY = 'alara-chat-cache-v1';

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
      creditLimit: 50000,
      balance: 15000,
      status: 'Active',
      notes: 'Owes PKR 15,000 for 18 days. Exceeded credit limit.',
      healthScore: 45,
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
      creditLimit: 20000,
      balance: 0,
      status: 'Active',
      notes: 'Has not purchased in 9 days. Usually visits every 4 days.',
      healthScore: 78,
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
      creditLimit: 100000,
      balance: 4500,
      status: 'Active',
      notes: 'Invoice #INV-2041 due tomorrow.',
      healthScore: 92,
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
      creditLimit: 80000,
      balance: 12000,
      status: 'Active',
      notes: 'Payment failed for online transfer.',
      healthScore: 60,
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
      creditLimit: 30000,
      balance: 8500,
      status: 'Active',
      notes: 'Regular udhar customer. Prefers short WhatsApp updates.',
      healthScore: 69,
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
      creditLimit: 20000,
      balance: 0,
      status: 'Active',
      notes: 'Active account, last visit 0 days ago.',
      healthScore: 82,
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
      creditLimit: 30000,
      balance: 3700,
      status: 'Active',
      notes: 'Owes PKR 3,700. Last seen 3 days ago.',
      healthScore: 59,
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
      creditLimit: 40000,
      balance: 5400,
      status: 'Active',
      notes: 'Owes PKR 5,400. Last seen 6 days ago.',
      healthScore: 60,
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
      creditLimit: 50000,
      balance: 7100,
      status: 'Active',
      notes: 'Owes PKR 7,100. Last seen 9 days ago.',
      healthScore: 61,
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
      creditLimit: 60000,
      balance: 8800,
      status: 'Active',
      notes: 'Owes PKR 8,800. Last seen 12 days ago.',
      healthScore: 62,
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
      creditLimit: 70000,
      balance: 0,
      status: 'Active',
      notes: 'Active account, last visit 15 days ago.',
      healthScore: 63,
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
      creditLimit: 80000,
      balance: 12200,
      status: 'Active',
      notes: 'Owes PKR 12,200. Last seen 18 days ago.',
      healthScore: 64,
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
      creditLimit: 90000,
      balance: 13900,
      status: 'Active',
      notes: 'Owes PKR 13,900. Last seen 21 days ago.',
      healthScore: 65,
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
      creditLimit: 20000,
      balance: 15600,
      status: 'Active',
      notes: 'Owes PKR 15,600. Last seen 2 days ago.',
      healthScore: 66,
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
      creditLimit: 30000,
      balance: 17300,
      status: 'Active',
      notes: 'Owes PKR 17,300. Last seen 5 days ago.',
      healthScore: 67,
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
      creditLimit: 40000,
      balance: 0,
      status: 'Active',
      notes: 'Active account, last visit 8 days ago.',
      healthScore: 68,
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
      creditLimit: 50000,
      balance: 20700,
      status: 'Active',
      notes: 'Owes PKR 20,700. Last seen 11 days ago.',
      healthScore: 69,
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
      creditLimit: 60000,
      balance: 22400,
      status: 'Active',
      notes: 'Owes PKR 22,400. Last seen 14 days ago.',
      healthScore: 70,
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
      creditLimit: 70000,
      balance: 24100,
      status: 'Active',
      notes: 'Owes PKR 24,100. Last seen 17 days ago.',
      healthScore: 71,
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
      creditLimit: 80000,
      balance: 25800,
      status: 'Active',
      notes: 'Owes PKR 25,800. Last seen 20 days ago.',
      healthScore: 72,
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
      creditLimit: 90000,
      balance: 0,
      status: 'Active',
      notes: 'Active account, last visit 1 days ago.',
      healthScore: 85,
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
      creditLimit: 20000,
      balance: 29200,
      status: 'Active',
      notes: 'Owes PKR 29,200. Last seen 4 days ago.',
      healthScore: 44,
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
      creditLimit: 30000,
      balance: 2900,
      status: 'Active',
      notes: 'Owes PKR 2,900. Last seen 7 days ago.',
      healthScore: 60,
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
      creditLimit: 40000,
      balance: 4600,
      status: 'Active',
      notes: 'Owes PKR 4,600. Last seen 10 days ago.',
      healthScore: 61,
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
      creditLimit: 50000,
      balance: 6300,
      status: 'Active',
      notes: 'Owes PKR 6,300. Last seen 13 days ago.',
      healthScore: 62,
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
      creditLimit: 60000,
      balance: 0,
      status: 'Active',
      notes: 'Active account, last visit 16 days ago.',
      healthScore: 63,
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
      creditLimit: 70000,
      balance: 9700,
      status: 'Active',
      notes: 'Owes PKR 9,700. Last seen 19 days ago.',
      healthScore: 64,
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
      creditLimit: 80000,
      balance: 11400,
      status: 'Active',
      notes: 'Owes PKR 11,400. Last seen 0 days ago.',
      healthScore: 65,
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
      creditLimit: 90000,
      balance: 13100,
      status: 'Active',
      notes: 'Owes PKR 13,100. Last seen 3 days ago.',
      healthScore: 66,
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
      creditLimit: 20000,
      balance: 14800,
      status: 'Active',
      notes: 'Owes PKR 14,800. Last seen 6 days ago.',
      healthScore: 67,
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
      creditLimit: 30000,
      balance: 0,
      status: 'Active',
      notes: 'Active account, last visit 9 days ago.',
      healthScore: 68,
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
      creditLimit: 40000,
      balance: 18200,
      status: 'Active',
      notes: 'Owes PKR 18,200. Last seen 12 days ago.',
      healthScore: 69,
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
      creditLimit: 50000,
      balance: 19900,
      status: 'Active',
      notes: 'Owes PKR 19,900. Last seen 15 days ago.',
      healthScore: 70,
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
      creditLimit: 60000,
      balance: 21600,
      status: 'Active',
      notes: 'Owes PKR 21,600. Last seen 18 days ago.',
      healthScore: 71,
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
      creditLimit: 70000,
      balance: 23300,
      status: 'Active',
      notes: 'Owes PKR 23,300. Last seen 21 days ago.',
      healthScore: 72,
      lastVisitDays: 21,
    },
  ]);

  const [invoices, setInvoices] = useState<Invoice[]>([
    {
      id: 'INV-2040',
      customerId: 'cust-riaz',
      customerName: 'Riaz Ahmed',
      date: '2023-10-06',
      dueDate: '2023-10-09',
      amount: 15000,
      discount: 0,
      status: 'Overdue',
      paymentType: 'Udhar',
      items: [
        { name: 'Cooking Oil 5L', quantity: 6, unit: 'pcs', price: 2500, total: 15000 },
      ],
      notes: 'Delivered to Clifton residence',
    },
    {
      id: 'INV-2041',
      customerId: 'cust-iqbal',
      customerName: 'Iqbal Confectionary',
      date: '2023-10-23',
      dueDate: '2023-10-24',
      amount: 4500,
      discount: 0,
      status: 'Unpaid',
      paymentType: 'Udhar',
      items: [
        { name: 'Chocolate Box', quantity: 3, unit: 'box', price: 1500, total: 4500 },
      ],
      notes: 'Store pickup',
    },
    {
      id: 'INV-2039',
      customerId: 'cust-malik',
      customerName: 'Malik Store',
      date: '2023-10-22',
      dueDate: '2023-10-22',
      amount: 12000,
      discount: 0,
      status: 'Partial',
      paymentType: 'Partial',
      items: [
        { name: 'Basmati Rice 25kg', quantity: 4, unit: 'bag', price: 3000, total: 12000 },
      ],
      notes: 'Failed online transfer. Only paid cash PKR 5,000.',
    },
  ]);

  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: 'TXN-101',
      customerId: 'cust-riaz',
      customerName: 'Riaz Ahmed',
      type: 'Credit Sale',
      amount: 15000,
      date: '2023-10-06 11:30 AM',
      ref: 'INV-2040',
    },
    {
      id: 'TXN-102',
      customerId: 'cust-malik',
      customerName: 'Malik Store',
      type: 'Credit Sale',
      amount: 12000,
      date: '2023-10-22 04:15 PM',
      ref: 'INV-2039',
    },
    {
      id: 'TXN-103',
      customerId: 'cust-malik',
      customerName: 'Malik Store',
      type: 'Repayment',
      amount: 5000,
      date: '2023-10-22 04:30 PM',
      ref: 'Cash Receipt',
    },
    {
      id: 'TXN-104',
      customerId: 'cust-iqbal',
      customerName: 'Iqbal Confectionary',
      type: 'Credit Sale',
      amount: 4500,
      date: '2023-10-23 09:00 AM',
      ref: 'INV-2041',
    },
  ]);

  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 'ntf-1',
      urgency: 'HIGH',
      customerName: 'Riaz Ahmed',
      description: 'Owes PKR 15,000 for 18 days. Exceeded credit limit.',
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
        { label: 'Call', actionType: 'call' },
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
      reason: '18 Days Overdue Payment',
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
      reason: '18 Days Overdue Payment (PKR 3,700)',
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
      reason: 'Credit Limit Breach Alert (PKR 8,800)',
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
      reason: '18 Days Overdue Payment (PKR 17,300)',
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
      reason: 'Credit Limit Breach Alert (PKR 22,400)',
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
      reason: 'Credit Limit Breach Alert (PKR 29,200)',
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
      reason: '18 Days Overdue Payment (PKR 2,900)',
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
      reason: 'Credit Limit Breach Alert (PKR 21,600)',
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
      content: 'Salam Riaz Sahib, please note that invoice INV-2040 of PKR 15,000 was due on Oct 9. Let us know when we can collect cash or if you can transfer online. Shukriya.',
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
      content: 'Reminder: your invoice is due. Please confirm payment timing. Shukriya.',
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
      content: 'Salam, this is PSO SME. Your pending balance reminder — please clear at your earliest. Shukriya.',
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

  const demoChatMessages: AlaraChatMessage[] = [
    {
      id: 'm-1',
      sender: 'user',
      text: 'Show outstanding credit statistics.',
    },
    {
      id: 'm-2',
      sender: 'alara',
      text: 'Here is your current credit and udhar distribution summary:',
      cardType: 'metric',
      cardData: {
        totalOutstanding: 'PKR 31,500',
        activeDefaulters: 3,
        recoveryRate: '74.2%',
      },
    },
    {
      id: 'm-3',
      sender: 'user',
      text: 'Draft reminder for Riaz Ahmed.',
    },
    {
      id: 'm-4',
      sender: 'alara',
      text: 'Here is the draft reminder. Click "Send" to forward it to Riaz Ahmed on WhatsApp.',
      cardType: 'confirmation',
      cardData: {
        recipientName: 'Riaz Ahmed',
        phoneNumber: '+92 300 9876543',
        message: 'Salam Riaz Sahib, this is a reminder from PSO SME. Your pending balance is PKR 15,000, which has been outstanding for 18 days. Please clear it at your earliest. Shukriya.',
        customerId: 'cust-riaz',
      },
    },
  ];

  const [chatMessages, setChatMessages] = useState<AlaraChatMessage[]>(demoChatMessages);
  const [activeChatId, setActiveChatId] = useState('chat-demo');
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([
    {
      id: 'chat-demo',
      title: 'Outstanding credit stats',
      messages: demoChatMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]);
  const [chatCacheReady, setChatCacheReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_CACHE_KEY);
      if (!raw) {
        setChatCacheReady(true);
        return;
      }

      const cached = JSON.parse(raw) as { threads?: ChatThread[]; activeChatId?: string };
      if (!Array.isArray(cached.threads) || cached.threads.length === 0) {
        setChatCacheReady(true);
        return;
      }

      const activeId = cached.activeChatId && cached.threads.some((thread) => thread.id === cached.activeChatId)
        ? cached.activeChatId
        : cached.threads[0].id;
      const activeThread = cached.threads.find((thread) => thread.id === activeId) || cached.threads[0];

      setChatThreads(cached.threads);
      setActiveChatId(activeId);
      setChatMessages(activeThread.messages);
      setChatCacheReady(true);
    } catch {
      setChatCacheReady(true);
    }
  }, []);

  useEffect(() => {
    if (!chatCacheReady) return;
    setChatThreads((prev) =>
      prev.map((thread) =>
        thread.id === activeChatId
          ? {
              ...thread,
              title: chatMessages.find((msg) => msg.sender === 'user')?.text.slice(0, 64) || 'New chat',
              messages: chatMessages,
              updatedAt: Date.now(),
            }
          : thread
      )
    );
  }, [activeChatId, chatMessages, chatCacheReady]);

  useEffect(() => {
    if (!chatCacheReady) return;
    window.localStorage.setItem(
      CHAT_CACHE_KEY,
      JSON.stringify({ threads: chatThreads, activeChatId })
    );
  }, [activeChatId, chatCacheReady, chatThreads]);

  // --- Actions ---

  const addCustomer = (customerData: Omit<Customer, 'id' | 'healthScore' | 'lastVisitDays'>): Customer => {
    const newId = `cust-${Math.random().toString(36).substr(2, 9)}`;
    const newCustomer: Customer = {
      ...customerData,
      id: newId,
      healthScore: 100, // New customers start with perfect score
      lastVisitDays: 0,
      preferredProducts: [],
    };

    setCustomers((prev) => [...prev, newCustomer]);

    // Also add to transactions if opening balance exists
    if (newCustomer.balance !== 0) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }) + ' ' + now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      setTransactions((prev) => [
        ...prev,
        {
          id: `TXN-${Math.floor(Math.random() * 1000 + 100)}`,
          customerId: newId,
          customerName: newCustomer.name,
          type: 'Opening Balance',
          amount: Math.abs(newCustomer.balance),
          date: dateStr,
          ref: 'Initial Import',
        },
      ]);
    }

    return newCustomer;
  };

  const recordSale = (
    customerId: string,
    paymentType: 'Cash' | 'Udhar' | 'Partial',
    items: InvoiceItem[],
    discount: number,
    notes: string,
    amountPaid: number
  ): Invoice => {
    const customer = customers.find((c) => c.id === customerId) || {
      id: 'walk-in',
      name: 'Walk-in Customer',
      balance: 0,
    };

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const grandTotal = subtotal - discount;
    const unpaidAmount = paymentType === 'Cash' ? 0 : grandTotal - amountPaid;

    const newInvoiceId = `INV-${Math.floor(Math.random() * 10000 + 3000)}`;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const dueDateStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const newInvoice: Invoice = {
      id: newInvoiceId,
      customerId: customer.id,
      customerName: customer.name,
      date: dateStr,
      dueDate: dueDateStr,
      amount: grandTotal,
      discount,
      status: unpaidAmount <= 0 ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Unpaid',
      paymentType,
      items,
      notes,
    };

    setInvoices((prev) => [newInvoice, ...prev]);

    // Update customer balance if not walk-in
    if (customer.id !== 'walk-in' && unpaidAmount > 0) {
      setCustomers((prev) =>
        prev.map((c) => (c.id === customer.id ? { ...c, balance: c.balance + unpaidAmount } : c))
      );
    }

    // Add to transaction log
    const dateStrFull = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }) + ' ' + now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    setTransactions((prev) => {
      const txs = [...prev];
      if (paymentType === 'Udhar' || paymentType === 'Partial') {
        txs.unshift({
          id: `TXN-${Math.floor(Math.random() * 1000 + 100)}`,
          customerId: customer.id,
          customerName: customer.name,
          type: 'Credit Sale',
          amount: grandTotal,
          date: dateStrFull,
          ref: newInvoiceId,
        });
      }
      if (amountPaid > 0) {
        txs.unshift({
          id: `TXN-${Math.floor(Math.random() * 1000 + 100)}`,
          customerId: customer.id,
          customerName: customer.name,
          type: 'Repayment',
          amount: amountPaid,
          date: dateStrFull,
          ref: paymentType === 'Cash' ? newInvoiceId : 'Cash Payment',
        });
      }
      return txs;
    });

    return newInvoice;
  };

  const recordPayment = (customerId: string, amount: number) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;

    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, balance: Math.max(0, c.balance - amount) } : c))
    );

    const now = new Date();
    const dateStrFull = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }) + ' ' + now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const newTxId = `TXN-${Math.floor(Math.random() * 1000 + 100)}`;
    setTransactions((prev) => [
      {
        id: newTxId,
        customerId,
        customerName: customer.name,
        type: 'Repayment',
        amount,
        date: dateStrFull,
        ref: 'Cash Receipt',
      },
      ...prev,
    ]);

    // Resolve invoice payments (simplification: mark overdue or unpaid invoices as paid until amount is exhausted)
    setInvoices((prev) => {
      let remainingAmount = amount;
      return prev.map((inv) => {
        if (inv.customerId === customerId && (inv.status === 'Unpaid' || inv.status === 'Overdue' || inv.status === 'Partial')) {
          if (remainingAmount <= 0) return inv;
          
          const unpaidInvoiceAmt = inv.amount; // simplification
          if (remainingAmount >= unpaidInvoiceAmt) {
            remainingAmount -= unpaidInvoiceAmt;
            return { ...inv, status: 'Paid' };
          } else {
            remainingAmount = 0;
            return { ...inv, status: 'Partial' };
          }
        }
        return inv;
      });
    });

    // Remove high-urgency notifications if balance is cleared
    // or reduce notification count
    setNotifications((prev) =>
      prev.filter((n) => !(n.customerName === customer.name && n.urgency === 'HIGH' && amount >= 12000))
    );

    // Also remove from ConnectQueue
    setConnectQueue((prev) =>
      prev.filter((q) => !(q.customerId === customerId && amount >= 10000))
    );
  };

  const createSaleDraftFromText = (text: string): AlaraChatMessage | null => {
    const lower = text.toLowerCase();
    if (!/\b(liya|lia|le liya|saman|kharid|bika|sale|becha)\b/.test(lower)) return null;

    const amountMatch = text.match(/\d[\d,]*/);
    const amount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
    const nameMatch = text.match(/^\s*([a-zA-Z][a-zA-Z\s]+?)\s+(?:ne|nei|nay|ny|ka|ki)\b/i);
    const spokenName = nameMatch?.[1]?.trim() || '';
    const customer = customers.find((entry) => {
      const customerName = entry.name.toLowerCase();
      const query = spokenName.toLowerCase();
      return customerName === query || customerName.includes(query) || query.split(/\s+/).some((part) => part.length > 2 && customerName.includes(part));
    });

    if (!amount || !spokenName) return null;
    if (!customer) {
      return {
        id: `chat-${Math.random()}`,
        sender: 'alara',
        text: `Kaunsa ${spokenName}? Customer list mein exact match nahi mila.`,
      };
    }

    const paymentType: 'Cash' | 'Udhar' | 'Partial' = lower.includes('udhar') ? 'Udhar' : lower.includes('partial') ? 'Partial' : 'Cash';
    const amountPaid = paymentType === 'Cash' ? amount : 0;
    const unpaid = paymentType === 'Cash' ? 0 : amount - amountPaid;
    const balanceAfter = customer.balance + unpaid;

    return {
      id: `chat-${Math.random()}`,
      sender: 'alara',
      text: `${customer.name} ka PKR ${amount.toLocaleString()} sale draft ready hai. Confirm karein to ${paymentType === 'Udhar' ? 'udhar balance update hoga' : 'sale record hogi'}.`,
      cardType: 'sale_confirmation',
      cardData: {
        customer_id: customer.id,
        customer_name: customer.name,
        amount,
        payment_type: paymentType,
        amount_paid: amountPaid,
        balance_before: customer.balance,
        balance_after: balanceAfter,
        item_name: 'Quick sale',
        status: 'pending',
      },
    };
  };

  const confirmChatSale = (messageId: string) => {
    const msg = chatMessages.find((entry) => entry.id === messageId);
    const data = (msg?.cardData ?? {}) as Record<string, unknown>;
    const customerId = String(data.customer_id ?? data.customerId ?? '');
    const amount = Number(data.amount ?? 0);
    const paymentType = (String(data.payment_type ?? data.paymentType ?? 'Cash') as 'Cash' | 'Udhar' | 'Partial');
    const amountPaid = Number(data.amount_paid ?? data.amountPaid ?? (paymentType === 'Cash' ? amount : 0));
    const customer = customers.find((entry) => entry.id === customerId);

    if (!msg || msg.cardType !== 'sale_confirmation' || !customer || amount <= 0) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `chat-${Math.random()}`,
          sender: 'alara',
          text: 'Sale confirm nahi ho saki. Customer aur amount dobara check kar dein.',
        },
      ]);
      return;
    }

    const invoice = recordSale(
      customer.id,
      paymentType,
      [{ name: String(data.item_name ?? 'Quick sale'), quantity: 1, unit: 'item', price: amount, total: amount }],
      0,
      'Recorded via Alara chat confirmation',
      amountPaid,
    );
    const unpaid = paymentType === 'Cash' ? 0 : Math.max(0, amount - amountPaid);
    const balanceAfter = customer.balance + unpaid;

    setChatMessages((prev) => [
      ...prev.map((entry) =>
        entry.id === messageId
          ? {
              ...entry,
              cardData: {
                ...(entry.cardData ?? {}),
                status: 'confirmed',
                invoice_id: invoice.id,
                balance_after: balanceAfter,
              },
            }
          : entry
      ),
      {
        id: `chat-${Math.random()}`,
        sender: 'alara',
        text: paymentType === 'Cash'
          ? `${customer.name} ka Rs ${amount.toLocaleString()} cash sale record ho gaya. Invoice ${invoice.id}.`
          : `${customer.name} ka Rs ${amount.toLocaleString()} udhar likh diya. Baqi ab Rs ${balanceAfter.toLocaleString()}. Invoice ${invoice.id}.`,
        cardType: 'invoice',
        cardData: {
          invoiceId: invoice.id,
          customerName: customer.name,
          amount: `PKR ${amount.toLocaleString()}`,
          date: invoice.date,
          items: [{ name: 'Quick sale', qty: '1 item', price: `PKR ${amount.toLocaleString()}` }],
        },
      },
    ]);
  };

  // Confirm an add-customer draft card: creates the customer, marks the card
  // confirmed, and returns the new record (chat page navigates to its detail).
  const confirmChatCustomer = (messageId: string): Customer | null => {
    const msg = chatMessages.find((entry) => entry.id === messageId);
    const d = (msg?.cardData ?? {}) as Record<string, unknown>;
    if (!msg || msg.cardType !== 'customer_confirmation' || d.status === 'confirmed') return null;

    const newCustomer = addCustomer({
      name: String(d.name ?? 'New Customer'),
      phone: String(d.phone ?? ''),
      type: String(d.type ?? 'Household'),
      channel: 'WhatsApp',
      neighborhood: String(d.area ?? ''),
      address: '',
      creditLimit: 20000,
      balance: 0,
      status: 'Active',
      notes: 'Added via Alara chat',
      preferredProducts: [],
    });

    setChatMessages((prev) => [
      ...prev.map((entry) =>
        entry.id === messageId
          ? { ...entry, cardData: { ...(entry.cardData ?? {}), status: 'confirmed', customer_id: newCustomer.id } }
          : entry,
      ),
      { id: `chat-${Math.random()}`, sender: 'alara', text: `${newCustomer.name} add ho gaya.` },
    ]);
    return newCustomer;
  };

  // Apply a backend chat action to local state so the UI stays in sync with
  // the workflow the backend already executed deterministically.
  const applyChatAction = (res: ChatResponse) => {
    const action = res.action;
    const data = (res.card_data ?? {}) as Record<string, unknown>;
    if (!action) return;
    // Sales & customer-adds go through an explicit confirmation card instead.
    if (action.workflow === 'record_sale' || action.workflow === 'add_customer') return;
    const customerId = (data.customer_id as string) ?? '';
    const amount = Number((action.params as Record<string, unknown>).amount ?? 0);

    if (action.workflow === 'create_invoice' && customerId) {
      // Mirror the backend-generated invoice into the local ledger (as udhar).
      const rawItems = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
      const invItems = rawItems.map((it) => {
        const quantity = Number(it.qty ?? 1);
        const price = Number(it.rate ?? 0);
        return {
          name: String(it.name ?? 'Item'),
          quantity,
          unit: 'item',
          price,
          total: Number(it.total ?? quantity * price),
        };
      });
      if (invItems.length) {
        recordSale(customerId, 'Udhar', invItems, 0, 'Invoice via Alara chat', 0);
      }
      return;
    }

    if (action.workflow === 'record_payment' && customerId && amount > 0) {
      recordPayment(customerId, amount);
    } else if (action.workflow === 'record_sale' && customerId && amount > 0) {
      const pt = ((action.params as Record<string, unknown>).payment_type as 'Cash' | 'Udhar' | 'Partial') || 'Cash';
      recordSale(
        customerId,
        pt,
        [{ name: 'Quick sale', quantity: 1, unit: 'item', price: amount, total: amount }],
        0,
        'Recorded via Alara chat',
        pt === 'Cash' ? amount : 0,
      );
    } else if (action.workflow === 'add_customer') {
      const p = action.params as Record<string, unknown>;
      addCustomer({
        name: (p.name as string) || 'New Customer',
        phone: (p.phone as string) || '',
        type: (p.type as string) || 'Household',
        channel: 'WhatsApp',
        neighborhood: (p.area as string) || '',
        address: '',
        creditLimit: 20000,
        balance: 0,
        status: 'Active',
        notes: 'Added via Alara chat',
        preferredProducts: [],
      });
    }
  };

  const startNewChat = () => {
    const now = Date.now();
    const newThread: ChatThread = {
      id: `chat-thread-${now}`,
      title: 'New chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    setChatThreads((prev) => [newThread, ...prev]);
    setActiveChatId(newThread.id);
    setChatMessages([]);
  };

  const selectChatThread = (threadId: string) => {
    const thread = chatThreads.find((entry) => entry.id === threadId);
    if (!thread) return;

    setActiveChatId(thread.id);
    setChatMessages(thread.messages);
  };

  const sendChatMessage = (text: string) => {
    const userMsg: AlaraChatMessage = {
      id: `chat-${Math.random()}`,
      sender: 'user',
      text,
    };

    setChatMessages((prev) => [...prev, userMsg]);
    const localSaleDraft = createSaleDraftFromText(text);

    // Prior turns (this `chatMessages` closure is the history BEFORE the new
    // message), so Alara remembers earlier chats and resolves follow-ups.
    const history = chatMessages.slice(-12).map((m) => ({
      role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }));

    // Send the live customer roster so the backend can resolve ANY customer the
    // user has (the AppContext is the source of truth, not the backend seed).
    const customerRoster = customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      balance: c.balance,
      creditLimit: c.creditLimit,
      lastVisitDays: c.lastVisitDays,
    }));

    // Primary path: deterministic-workflow backend (OpenAI when configured).
    sendChatToBackend(text, { current_page: 'chat', customers: customerRoster }, history)
      .then((res) => {
        if (localSaleDraft?.cardType === 'sale_confirmation') {
          setChatMessages((prev) => [...prev, localSaleDraft]);
          return;
        }

        applyChatAction(res);
        setChatMessages((prev) => [
          ...prev,
          {
            id: `chat-${Math.random()}`,
            sender: 'alara',
            text: res.text,
            cardType: res.card_type ?? undefined,
            cardData: res.card_data ? { ...res.card_data, status: 'pending' } : undefined,
          },
        ]);
      })
      .catch(() => {
        // Backend unreachable → original offline keyword simulation.
        localSimulatedReply(text);
      });
  };

  // Offline fallback: original keyword-based mock reply.
  const localSimulatedReply = (text: string) => {
    setTimeout(() => {
      const lower = text.toLowerCase();
      let reply: AlaraChatMessage;

      const saleDraft = createSaleDraftFromText(text);
      if (saleDraft) {
        reply = saleDraft;
      } else if (lower.includes('outstanding') || lower.includes('credit') || lower.includes('balance') || lower.includes('udhar')) {
        const total = customers.reduce((sum, c) => sum + c.balance, 0);
        const activeDef = customers.filter((c) => c.balance > 0).length;
        reply = {
          id: `chat-${Math.random()}`,
          sender: 'alara',
          text: `I checked the ledger. You currently have a total outstanding balance of PKR ${total.toLocaleString()}. Here is the breakdown:`,
          cardType: 'metric',
          cardData: {
            totalOutstanding: `PKR ${total.toLocaleString()}`,
            activeDefaulters: activeDef,
            recoveryRate: '78.5%',
          },
        };
      } else if (lower.includes('riaz') || lower.includes('remind')) {
        reply = {
          id: `chat-${Math.random()}`,
          sender: 'alara',
          text: `Here is the drafted reminder. You can send it directly to Riaz Ahmed.`,
          cardType: 'confirmation',
          cardData: {
            recipientName: 'Riaz Ahmed',
            phoneNumber: '+92 300 9876543',
            message: 'Salam Riaz Sahib, this is a reminder from PSO SME. Your pending balance is PKR 15,000, which has been outstanding for 18 days. Please clear it at your earliest. Shukriya.',
            customerId: 'cust-riaz',
          },
        };
      } else if (lower.includes('invoice') || lower.includes('bill')) {
        reply = {
          id: `chat-${Math.random()}`,
          sender: 'alara',
          text: `I've prepared a draft invoice based on your query:`,
          cardType: 'invoice',
          cardData: {
            invoiceId: 'INV-2042',
            customerName: 'Walk-in Customer',
            amount: 'PKR 1,550.00',
            date: 'Oct 24, 2023',
            items: [
              { name: 'Cooking Oil 1L', qty: '5 bag', price: '155.00' },
              { name: 'Basmati Rice 1kg', qty: '5 kg', price: '155.00' },
            ],
          },
        };
      } else {
        reply = {
          id: `chat-${Math.random()}`,
          sender: 'alara',
          text: `Ji, I can help you record sales, view customer ledgers, draft WhatsApp reminders, or answer questions about your shop's revenue trends. What would you like to do?`,
        };
      }

      setChatMessages((prev) => [...prev, reply]);
    }, 1000);
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
        transactions,
        notifications,
        connectQueue,
        commLogs,
        chatThreads,
        activeChatId,
        chatMessages,
        addCustomer,
        recordSale,
        recordPayment,
        sendChatMessage,
        startNewChat,
        selectChatThread,
        confirmChatSale,
        confirmChatCustomer,
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
