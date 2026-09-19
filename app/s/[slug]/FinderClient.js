'use client';

import { useEffect, useMemo, useState } from 'react';

export default function FinderClient({ slug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Map not found');
        }
        const j = await res.json();
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const aisleName = (id) =>
    data?.aisles?.find((a) => a.id === id)?.name || 'Ask staff';

  const results = useMemo(() => {
    if (!data?.products) return [];
    const query = q.trim().toLowerCase();
    let list = data.products.filter((p) => !p.oos);
    if (query) {
      list = data.products.filter(
        (p) =>
          p.name?.toLowerCase().includes(query) ||
          p.barcode?.includes(query) ||
          p.notes?.toLowerCase().includes(query) ||
          aisleName(p.aisleId).toLowerCase().includes(query)
      );
    }
    return list.slice(0, 40);
  }, [data, q]);

  if (loading) {
    return (
      <div className="finder">
        <p className="muted">Loading map…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="finder">
        <h1>Map unavailable</h1>
        <p className="muted">{error}</p>
        <p className="muted">
          Staff can re-publish from{' '}
          <a href="/">Store Map</a> (Publish tab).
        </p>
      </div>
    );
  }

  const updated = data.updatedAt || data.publishedAt;

  return (
    <div className="finder">
      <header className="finder-header">
        <p className="finder-kicker">Store Map · customer find</p>
        <h1>{data.store?.name || 'Store'}</h1>
        <p className="muted">{data.store?.address}</p>
        {updated && (
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            Updated {new Date(updated).toLocaleString()}
          </p>
        )}
      </header>

      <div className="finder-search">
        <label htmlFor="find-q">What are you looking for?</label>
        <input
          id="find-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chips, milk, ibuprofen…"
          autoFocus
          autoComplete="off"
        />
      </div>

      <ul className="finder-results">
        {results.length === 0 ? (
          <li className="muted">No matches{q ? ` for “${q}”` : ''} — ask a team member.</li>
        ) : (
          results.map((p) => (
            <li key={p.id} className={p.oos ? 'oos' : ''}>
              <div className="finder-name">
                {p.name}
                {p.oos && <span className="oos-badge">Out of stock</span>}
              </div>
              <div className="finder-aisle">{aisleName(p.aisleId)}</div>
              {p.notes && <div className="muted">{p.notes}</div>}
            </li>
          ))
        )}
      </ul>

      <footer className="finder-footer muted">
        Powered by <a href="/">Spatialytics Store Map</a>
      </footer>
    </div>
  );
}
