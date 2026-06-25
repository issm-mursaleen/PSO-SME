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
  cardType?: 'metric' | 'confirmation' | 'invoice';
  cardData?: any;
}

interface AppContextType {
  customers: Customer[];
  invoices: Invoice[];
  transactions: Transaction[];
  notifications: Notification[];
  connectQueue: ConnectQueueItem[];
  commLogs: CommunicationLog[];
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
  sendWhatsAppReminder: (customerId: string, messageContent: string, type?: 'WhatsApp' | 'SMS' | 'Call') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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
  ]);

  const [chatMessages, setChatMessages] = useState<AlaraChatMessage[]>([
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
        message: 'Salam Riaz Sahib, this is a reminder from ALARA SME. Your pending balance is PKR 15,000, which has been outstanding for 18 days. Please clear it at your earliest. Shukriya.',
        customerId: 'cust-riaz',
      },
    },
  ]);

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

  // Apply a backend chat action to local state so the UI stays in sync with
  // the workflow the backend already executed deterministically.
  const applyChatAction = (res: ChatResponse) => {
    const action = res.action;
    const data = (res.card_data ?? {}) as Record<string, unknown>;
    if (!action) return;
    const customerId = (data.customer_id as string) ?? '';
    const amount = Number((action.params as Record<string, unknown>).amount ?? 0);

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

  const sendChatMessage = (text: string) => {
    const userMsg: AlaraChatMessage = {
      id: `chat-${Math.random()}`,
      sender: 'user',
      text,
    };

    setChatMessages((prev) => [...prev, userMsg]);

    // Primary path: deterministic-workflow backend (OpenAI when configured).
    sendChatToBackend(text, { current_page: 'chat' })
      .then((res) => {
        applyChatAction(res);
        setChatMessages((prev) => [
          ...prev,
          { id: `chat-${Math.random()}`, sender: 'alara', text: res.text },
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

      if (lower.includes('outstanding') || lower.includes('credit') || lower.includes('balance') || lower.includes('udhar')) {
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
            message: 'Salam Riaz Sahib, this is a reminder from ALARA SME. Your pending balance is PKR 15,000, which has been outstanding for 18 days. Please clear it at your earliest. Shukriya.',
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

  const sendWhatsAppReminder = (
    customerId: string,
    messageContent: string,
    type: 'WhatsApp' | 'SMS' | 'Call' = 'WhatsApp'
  ) => {
    // Adds message log to customer communication history
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }) + ' ' + now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const newLog: CommunicationLog = {
      id: `log-${Math.random()}`,
      customerId,
      sender: 'Store',
      type,
      content: messageContent,
      timestamp: dateStr,
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

  return (
    <AppContext.Provider
      value={{
        customers,
        invoices,
        transactions,
        notifications,
        connectQueue,
        commLogs,
        chatMessages,
        addCustomer,
        recordSale,
        recordPayment,
        sendChatMessage,
        sendWhatsAppReminder,
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
