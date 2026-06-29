// Shared preset product catalog — known products with their usual unit price,
// used for autocomplete/autofill on Record Sale + New Invoice, and by Alara's
// create_invoice tool to fill in a price the user didn't state explicitly.

export interface CatalogProduct {
  name: string;
  price: number;
  unit: string;
}

export const PRODUCT_CATALOG: CatalogProduct[] = [
  { name: 'Bread Large', price: 120, unit: 'pcs' },
  { name: 'Milk 1 Litre', price: 260, unit: 'pcs' },
  { name: 'Cooking Oil 1L', price: 155, unit: 'pcs' },
  { name: 'Basmati Rice 10kg', price: 1800, unit: 'bag' },
  { name: 'Basmati Rice 1kg', price: 250, unit: 'kg' },
  { name: 'Dal Chana 1kg', price: 320, unit: 'kg' },
  { name: 'Tapal Danedar 500g', price: 450, unit: 'box' },
  { name: 'Nestle Milkpak', price: 280, unit: 'litre' },
  { name: 'Olpers Cream', price: 160, unit: 'pcs' },
  { name: 'Surf Excel 1kg', price: 650, unit: 'bag' },
  { name: 'Coca Cola 1.5L', price: 150, unit: 'pcs' },
  { name: 'Lays Chips Family Pack', price: 100, unit: 'pcs' },
  { name: 'Sensodyne Toothpaste', price: 220, unit: 'pcs' },
  { name: 'Cadbury Dairy Milk', price: 180, unit: 'pcs' },
];

/** Exact (case-insensitive) match first, then a loose substring match either
 *  way — "milk" finds "Milk 1 Litre", "Milk 1 Litre" finds "milk" queries. */
export function findCatalogProduct(name: string): CatalogProduct | undefined {
  const q = name.trim().toLowerCase();
  if (!q) return undefined;
  const exact = PRODUCT_CATALOG.find((p) => p.name.toLowerCase() === q);
  if (exact) return exact;
  return PRODUCT_CATALOG.find(
    (p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()),
  );
}
