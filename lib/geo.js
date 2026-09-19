/**
 * Forward geocode via Nominatim with several query fallbacks.
 * Rural MN addresses often need city + state; street-only fails.
 */
export async function geocodeAddress(query, extras = {}) {
  const city = (extras.city || '').trim();
  const state = (extras.state || 'MN').trim() || 'MN';
  const postal = (extras.postal || '').trim();

  const base = query.trim();
  const attempts = [];

  // 1) As typed
  attempts.push(base);

  // 2) + city/state/zip if provided
  if (city || postal) {
    attempts.push(
      [base, city, state, postal].filter(Boolean).join(', ')
    );
  }

  // 3) Always try Minnesota USA if not already obvious
  if (!/\bMN\b|minnesota/i.test(base)) {
    attempts.push(`${base}, ${city || 'Minnesota'}, MN, USA`);
    attempts.push(`${base}, Minnesota, USA`);
  } else {
    attempts.push(`${base}, USA`);
  }

  // 4) Normalize "County Road" / CR variants
  const cr = base
    .replace(/\bco\.?\s*rd\.?\b/gi, 'County Road')
    .replace(/\bcounty\s+road\b/gi, 'County Road');
  if (cr !== base) {
    attempts.push([cr, city, state, postal].filter(Boolean).join(', '));
    attempts.push(`${cr}, Minnesota, USA`);
  }

  // 5) Structured search as last resort when we have street pieces
  const structured = await tryStructured(base, city, state, postal);
  if (structured) return structured;

  const seen = new Set();
  for (const q of attempts) {
    const key = q.toLowerCase();
    if (!q || seen.has(key)) continue;
    seen.add(key);
    const hit = await nominatimSearch(q);
    if (hit) return hit;
  }
  return null;
}

async function nominatimSearch(q) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=3&addressdetails=1&countrycodes=us&q=' +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      // Nominatim usage policy asks for a valid User-Agent identifying the app
      'User-Agent': 'SpatialyticsStoreMap/0.1 (https://spatialytics-store-map.vercel.app)',
    },
  });
  if (!res.ok) throw new Error('Geocode failed');
  const data = await res.json();
  if (!data?.length) return null;

  // Prefer Minnesota results when present
  const mn =
    data.find((d) => /\bMinnesota\b|\bMN\b/i.test(d.display_name)) || data[0];
  return {
    lat: parseFloat(mn.lat),
    lon: parseFloat(mn.lon),
    display: mn.display_name,
  };
}

async function tryStructured(street, city, state, postal) {
  if (!street) return null;
  const params = new URLSearchParams({
    format: 'json',
    limit: '3',
    addressdetails: '1',
    countrycodes: 'us',
    street,
    state: state || 'Minnesota',
  });
  if (city) params.set('city', city);
  if (postal) params.set('postalcode', postal);

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SpatialyticsStoreMap/0.1 (https://spatialytics-store-map.vercel.app)',
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.length) return null;
  const mn =
    data.find((d) => /\bMinnesota\b|\bMN\b/i.test(d.display_name)) || data[0];
  return {
    lat: parseFloat(mn.lat),
    lon: parseFloat(mn.lon),
    display: mn.display_name,
  };
}

/**
 * Fetch nearest OSM building footprint via Overpass around a point.
 */
export async function fetchBuildingFootprint(lat, lon, radiusMeters = 80) {
  const query = `
[out:json][timeout:25];
(
  way["building"](around:${radiusMeters},${lat},${lon});
  relation["building"](around:${radiusMeters},${lat},${lon});
);
out geom;
`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error('Overpass request failed');
  const data = await res.json();
  const elements = data.elements || [];
  if (!elements.length) return null;

  let best = null;
  let bestDist = Infinity;
  for (const el of elements) {
    const coords = geometryToRing(el);
    if (!coords || coords.length < 3) continue;
    const c = ringCentroid(coords);
    const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = coords;
    }
  }
  if (!best) return null;
  const ring = [...best];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

function geometryToRing(el) {
  if (el.type === 'way' && el.geometry) {
    return el.geometry.map((p) => [p.lon, p.lat]);
  }
  if (el.type === 'relation' && el.members) {
    const outer = el.members.find((m) => m.role === 'outer' && m.geometry);
    if (outer?.geometry) return outer.geometry.map((p) => [p.lon, p.lat]);
  }
  return null;
}

function ringCentroid(ring) {
  let lat = 0;
  let lon = 0;
  for (const [lo, la] of ring) {
    lon += lo;
    lat += la;
  }
  const n = ring.length || 1;
  return { lat: lat / n, lon: lon / n };
}
