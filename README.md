# Store Map — Spatialytics

**Outdoor GIS footprint + indoor walk/scan + publish for customers.**

Map a store from the parcel in, walk aisles, scan products, flag OOS, then publish a **customer finder** link (`/s/[slug]`).

**Live:** [spatialytics-store-map.vercel.app](https://spatialytics-store-map.vercel.app)

## Features

1. **Store** — address → US Census geocode + optional OSM building footprint  
2. **Layout** — aisles / zones  
3. **Walk** — camera barcode + aisle + optional out-of-stock  
4. **Products** — associate search, OOS toggle, CSV export  
5. **Map** — outdoor pin / footprint  
6. **Publish** — public read-only finder for shoppers  

Staff data stays in the browser (`localStorage`). **Published** snapshots go to the server.

## Durable public maps (recommended)

Without Redis, published maps are **ephemeral** (may 404 after idle).

### Free Upstash Redis (2 minutes)

1. Create a free DB at [upstash.com](https://upstash.com) → Redis  
2. Copy **REST URL** and **REST TOKEN**  
3. In Vercel → Project → Settings → Environment Variables:

```
UPSTASH_REDIS_REST_URL=https://….upstash.io
UPSTASH_REDIS_REST_TOKEN=…
```

4. Redeploy

Or use **Vercel KV** (same REST shape):

```
KV_REST_API_URL=…
KV_REST_API_TOKEN=…
```

Check: `GET /api/stores/status` → `{ "durable": true }`

## Stack

- Next.js 14
- Leaflet + OSM
- Census geocoder + Nominatim fallback
- html5-qrcode
- Optional Upstash Redis / Vercel KV

```bash
npm install
npm run dev
```

## Spatialytics family

- [Spatialytics](https://spatialytics-astro.vercel.app)
- [Pipeline](https://spatialytics-pipeline.vercel.app)
- [Storm IQ](https://storm-iq.vercel.app)
