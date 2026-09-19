'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Full-screen camera barcode scanner using html5-qrcode.
 * Calls onScan(decodedText) once, then expects parent to close.
 */
export default function BarcodeScanner({ onScan, onClose }) {
  const regionId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const handled = useRef(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let scanner;

    async function start() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new Html5Qrcode(regionId);
        scannerRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras?.length) {
          setError('No camera found. Type the barcode instead.');
          setStarting(false);
          return;
        }

        // Prefer back camera on phones
        const back =
          cameras.find((c) => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];

        await scanner.start(
          back.id,
          {
            fps: 10,
            qrbox: (viewW, viewH) => {
              const w = Math.min(280, Math.floor(viewW * 0.85));
              const h = Math.min(160, Math.floor(viewH * 0.35));
              return { width: w, height: h };
            },
            aspectRatio: 1.333,
            disableFlip: false,
          },
          (decodedText) => {
            if (handled.current || cancelled) return;
            handled.current = true;
            try {
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(40);
              }
            } catch {
              /* ignore */
            }
            onScan(String(decodedText).trim());
          },
          () => {
            /* frame miss — ignore */
          }
        );
        if (!cancelled) setStarting(false);
      } catch (err) {
        console.error(err);
        setStarting(false);
        setError(
          err?.message?.includes('Permission') || err?.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera in browser settings, or type the code.'
            : 'Could not start camera. Try HTTPS on a phone, or type the barcode.'
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [regionId, onScan]);

  return (
    <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label="Scan barcode">
      <div className="scanner-panel">
        <div className="scanner-header">
          <strong>Scan barcode</strong>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted scanner-hint">
          Point at a UPC / EAN. Hold steady — we fill the form when it reads.
        </p>
        {starting && !error && <p className="muted">Starting camera…</p>}
        {error && <p className="scanner-error">{error}</p>}
        <div id={regionId} className="scanner-viewport" />
        <p className="muted scanner-hint">Works best on a phone with the rear camera.</p>
      </div>
    </div>
  );
}
