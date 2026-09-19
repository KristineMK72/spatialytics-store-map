'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { loadState, saveState, sampleState, uid } from '@/lib/storage';
import { geocodeAddress, fetchBuildingFootprint } from '@/lib/geo';

const StoreMapView = dynamic(() => import('@/components/StoreMapView'), { ssr: false });
const BarcodeScanner = dynamic(() => import('@/components/BarcodeScanner'), { ssr: false });

const TABS = [
  { id: 'stores', label: 'Stores' },
  { id: 'layout', label: 'Layout' },
  { id: 'walk', label: 'Walk / Scan' },
  { id: 'products', label: 'Products' },
  { id: 'map', label: 'Map' },
  { id: 'publish', label: 'Publish' },
];

const emptyStoreForm = {
  name: '',
  address: '',
  city: '',
  state: 'MN',
  postal: '',
  notes: '',
};

export default function Home() {
  const [tab, setTab] = useState('stores');
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [publishUrl, setPublishUrl] = useState('');

  const [storeForm, setStoreForm] = useState(emptyStoreForm);
  const [aisleName, setAisleName] = useState('');
  const [scan, setScan] = useState({ barcode: '', name: '', aisleId: '', notes: '', oos: false });
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

  const onBarcodeScanned = useCallback((code) => {
    setScan((prev) => ({ ...prev, barcode: code }));
    setScannerOpen(false);
    setMsg(`Scanned: ${code} — add a name if you want, then Save placement.`);
  }, []);

  async function createStore(e) {
    e.preventDefault();
    if (!storeForm.name.trim() || !storeForm.address.trim()) return;
    setBusy(true);
    setMsg('Geocoding address…');
    try {
      const street = storeForm.address.trim();
      const geo = await geocodeAddress(street, {
        city: storeForm.city,
        state: storeForm.state || 'MN',
        postal: storeForm.postal,
      });
      if (!geo) {
        setMsg('No geocode result. Add city (e.g. Brainerd) + MN + ZIP.');
        setBusy(false);
        return;
      }
      if (geo.lat < 43.4 || geo.lat > 49.5 || geo.lon < -97.5 || geo.lon > -89.3) {
        setMsg(`Refusing non-MN result: ${geo.display}. Check city/state/ZIP.`);
        setBusy(false);
        return;
      }
      let footprint = null;
      try {
        footprint = await fetchBuildingFootprint(geo.lat, geo.lon);
      } catch {}
      const id = uid();
      const fullAddress = [
        street,
        storeForm.city.trim(),
        [storeForm.state.trim() || 'MN', storeForm.postal.trim()].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', ');
      const store = {
        id,
        name: storeForm.name.trim(),
        address: fullAddress,
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
      setStoreForm(emptyStoreForm);
      setMsg(`Store saved: ${geo.display}`);
      setTab('map');
    } catch (err) {
      setMsg(String(err.message || err));
    }
    setBusy(false);
  }

  async function reGeocodeActive() {
    if (!activeStore) return;
    setBusy(true);
    setMsg('Re-geocoding with Census (MN)…');
    try {
      let street = '12857 County Road 18';
      let city = 'Brainerd';
      let state = 'MN';
      let postal = '56401';
      const raw = (activeStore.address || '').trim();
      const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts[0] && !/colorado|weld/i.test(raw)) {
        street = parts[0].replace(/\bCO\b/g, '').trim() || street;
      }
      if (parts[1] && !/colorado|weld/i.test(parts[1])) city = parts[1];
      const geo = await geocodeAddress(street, { city, state, postal });
      if (!geo) {
        setMsg('Re-geocode failed.');
        setBusy(false);
        return;
      }
      if (geo.lat < 43.4 || geo.lat > 49.5 || geo.lon < -97.5 || geo.lon > -89.3) {
        setMsg(`Still non-MN: ${geo.display}`);
        setBusy(false);
        return;
      }
      let footprint = null;
      try {
        footprint = await fetchBuildingFootprint(geo.lat, geo.lon);
      } catch {}
      const newAddr = `${street}, ${city}, ${state} ${postal}`;
      patch((s) => ({
        ...s,
        stores: s.stores.map((st) =>
          st.id === activeStore.id
            ? { ...st, lat: geo.lat, lon: geo.lon, address: newAddr, footprint, geocodeDisplay: geo.display }
            : st
        ),
      }));
      setMsg(`Fixed: ${geo.display}`);
      setTab('map');
    } catch (err) {
      setMsg(String(err.message || err));
    }
    setBusy(false);
  }

  async function refreshFootprint() {
    if (!activeStore?.lat) return;
    setBusy(true);
    try {
      const footprint = await fetchBuildingFootprint(activeStore.lat, activeStore.lon, 80);
      patch((s) => ({
        ...s,
        stores: s.stores.map((st) => (st.id === activeStore.id ? { ...st, footprint } : st)),
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
      aisles: [...s.aisles, { id: uid(), storeId: activeStore.id, name: aisleName.trim(), order }],
    }));
    setAisleName('');
  }

  function removeAisle(id) {
    patch((s) => ({
      ...s,
      aisles: s.aisles.filter((a) => a.id !== id),
      products: s.products.map((p) => (p.aisleId === id ? { ...p, aisleId: '' } : p)),
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
          oos: !!scan.oos,
          scannedAt: new Date().toISOString(),
        },
        ...s.products,
      ],
    }));
    setScan((prev) => ({ ...prev, barcode: '', name: '', notes: '', oos: false }));
    setMsg('Product placed.');
  }

  function deleteProduct(id) {
    patch((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) }));
  }

  function toggleOos(id) {
    patch((s) => ({
      ...s,
      products: s.products.map((p) => (p.id === id ? { ...p, oos: !p.oos } : p)),
    }));
  }

  async function publishMap() {
    if (!activeStore) return;
    setBusy(true);
    setMsg('Publishing map…');
    try {
      const res = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: activeStore, aisles, products }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Publish failed');
      const full = `${window.location.origin}${j.url}`;
      setPublishUrl(full);
      patch((s) => ({
        ...s,
        stores: s.stores.map((st) =>
          st.id === activeStore.id ? { ...st, publishSlug: j.slug, publishUrl: full } : st
        ),
      }));
      setMsg('Published! Share the customer link.');
    } catch (err) {
      setMsg(String(err.message || err));
    }
    setBusy(false);
  }

  function exportCsv() {
    const rows = [
      ['name', 'barcode', 'aisle', 'notes', 'oos', 'scannedAt'],
      ...products.map((p) => [
        p.name,
        p.barcode,
        aisleNameById(p.aisleId),
        p.notes || '',
        p.oos ? 'yes' : 'no',
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
    setState(sampleState());
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
      {scannerOpen && (
        <BarcodeScanner onScan={onBarcodeScanned} onClose={() => setScannerOpen(false)} />
      )}

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
                Street + <strong>city</strong> + <strong>MN</strong> + ZIP. Census geocoder (server) for rural roads.
              </p>
              <form onSubmit={createStore}>
                <div className="field">
                  <label>Store name</label>
                  <input
                    value={storeForm.name}
                    onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                    placeholder="Corner Store"
                    required
                  />
                </div>
                <div className="field">
                  <label>Street / county road</label>
                  <input
                    value={storeForm.address}
                    onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                    placeholder="12857 County Road 18"
                    required
                  />
                </div>
                <div className="row">
                  <div className="field">
                    <label>City</label>
                    <input
                      value={storeForm.city}
                      onChange={(e) => setStoreForm({ ...storeForm, city: e.target.value })}
                      placeholder="Brainerd"
                    />
                  </div>
                  <div className="field" style={{ maxWidth: 80 }}>
                    <label>State</label>
                    <input
                      value={storeForm.state}
                      onChange={(e) => setStoreForm({ ...storeForm, state: e.target.value })}
                      placeholder="MN"
                    />
                  </div>
                  <div className="field" style={{ maxWidth: 120 }}>
                    <label>ZIP</label>
                    <input
                      value={storeForm.postal}
                      onChange={(e) => setStoreForm({ ...storeForm, postal: e.target.value })}
                      placeholder="56401"
                    />
                  </div>
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
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.stores.map((st) => (
                      <tr key={st.id}>
                        <td>
                          {st.name} {st.id === activeStore?.id && <span className="badge">Active</span>}
                        </td>
                        <td className="muted">{st.address}</td>
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
                  <button type="button" className="btn btn-primary" onClick={reGeocodeActive} disabled={busy}>
                    Fix location (re-geocode MN)
                  </button>
                  <button type="button" className="btn" onClick={refreshFootprint} disabled={busy}>
                    Re-fetch footprint
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'layout' && (
          <div className="card">
            <h2>Aisles — {activeStore?.name || 'select a store'}</h2>
            {activeStore && (
              <form onSubmit={addAisle} className="row" style={{ marginBottom: '1rem' }}>
                <div className="field">
                  <label>New aisle or zone</label>
                  <input value={aisleName} onChange={(e) => setAisleName(e.target.value)} placeholder="Aisle 4 — Frozen" />
                </div>
                <button type="submit" className="btn btn-primary" style={{ alignSelf: 'end' }}>
                  Add
                </button>
              </form>
            )}
            <table>
              <tbody>
                {aisles.map((a) => (
                  <tr key={a.id}>
                    <td>{a.order}</td>
                    <td>{a.name}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => removeAisle(a.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'walk' && (
          <>
            <div className="walk-banner">
              <div>
                <strong>Walk session</strong>
                <div className="muted">Aisle → camera or type → save. Flag OOS for inventory.</div>
              </div>
              <span className="badge">{activeStore?.name || 'No store'}</span>
            </div>
            <div className="card">
              <h2>Place product</h2>
              {activeStore && aisles.length > 0 ? (
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
                  <button type="button" className="btn btn-scan" onClick={() => setScannerOpen(true)}>
                    📷 Scan barcode with camera
                  </button>
                  <div className="row">
                    <div className="field">
                      <label>Barcode</label>
                      <input
                        value={scan.barcode}
                        onChange={(e) => setScan({ ...scan, barcode: e.target.value })}
                        placeholder="Camera or type"
                      />
                    </div>
                    <div className="field">
                      <label>Product name</label>
                      <input
                        value={scan.name}
                        onChange={(e) => setScan({ ...scan, name: e.target.value })}
                        placeholder="Name"
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Shelf note</label>
                    <input
                      value={scan.notes}
                      onChange={(e) => setScan({ ...scan, notes: e.target.value })}
                      placeholder="Left, eye level"
                    />
                  </div>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={!!scan.oos}
                      onChange={(e) => setScan({ ...scan, oos: e.target.checked })}
                    />
                    Out of stock (inventory flag)
                  </label>
                  <button type="submit" className="btn btn-primary">
                    Save placement
                  </button>
                </form>
              ) : (
                <p className="muted">Need store + aisles first.</p>
              )}
            </div>
          </>
        )}

        {tab === 'products' && (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>Products (associate search)</h2>
              <button type="button" className="btn" onClick={exportCsv} disabled={!products.length}>
                Export CSV
              </button>
            </div>
            <div className="field">
              <label>Search</label>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, barcode, aisle…" />
            </div>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Aisle</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name} {p.oos && <span className="badge badge-oos">OOS</span>}
                      <div className="muted">{p.barcode || ''} {p.notes || ''}</div>
                    </td>
                    <td>
                      <span className="badge">{aisleNameById(p.aisleId)}</span>
                    </td>
                    <td>
                      <button type="button" className="btn btn-sm" onClick={() => toggleOos(p.id)}>
                        {p.oos ? 'In stock' : 'Mark OOS'}
                      </button>{' '}
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteProduct(p.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'publish' && (
          <div className="card">
            <h2>Publish customer map</h2>
            <p className="muted">
              Read-only link for shoppers (and a second screen for associates). Re-publish after big walks.
            </p>
            {activeStore ? (
              <>
                <p>
                  <strong>{activeStore.name}</strong> — {products.length} products, {aisles.length} aisles
                  {products.filter((p) => p.oos).length > 0 && (
                    <> · {products.filter((p) => p.oos).length} OOS</>
                  )}
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={publishMap}
                  disabled={busy || products.length === 0}
                >
                  {busy ? 'Publishing…' : 'Publish / update public map'}
                </button>
                {(publishUrl || activeStore.publishUrl) && (
                  <div style={{ marginTop: '1rem' }}>
                    <label>Customer link</label>
                    <div className="pub-link">{publishUrl || activeStore.publishUrl}</div>
                    <div className="row" style={{ marginTop: '0.5rem' }}>
                      <a
                        className="btn btn-primary"
                        href={publishUrl || activeStore.publishUrl}
                        target="_blank"
                        rel="noopener"
                      >
                        Open finder
                      </a>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          navigator.clipboard?.writeText(publishUrl || activeStore.publishUrl);
                          setMsg('Link copied');
                        }}
                      >
                        Copy link
                      </button>
                    </div>
                    <p className="muted" style={{ marginTop: '0.75rem' }}>
                      QR this URL at the door. Free hosting may drop the snapshot after idle — re-publish if it 404s.
                      Durable cloud DB can come next.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="empty">Select a store first.</p>
            )}
          </div>
        )}

        {tab === 'map' && (
          <div className="card">
            <h2>Outdoor map — {activeStore?.name || '—'}</h2>
            <StoreMapView store={activeStore} />
          </div>
        )}
      </main>
    </div>
  );
}
