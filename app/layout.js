import './globals.css';

export const metadata = {
  title: 'Store Map — Spatialytics',
  description:
    'Outdoor GIS footprint + indoor walk/scan. Map products to aisles for Greater Minnesota retail.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body>
        <div className="family-bar">
          <a href="https://spatialytics-astro.vercel.app" target="_blank" rel="noopener">
            Spatialytics
          </a>
          <span className="sep">·</span>
          <a href="https://spatialytics-pipeline.vercel.app" target="_blank" rel="noopener">
            Pipeline
          </a>
          <span className="sep">·</span>
          <strong>Store Map</strong>
          <span className="sep">·</span>
          <a href="https://storm-iq.vercel.app" target="_blank" rel="noopener">
            Storm IQ
          </a>
        </div>
        {children}
      </body>
    </html>
  );
}
