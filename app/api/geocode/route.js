import { NextResponse } from 'next/server';

/**
 * Server-side geocode so Census API works (no browser CORS).
 * Prefer Census for US addresses; Nominatim as fallback, biased to MN when state=MN.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const street = (searchParams.get('street') || '').trim();
  const city = (searchParams.get('city') || '').trim();
  const state = (searchParams.get('state') || 'MN').trim() || 'MN';
  const postal = (searchParams.get('postal') || '').trim();

  if (!street) {
    return NextResponse.json({ error: 'street required' }, { status: 400 });
  }

  const oneLine = [street, city, state, postal].filter(Boolean).join(', ');
  const preferMn = /^mn$/i.test(state) || /minnesota/i.test(state);

  try {
    const census = await censusGeocode(oneLine);
    if (census && (!preferMn || isMinnesota(census))) {
      return NextResponse.json(census);
    }
  } catch (e) {
    console.warn('census', e);
  }

  // Force MN in query string for Nominatim
  const queries = [
    oneLine,
    `${street}, ${city}, Minnesota ${postal}`.replace(/,\s*,/g, ','),
    `${street}, Brainerd, Minnesota, USA`,
    street.replace(/county\s+road/i, 'CO RD') + `, ${city}, MN ${postal}`,
  ];

  for (const q of queries) {
    if (!q.trim()) continue;
    try {
      const hit = await nominatimSearch(q, preferMn);
      if (hit) return NextResponse.json(hit);
    } catch (e) {
      console.warn('nominatim', e);
    }
  }

  return NextResponse.json({ error: 'No geocode result' }, { status: 404 });
}

function isMinnesota(hit) {
  if (hit.lat > 43.4 && hit.lat < 49.5 && hit.lon > -97.5 && hit.lon < -89.3) {
    return true;
  }
  return /minnesota|\bMN\b/i.test(hit.display || '');
}

async function censusGeocode(oneLineAddress) {
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' +
    encodeURIComponent(oneLineAddress);
  const res = await fetch(url, { next: { revalidate: 0 } });
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

async function nominatimSearch(q, preferMn) {
  let url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&countrycodes=us&q=' +
    encodeURIComponent(q);
  // Viewbox roughly Minnesota
  if (preferMn) {
    url += '&viewbox=-97.5,49.5,-89.3,43.4&bounded=0';
  }
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SpatialyticsStoreMap/0.1 (https://spatialytics-store-map.vercel.app)',
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.length) return null;

  let pick = data[0];
  if (preferMn) {
    const mn = data.find(
      (d) =>
        /minnesota|\bMN\b/i.test(d.display_name) ||
        (parseFloat(d.lat) > 43.4 &&
          parseFloat(d.lat) < 49.5 &&
          parseFloat(d.lon) > -97.5 &&
          parseFloat(d.lon) < -89.3)
    );
    if (!mn) return null; // refuse Colorado-style wrong hits
    pick = mn;
  }

  return {
    lat: parseFloat(pick.lat),
    lon: parseFloat(pick.lon),
    display: pick.display_name,
    source: 'nominatim',
  };
}
