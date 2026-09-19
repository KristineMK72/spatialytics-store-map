/**
 * Client geocode → /api/geocode (Census on server, no CORS, MN-safe).
 */
export async function geocodeAddress(query, extras = {}) {
  const city = (extras.city || '').trim();
  const state = (extras.state || 'MN').trim() || 'MN';
  const postal = (extras.postal || '').trim();
  const street = (query || '').trim();

  const params = new URLSearchParams({ street, state });
  if (city) params.set('city', city);
  if (postal) params.set('postal', postal);

  const res = await fetch(`/api/geocode?${params.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Geocode failed');
  const data = await res.json();
  if (data.error || data.lat == null) return null;
  return {
    lat: data.lat,
    lon: data.lon,
    display: data.display,
    source: data.source,
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
