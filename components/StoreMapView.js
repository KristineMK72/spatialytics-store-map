'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';

const pinIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitBounds({ store }) {
  const map = useMap();
  useEffect(() => {
    if (!store?.lat || !store?.lon) return;
    if (store.footprint?.coordinates?.[0]?.length) {
      const latlngs = store.footprint.coordinates[0].map(([lon, lat]) => [lat, lon]);
      map.fitBounds(latlngs, { padding: [24, 24] });
    } else {
      map.setView([store.lat, store.lon], 17);
    }
  }, [store, map]);
  return null;
}

export default function StoreMapView({ store }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !store?.lat || !store?.lon) {
    return (
      <div className="map-wrap" style={{ display: 'grid', placeItems: 'center' }}>
        <p className="muted">Add a store with coordinates to see the map.</p>
      </div>
    );
  }

  const positions =
    store.footprint?.coordinates?.[0]?.map(([lon, lat]) => [lat, lon]) || null;

  return (
    <div className="map-wrap">
      <MapContainer
        center={[store.lat, store.lon]}
        zoom={17}
        style={{ height: '100%', width: '100%', background: '#0b1220' }}
        scrollWheelZoom
      >
        {/* Free OSM tiles — no API key (Carto dark started requiring one) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitBounds store={store} />
        <Marker position={[store.lat, store.lon]} icon={pinIcon}>
          <Popup>
            <strong>{store.name}</strong>
            <br />
            {store.address}
          </Popup>
        </Marker>
        {positions && (
          <Polygon
            positions={positions}
            pathOptions={{
              color: '#0891b2',
              weight: 3,
              fillColor: '#22d3ee',
              fillOpacity: 0.25,
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
