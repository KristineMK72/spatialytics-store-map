'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadState, saveState, sampleState, uid } from '@/lib/storage';
import { geocodeAddress, fetchBuildingFootprint } from '@/lib/geo';

const StoreMapView = dynamic(() => import('@/components/StoreMapView'), { ssr: false });

const TABS = [
  { id: 'stores', label: 'Stores' },
  { id: 'layout', label: 'Layout' },
  { id: 'walk', label: 'Walk / Scan' },
  { id: 'products', label: 'Products' },
  { id: 'map', label: 'Map' },
];

export default function Home() {
  const [tab, setTab] = useState('stores');
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // forms
  const [storeForm, setStoreForm] = useState({
    name: '',
    address: '',
    notes: '',
  });
  const [aisleName, setAisleName] = useState('');
  const [scan, setScan] = useState({ barcode: '', name: '', aisleId: '', notes: '' });
  const [query, setQuery] = useState('');

  useEffect(() => {
    const s = loadState() || sampleState();
    setState(s);
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  const activeStore = useMemo(
    () => state?.stores?.find((s) => s.id === state.activeStoreId) || state?.stores?.[0],
    [state]
  );

  const aisles = useMemo(
    () =>
      (state?.aisles || [])
        .filter((a) => a.storeId === activeStore?.id)
        .sort((a, b) => a.order - b.order),
    [state, activeStore]
  );

  const products = useMemo(
    () => (state?.products || []).filter((p) => p.storeId === activeStore?.id),
    [state, activeStore]
  );

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q))
    );
  }, [products, query]);

  const aisleNameById = useCallback(
    (id) => aisles.find((a) => a.id === id)?.name || '—',
    [aisles]
  );

  function patch(updater) {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return next;
    });
  }

  async function createStore(e) {
    e.preventDefault();
    if (!storeForm.name.trim() || !storeForm.address.trim()) return;
    setBusy(true);
    setMsg('Geocoding address…');
    try {
      const geo = await geocodeAddress(storeForm.address.trim());
      if (!geo) {
        setMsg('No geocode result — try a fuller address (street, city, MN).');
        setBusy(false);
        return;
      }
      setMsg('Looking up building footprint…');
      let footprint = null;
      try {
        footprint = await fetchBuildingFootprint(geo.lat, geo.lon);
      } catch {
        /* optional */
      }
      const id = uid();
      const store = {
        id,
        name: storeForm.name.trim(),
        address: storeForm.address.trim(),
        lat: geo.lat,
        lon: geo.lon,
        footprint,
        notes: storeForm.notes.trim(),
        geocodeDisplay: geo.display,
      };
      patch((s) => ({
        ...s,
        stores: [...s.stores, store],
        activeStoreId: id,
      }));
      setStoreForm({ name: '', address: '', notes: '' });
      setMsg(
        footprint
          ? 'Store saved with OSM building footprint.'
          : 'Store saved (point only — no nearby OSM building found).'
      );
      setTab('layout');
    } catch (err) {
      setMsg(String(err.message || err));
    }
    setBusy(false);
  }

  async function refreshFootprint() {
    if (!activeStore?.lat) return;
    setBusy(true);
    setMsg('Fetching footprint…');
    try {
      const footprint = await fetchBuildingFootprint(activeStore.lat, activeStore.lon, 80);
      patch((s) => ({
        ...s,
        stores: s.stores.map((st) =>
          st.id === activeStore.id ? { ...st, footprint } : st
        ),
      }));
      setMsg(footprint ? 'Footprint updated.' : 'No building polygon found nearby.');
    } catch (err) {
      setMsg(String(err.message || err));
    }
    setBusy(false);
  }

  function addAisle(e) {
    e.preventDefault();
    if (!aisleName.trim() || !activeStore) return;
    const order = aisles.length + 1;
    patch((s) => ({
      ...s,
      aisles: [
        ...s.aisles,
        { id: uid(), storeId: activeStore.id, name: aisleName.trim(), order },
      ],
    }));
    setAisleName('');
  }

  function removeAisle(id) {
    patch((s) => ({
      ...s,
      aisles: s.aisles.filter((a) => a.id !== id),
      products: s.products.map((p) =>
        p.aisleId === id ? { ...p, aisleId: '' } : p
      ),
    }));
  }

  function addScan(e) {
    e.preventDefault();
    if (!activeStore || (!scan.name.trim() && !scan.barcode.trim())) return;
    const aisleId = scan.aisleId || aisles[0]?.id || '';
    patch((s) => ({
      ...s,
      products: [
        {
          id: uid(),
          storeId: activeStore.id,
          aisleId,
          barcode: scan.barcode.trim(),
          name: scan.name.trim() || `Item ${scan.barcode.trim()}`,
          notes: scan.notes.trim(),
          scannedAt: new Date().toISOString(),
        },
        ...s.products,
      ],
    }));
    setScan((prev) => ({ ...prev, barcode: '', name: '', notes: '' }));
    setMsg('Product placed.');
  }

  function deleteProduct(id) {
    patch((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) }));
  }

  function exportCsv() {
    const rows = [
      ['name', 'barcode', 'aisle', 'notes', 'scannedAt'],
      ...products.map((p) => [
        p.name,
        p.barcode,
        aisleNameById(p.aisleId),
        p.notes || '',
        p.scannedAt || '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeStore?.name || 'store').replace(/\s+/g, '-')}-products.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetDemo() {
    const s = sampleState();
    setState(s);
    setMsg('Demo data restored.');
  }

  if (!state) {
    return (
      <div className="main">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>Store Map</h1>
          <p>Footprint → aisles → scan</p>
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`nav-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" className="nav-btn" onClick={resetDemo}>
          Reset demo data
        </button>
      </aside>

      <main className="main">
        <div className="stats">
          <div className="stat">
            <div className="label">Stores</div>
            <div className="value">{state.stores.length}</div>
          </div>
          <div className="stat">
            <div className="label">Aisles</div>
            <div className="value">{aisles.length}</div>
          </div>
          <div className="stat">
            <div className="label">Products</div>
            <div className="value">{products.length}</div>
          </div>
          <div className="stat">
            <div className="label">Active</div>
            <div className="value" style={{ fontSize: '0.95rem' }}>
              {activeStore?.name || '—'}
            </div>
          </div>
        </div>

        {msg && (
          <p className="muted" style={{ marginTop: 0 }}>
            {msg}{' '}
            <button type="button" className="btn btn-sm" onClick={() => setMsg('')}>
              Dismiss
            </button>
          </p>
        )}

        {tab === 'stores' && (
          <>
            <div className="card">
              <h2>Add store (GIS shell)</h2>
              <p className="muted">
                Address is geocoded with OpenStreetMap Nominatim. We then request a nearby{' '}
                <strong>building footprint</strong> from Overpass when available.
              </p>
              <form onSubmit={createStore}>
                <div className="row">
                  <div className="field">
                    <label>Store name</label>
                    <input
                      value={storeForm.name}
                      onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                      placeholder="Lakeside Market"
                      required
                    />
                  </div>
                  <div className="field" style={{ flex: 2 }}>
                    <label>Address</label>
                    <input
                      value={storeForm.address}
                      onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                      placeholder="123 Main St, Brainerd, MN"
                      required
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Notes</label>
                  <input
                    value={storeForm.notes}
                    onChange={(e) => setStoreForm({ ...storeForm, notes: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Working…' : 'Geocode + save store'}
                </button>
              </form>
            </div>

            <div className="card">
              <h2>Your stores</h2>
              {state.stores.length === 0 ? (
                <p className="empty">No stores yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Address</th>
                      <th>Footprint</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.stores.map((st) => (
                      <tr key={st.id}>
                        <td>
                          {st.name}{' '}
                          {st.id === activeStore?.id && <span className="badge">Active</span>}
                        </td>
                        <td className="muted">{st.address}</td>
                        <td>{st.footprint ? 'Yes' : 'Point only'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => {
                              patch((s) => ({ ...s, activeStoreId: st.id }));
                              setMsg(`Active: ${st.name}`);
                            }}
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {activeStore && (
                <div className="row" style={{ marginTop: '0.75rem' }}>
                  <button type="button" className="btn" onClick={refreshFootprint} disabled={busy}>
                    Re-fetch footprint for active store
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'layout' && (
          <div className="card">
            <h2>Aisles / zones — {activeStore?.name || 'select a store'}</h2>
            {!activeStore ? (
              <p className="empty">Select or create a store first.</p>
            ) : (
              <>
                <form onSubmit={addAisle} className="row" style={{ marginBottom: '1rem' }}>
                  <div className="field">
                    <label>New aisle or zone</label>
                    <input
                      value={aisleName}
                      onChange={(e) => setAisleName(e.target.value)}
                      placeholder="Aisle 4 — Frozen"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ alignSelf: 'end' }}>
                    Add
                  </button>
                </form>
                {aisles.length === 0 ? (
                  <p className="muted">No aisles yet — add the path you’ll walk.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {aisles.map((a) => (
                        <tr key={a.id}>
                          <td>{a.order}</td>
                          <td>{a.name}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => removeAisle(a.id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'walk' && (
          <>
            <div className="walk-banner">
              <div>
                <strong>Walk session</strong>
                <div className="muted">
                  Scan or type a product, pick the aisle you’re standing in, save. Repeat down the store.
                </div>
              </div>
              <span className="badge">{activeStore?.name || 'No store'}</span>
            </div>
            <div className="card">
              <h2>Place product</h2>
              {!activeStore || aisles.length === 0 ? (
                <p className="muted">Need an active store and at least one aisle.</p>
              ) : (
                <form onSubmit={addScan}>
                  <div className="aisle-chips">
                    {aisles.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={`chip ${scan.aisleId === a.id ? 'active' : ''}`}
                        onClick={() => setScan({ ...scan, aisleId: a.id })}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                  <div className="row">
                    <div className="field">
                      <label>Barcode (UPC)</label>
                      <input
                        value={scan.barcode}
                        onChange={(e) => setScan({ ...scan, barcode: e.target.value })}
                        placeholder="Scan or type"
                        autoFocus
                      />
                    </div>
                    <div className="field">
                      <label>Product name</label>
                      <input
                        value={scan.name}
                        onChange={(e) => setScan({ ...scan, name: e.target.value })}
                        placeholder="Oat milk 64oz"
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Shelf note</label>
                    <input
                      value={scan.notes}
                      onChange={(e) => setScan({ ...scan, notes: e.target.value })}
                      placeholder="Left side, second shelf"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    Save placement
                  </button>
                </form>
              )}
            </div>
          </>
        )}

        {tab === 'products' && (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>Products in store</h2>
              <button type="button" className="btn" onClick={exportCsv} disabled={!products.length}>
                Export CSV
              </button>
            </div>
            <div className="field">
              <label>Search</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, barcode, note…"
              />
            </div>
            {filteredProducts.length === 0 ? (
              <p className="empty">No products yet — use Walk / Scan.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Barcode</th>
                    <th>Aisle</th>
                    <th>Notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="muted">{p.barcode || '—'}</td>
                      <td>
                        <span className="badge">{aisleNameById(p.aisleId)}</span>
                      </td>
                      <td className="muted">{p.notes || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => deleteProduct(p.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'map' && (
          <div className="card">
            <h2>Outdoor map — {activeStore?.name || '—'}</h2>
            <p className="muted">
              Pin = geocoded address. Cyan polygon = OSM building footprint when found. Indoor product
              positions are aisle-based in this MVP (local coordinates can come next).
            </p>
            <StoreMapView store={activeStore} />
          </div>
        )}
      </main>
    </div>
  );
}
