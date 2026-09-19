# Store Map — Spatialytics

**Outdoor GIS footprint + indoor walk/scan for product placement.**

Map a store from the parcel in, then walk the aisles and scan products so you can search *where things live*.

**Live:** deploy on Vercel from this repo.

## What it does

1. **Store** — address → geocode + optional OpenStreetMap building footprint  
2. **Layout** — aisles / zones  
3. **Walk** — scan (barcode or name) + assign aisle  
4. **Map** — outdoor pin + footprint; indoor list by aisle  
5. **Search** — find a product’s last location  

Data stays in the browser (`localStorage`) for the MVP.

## Stack

- Next.js 14
- Leaflet + OSM / Nominatim / Overpass

```bash
npm install
npm run dev
```

## Spatialytics family

- [Spatialytics](https://spatialytics-astro.vercel.app)
- [Pipeline](https://spatialytics-pipeline.vercel.app)
- [Storm IQ](https://storm-iq.vercel.app)
