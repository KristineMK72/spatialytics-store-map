const KEY = 'spatialytics-store-map-v1';

export function loadState() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Sample store near Brainerd for first-run demo */
export function sampleState() {
  const storeId = 'sample-store';
  return {
    stores: [
      {
        id: storeId,
        name: 'Lakeside Market (demo)',
        address: '501 W Washington St, Brainerd, MN',
        lat: 46.358,
        lon: -94.201,
        footprint: null,
        notes: 'Demo store — replace with a real address and Fetch footprint.',
      },
    ],
    activeStoreId: storeId,
    aisles: [
      { id: 'a1', storeId, name: 'Aisle 1 — Produce', order: 1 },
      { id: 'a2', storeId, name: 'Aisle 2 — Dairy', order: 2 },
      { id: 'a3', storeId, name: 'Aisle 3 — Grocery', order: 3 },
      { id: 'a4', storeId, name: 'Endcap — Front', order: 4 },
    ],
    products: [
      {
        id: 'p1',
        storeId,
        aisleId: 'a2',
        barcode: '041220000123',
        name: 'Regional Oat Milk 64oz',
        notes: 'Left side, eye level',
        scannedAt: new Date().toISOString(),
      },
      {
        id: 'p2',
        storeId,
        aisleId: 'a1',
        barcode: '',
        name: 'Local Honeycrisp Apples',
        notes: 'Bin 2',
        scannedAt: new Date().toISOString(),
      },
    ],
  };
}
