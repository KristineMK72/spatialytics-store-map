/**
 * Forward geocode: US Census (best for rural MN house numbers) → Nominatim fallback.
 */
export async function geocodeAddress(query, extras = {}) {
  const city = (extras.city || '').trim();
  const state = (extras.state || 'MN').trim() || 'MN';
  const postal = (extras.postal || '').trim();
  const street = (query || '').trim();

  const oneLine = [street, city, state, postal].filter(Boolean).join(', ');

  // 1) Census Bureau — excellent for US street ranges / county roads
  try {
    const census = await censusGeocode(oneLine);
    if (census) return census;
  } catch (e) {
    console.warn('Census geocode error', e);
  }

  // 2) Nominatim attempts
  const attempts = [];
  attempts.push(oneLine);
  attempts.push(street);
  if (city || postal) {
    attempts.push([street, city, state, postal].filter(Boolean).join(', '));
  }
  if (!/\bMN\b|minnesota/i.test(oneLine)) {
    attempts.push(`${street}, ${city || 'Minnesota'}, MN, USA`);
  }
  const cr = street
    .replace(/\bco\.?\s*rd\.?\b/gi, 'County Road')
    .replace(/\bcounty\s+road\b/gi, 'County Road');
  if (cr !== street) {
    attempts.push([cr, city, state, postal].filter(Boolean).join(', '));
  }
  attempts.push(
    [street.replace(/county\s+road/i, 'CO RD'), city, state, postal]
      .filter(Boolean)
      .join(', ')
  );

  const seen = new Set();
  for (const q of attempts) {
    const key = q.toLowerCase();
    if (!q || seen.has(key)) continue;
    seen.add(key);
    try {
      const hit = await nominatimSearch(q);
      if (hit) return hit;
    } catch (e) {
      console.warn('Nominatim error', e);
    }
  }

  try {
    const structured = await tryStructured(street, city, state, postal);
    if (structured) return structured;
  } catch {
    /* ignore */
  }

  return null;
}

async function censusGeocode(oneLineAddress) {
  if (!oneLineAddress) return null;
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' +
    encodeURIComponent(oneLineAddress);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const match = data?.result?.addressMatches?.[0];
  if (!match?.coordinates) return null;
  const lon = parseFloat(match.coordinates.x);
  const lat = parseFloat(match.coordinates.y);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return {
    lat,
    lon,
    display: match.matchedAddress || oneLineAddress,
    source: 'census',
  };
}

async function nominatimSearch(q) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=3&addressdetails=1&countrycodes=us&q=' +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SpatialyticsStoreMap/0.1 (https://spatialytics-store-map.vercel.app)',
    },
  });
  if (!res.ok) throw new Error('Geocode failed');
  const data = await res.json();
  if (!data?.length) return null;
  const mn =
    data.find((d) => /\bMinnesota\b|\bMN\b/i.test(d.display_name)) || data[0];
  return {
    lat: parseFloat(mn.lat),
    lon: parseFloat(mn.lon),
    display: mn.display_name,
    source: 'nominatim',
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
    source: 'nominatim',
  };
}

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
