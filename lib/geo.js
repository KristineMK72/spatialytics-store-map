/** Forward geocode via Nominatim (OSM) */
export async function geocodeAddress(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
    encodeURIComponent(query);
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Geocode failed');
  const data = await res.json();
  if (!data?.length) return null;
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    display: data[0].display_name,
  };
}

/**
 * Fetch nearest OSM building footprint via Overpass around a point.
 * Returns GeoJSON polygon coordinates [lon, lat][] or null.
 */
export async function fetchBuildingFootprint(lat, lon, radiusMeters = 60) {
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

  // Prefer a way with geometry; pick closest centroid to the point
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
  // Close ring
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
