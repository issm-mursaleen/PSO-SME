/**
 * Deterministic 2-year historical seed data for the PSO SME frontend.
 * Uses a seeded PRNG (Mulberry32) so the data is identical every reload.
 * Covers June 2024 – June 2026 with Pakistani seasonal patterns.
 */
import type { Invoice, InvoiceItem, SupplierInvoice } from '@/context/AppContext';

// ── Seeded PRNG (Mulberry32) ──────────────────────────────────────────────────
function makePRNG(seed: number) {
  let s = seed >>> 0;
  return {
    next(): number {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    },
    gauss(mean: number, std: number): number {
      // Box-Muller
      const u1 = Math.max(1e-10, this.next());
      const u2 = this.next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + z * std;
    },
    choice<T>(arr: T[]): T {
      return arr[Math.floor(this.next() * arr.length)];
    },
  };
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Seasonality ───────────────────────────────────────────────────────────────
function seasonal(month: number, year: number): number {
  const ramazan: Record<number, number> = { 2024: 3, 2025: 3, 2026: 2 };
  if (month === ramazan[year]) return 1.55;
  if (month === 3 || month === 4) return 1.35;
  if (month === 6 || month === 7 || month === 8) return 1.2;
  if (month === 10 || month === 11) return 1.4;
  if (month === 12) return 0.8;
  if (month === 1) return 0.75;
  return 1.0;
}
function dowMult(weekday: number): number {
  if (weekday === 5) return 0.55; // Friday
  if (weekday === 6) return 0.4;  // Saturday
  if (weekday === 0) return 1.15; // Sunday rebound
  if (weekday === 1) return 1.1;  // Monday
  return 1.0;
}
function growthMult(dayIdx: number): number {
  return 1.0 + 0.2 * (dayIdx / 730);
}

// ── Customer profiles ─────────────────────────────────────────────────────────
interface CustProfile {
  id: string; name: string; type: string;
  avg: number; std: number; vpw: number;
}
const CUST_PROFILES: CustProfile[] = [
  { id: 'cust-riaz',   name: 'Riaz Ahmed',          type: 'Household',        avg: 14000, std: 4000,  vpw: 1.2 },
  { id: 'cust-sana',   name: 'Sana Bibi',           type: 'Household',        avg: 9000,  std: 3000,  vpw: 1.8 },
  { id: 'cust-iqbal',  name: 'Iqbal Confectionary', type: 'Retailer',         avg: 38000, std: 9000,  vpw: 2.5 },
  { id: 'cust-malik',  name: 'Malik Store',         type: 'Wholesaler',       avg: 72000, std: 18000, vpw: 1.5 },
  { id: 'cust-nadeem', name: 'Nadeem Chacha',       type: 'Household',        avg: 7500,  std: 2500,  vpw: 2.2 },
  { id: 'cust-gen-1',  name: 'Ali Khan',            type: 'Household',        avg: 5800,  std: 1800,  vpw: 2.0 },
  { id: 'cust-gen-2',  name: 'Maria Qureshi',       type: 'Retailer',         avg: 28000, std: 7000,  vpw: 1.5 },
  { id: 'cust-gen-3',  name: 'Adeel Butt',          type: 'Wholesaler',       avg: 55000, std: 14000, vpw: 1.0 },
  { id: 'cust-gen-4',  name: 'Fatima Sheikh',       type: 'Hotel / Restaurant', avg: 42000, std: 10000, vpw: 3.5 },
  { id: 'cust-gen-5',  name: 'Bilal Hussain',       type: 'Corporate',        avg: 33000, std: 8000,  vpw: 1.2 },
];

// ── Supplier profiles ─────────────────────────────────────────────────────────
interface SupProfile {
  id: string; name: string; category: string;
  avg: number; std: number; opm: number;
}
const SUP_PROFILES: SupProfile[] = [
  { id: 'sup-grain',   name: 'Al-Madina Grain Traders',      category: 'Grains & Pulses',       avg: 52000, std: 12000, opm: 5 },
  { id: 'sup-spice',   name: 'Karachi Spice Co.',            category: 'Spices',                avg: 19000, std: 5000,  opm: 2 },
  { id: 'sup-dairy',   name: 'Sindh Dairy Suppliers',        category: 'Dairy & Beverages',     avg: 34000, std: 8000,  opm: 8 },
  { id: 'sup-general', name: 'City Wholesale Mart',          category: 'General Goods',         avg: 27000, std: 7000,  opm: 4 },
  { id: 'sup-snacks',  name: 'Metro Snacks & Confectionery', category: 'Snacks & Confectionery', avg: 16000, std: 4000,  opm: 6 },
];

// ── Product catalogs (for realistic line items) ───────────────────────────────
const CUST_PRODUCTS: Record<string, { name: string; unit: string; price: number }[]> = {
  Household: [
    { name: 'Nestle Milkpak 1L',   unit: 'pcs',  price: 320 },
    { name: 'Cooking Oil 5L',      unit: 'tin',  price: 2500 },
    { name: 'Tapal Danedar 475g',  unit: 'pack', price: 1150 },
    { name: 'Sugar 1kg',           unit: 'kg',   price: 165 },
    { name: 'Surf Excel 1kg',      unit: 'pack', price: 580 },
    { name: 'Basmati Rice 5kg',    unit: 'bag',  price: 1350 },
    { name: 'Dettol Soap 90g',     unit: 'pcs',  price: 140 },
    { name: 'Olpers Milk 1L',      unit: 'pcs',  price: 290 },
  ],
  Retailer: [
    { name: 'Lays Chips Family',   unit: 'ctn',  price: 2200 },
    { name: 'Cadbury Dairy Milk',  unit: 'box',  price: 1800 },
    { name: 'Coca Cola 1.5L',      unit: 'crate', price: 2400 },
    { name: 'Tapal Danedar 475g',  unit: 'pack', price: 1150 },
    { name: 'Mineral Water 1.5L',  unit: 'crate', price: 1200 },
    { name: 'Shan Masala',         unit: 'box',  price: 3200 },
    { name: 'Noodles Assorted',    unit: 'ctn',  price: 1750 },
  ],
  Wholesaler: [
    { name: 'Basmati Rice 25kg',   unit: 'bag',  price: 6200 },
    { name: 'Wheat Flour 10kg',    unit: 'bag',  price: 1450 },
    { name: 'Ghee 5kg',            unit: 'tin',  price: 2850 },
    { name: 'Surf Excel',          unit: 'ctn',  price: 3900 },
    { name: 'Sugar 50kg',          unit: 'bag',  price: 8250 },
    { name: 'Cooking Oil 15L',     unit: 'tin',  price: 7200 },
    { name: 'Dal Chana 25kg',      unit: 'bag',  price: 4800 },
  ],
  'Hotel / Restaurant': [
    { name: 'Basmati Rice 25kg',   unit: 'bag',  price: 6200 },
    { name: 'Cooking Oil 5L',      unit: 'tin',  price: 2500 },
    { name: 'Sugar 1kg',           unit: 'kg',   price: 165 },
    { name: 'Tea 900g',            unit: 'pack', price: 980 },
    { name: 'Eggs (30 pcs)',       unit: 'tray', price: 680 },
    { name: 'Tomatoes',            unit: 'kg',   price: 80 },
    { name: 'Onions',              unit: 'kg',   price: 60 },
  ],
  Corporate: [
    { name: 'Mineral Water 1.5L',  unit: 'crate', price: 1250 },
    { name: 'Tea 900g',            unit: 'pack', price: 980 },
    { name: 'Sugar 1kg',           unit: 'kg',   price: 165 },
    { name: 'Biscuits Assorted',   unit: 'box',  price: 1450 },
    { name: 'Nestle Milkpak 1L',   unit: 'pcs',  price: 320 },
    { name: 'Coffee Nescafe',      unit: 'jar',  price: 2400 },
  ],
};

const SUP_PRODUCTS: Record<string, { name: string; unit: string; price: number }[]> = {
  'Grains & Pulses': [
    { name: 'Basmati Rice 25kg',   unit: 'bag',  price: 3200 },
    { name: 'Wheat Flour 50kg',    unit: 'bag',  price: 2800 },
    { name: 'Dal Chana 25kg',      unit: 'bag',  price: 2600 },
    { name: 'Ghee 5kg',            unit: 'tin',  price: 2850 },
    { name: 'Dal Mash 25kg',       unit: 'bag',  price: 5500 },
  ],
  Spices: [
    { name: 'Turmeric Powder 1kg', unit: 'pack', price: 380 },
    { name: 'Coriander Powder 1kg',unit: 'pack', price: 320 },
    { name: 'Red Chilli 500g',     unit: 'pack', price: 280 },
    { name: 'Cumin Seeds 500g',    unit: 'pack', price: 420 },
    { name: 'Garam Masala 1kg',    unit: 'pack', price: 650 },
    { name: 'Shan Biryani Masala', unit: 'ctn',  price: 3200 },
  ],
  'Dairy & Beverages': [
    { name: 'Nestle Milkpak 1L',   unit: 'ctn',  price: 7200 },
    { name: 'Olpers Milk 1L',      unit: 'ctn',  price: 6800 },
    { name: 'Coca Cola 1.5L',      unit: 'crate', price: 2400 },
    { name: 'Pepsi 1.5L',          unit: 'crate', price: 2200 },
    { name: 'Cream 200ml',         unit: 'ctn',  price: 4500 },
    { name: 'Mineral Water 1.5L',  unit: 'crate', price: 1200 },
  ],
  'General Goods': [
    { name: 'Surf Excel 1kg',      unit: 'ctn',  price: 3900 },
    { name: 'Dettol Soap 90g',     unit: 'ctn',  price: 3200 },
    { name: 'Colgate 100ml',       unit: 'ctn',  price: 2800 },
    { name: 'Shampoo Assorted',    unit: 'ctn',  price: 4200 },
    { name: 'Tissue Box',          unit: 'ctn',  price: 1800 },
  ],
  'Snacks & Confectionery': [
    { name: 'Lays Chips Family',   unit: 'ctn',  price: 2200 },
    { name: 'Cadbury Dairy Milk',  unit: 'ctn',  price: 5400 },
    { name: 'Kurkure Assorted',    unit: 'ctn',  price: 1900 },
    { name: 'Biscuits Assorted',   unit: 'ctn',  price: 1450 },
    { name: 'Toffees Bulk',        unit: 'kg',   price: 450 },
  ],
};

// ── Line item builder ─────────────────────────────────────────────────────────
function buildCustomerItems(
  rng: ReturnType<typeof makePRNG>,
  type: string,
  targetAmount: number,
): InvoiceItem[] {
  const catalog = CUST_PRODUCTS[type] ?? CUST_PRODUCTS.Household;
  const numItems = rng.next() < 0.4 ? 1 : rng.next() < 0.6 ? 2 : 3;
  const items: InvoiceItem[] = [];
  let remaining = targetAmount;

  for (let i = 0; i < numItems; i++) {
    const prod = rng.choice(catalog);
    const isLast = i === numItems - 1;
    const share = isLast ? remaining : remaining * (0.3 + rng.next() * 0.5);
    const qty = Math.max(1, Math.round(share / prod.price));
    const total = qty * prod.price;
    items.push({ name: prod.name, quantity: qty, unit: prod.unit, price: prod.price, total });
    remaining -= total;
  }
  return items;
}

function buildSupplierItems(
  rng: ReturnType<typeof makePRNG>,
  category: string,
  targetAmount: number,
): InvoiceItem[] {
  const catalog = SUP_PRODUCTS[category] ?? SUP_PRODUCTS['General Goods'];
  const numItems = rng.next() < 0.2 ? 1 : rng.next() < 0.5 ? 2 : rng.next() < 0.8 ? 3 : 4;
  const items: InvoiceItem[] = [];
  let remaining = targetAmount;

  for (let i = 0; i < numItems; i++) {
    const prod = rng.choice(catalog);
    const isLast = i === numItems - 1;
    const share = isLast ? remaining : remaining * (0.2 + rng.next() * 0.4);
    const qty = Math.max(1, Math.round(share / prod.price));
    const total = qty * prod.price;
    items.push({ name: prod.name, quantity: qty, unit: prod.unit, price: prod.price, total });
    remaining -= total;
  }
  return items;
}

// ── Main generators ───────────────────────────────────────────────────────────
function generateSeedHistory(): {
  invoices: Invoice[];
  supplierInvoices: SupplierInvoice[];
} {
  const rng = makePRNG(42);
  const start = new Date('2024-06-01');
  const end = new Date('2026-06-28');

  const invoices: Invoice[] = [];
  const supplierInvoices: SupplierInvoice[] = [];
  let invNum = 1000;
  let pinvNum = 2000;

  let cur = new Date(start);
  let dayIdx = 0;

  while (cur <= end) {
    const month = cur.getMonth() + 1; // 1-12
    const year = cur.getFullYear();
    const weekday = cur.getDay(); // 0=Sun, 1=Mon, … 6=Sat → PKT: Fri=5, Sat=6
    const sm = seasonal(month, year);
    const dm = dowMult(weekday);
    const gm = growthMult(dayIdx);
    const dateStr = isoDate(cur);

    // ── Customer sales ───────────────────────────────────────────────────────
    for (const cp of CUST_PROFILES) {
      const prob = (cp.vpw / 7) * sm * dm;
      if (rng.next() < prob) {
        const rawAmt = rng.gauss(cp.avg, cp.std) * sm * gm;
        const amount = Math.max(1000, Math.round(rawAmt / 100) * 100);
        invNum++;
        const items = buildCustomerItems(rng, cp.type, amount);
        const actualAmount = items.reduce((s, it) => s + it.total, 0);
        invoices.push({
          id: `INV-${invNum}`,
          customerId: cp.id,
          customerName: cp.name,
          date: dateStr,
          dueDate: dateStr,
          amount: actualAmount,
          discount: 0,
          status: 'Paid',
          items,
          notes: '',
        });
      }
    }

    // ── Supplier purchases (no deliveries on Fri=5 / Sat=6 in JS Sun=0 base) ─
    // JS: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
    const isFriSat = weekday === 5 || weekday === 6;
    if (!isFriSat) {
      for (const sp of SUP_PROFILES) {
        const prob = (sp.opm / 26) * sm * gm;
        if (rng.next() < prob) {
          const rawAmt = rng.gauss(sp.avg, sp.std) * sm * gm;
          const amount = Math.max(5000, Math.round(rawAmt / 500) * 500);
          pinvNum++;
          const items = buildSupplierItems(rng, sp.category, amount);
          const actualAmount = items.reduce((s, it) => s + it.total, 0);
          supplierInvoices.push({
            id: `PINV-${pinvNum}`,
            supplierId: sp.id,
            supplierName: sp.name,
            date: dateStr,
            amount: actualAmount,
            discount: 0,
            status: 'Paid',
            items,
            notes: '',
          });
        }
      }
    }

    cur = addDays(cur, 1);
    dayIdx++;
  }

  return { invoices, supplierInvoices };
}

// Run once at module load — the PRNG is deterministic so this is always identical.
const { invoices: SEED_INVOICES, supplierInvoices: SEED_SUPPLIER_INVOICES } =
  generateSeedHistory();

export { SEED_INVOICES, SEED_SUPPLIER_INVOICES };
