"use client";

import "leaflet/dist/leaflet.css";
import { Layers, MapPinned, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type * as Leaflet from "leaflet";
import { gridYearFor } from "@/lib/map-data";

type MapResponse = {
  boundary: Feature<Polygon | MultiPolygon, { name: string; displayName: string; source: string }>;
  error?: string;
};
type LayerKey = "density";

export default function MunicipalityMap({ code, name, year }: { code: string; name: string; year: string }) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const fittedRequestRef = useRef<string | null>(null);
  const layerRef = useRef<{
    boundary?: Leaflet.GeoJSON;
    density?: Leaflet.TileLayer.WMS;
  }>({});
  const [enabled, setEnabled] = useState<Record<LayerKey, boolean>>({
    density: false,
  });
  const [mapReady, setMapReady] = useState(false);
  const enabledRef = useRef(enabled);
  const [gridError, setGridError] = useState(false);
  const [mapResult, setMapResult] = useState<{ key: string; data: MapResponse | null; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0);
  const requestKey = `${code}:${name}`;
  const gridYear = useMemo(() => gridYearFor(year), [year]);
  const densityLayerName = `vaestoruutu:vaki${gridYear}_1km`;
  const data = mapResult?.key === requestKey ? mapResult.data : null;
  const status = mapResult?.key === requestKey
    ? mapResult.error ?? (data ? "Kuntaraja ladattu." : "Ladataan kuntarajaa…")
    : "Ladataan kuntarajaa…";

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`/api/municipality-map?${new URLSearchParams({ code })}`, {
        signal: controller.signal, cache: "no-store",
      });
      const payload = await response.json() as MapResponse;
      if (!response.ok) throw new Error(payload.error || "Kartta-aineisto puuttuu.");
      if (!alive) return;
      setMapResult({ key: requestKey, data: payload, error: null });
    }
    void load().catch((error) => {
        if (!alive || controller.signal.aborted) return;
        setMapResult((current) => ({
          key: requestKey,
          data: current?.key === requestKey ? current.data : null,
          error: error instanceof Error ? error.message : "Kartta-aineistoa ei saatu ladattua.",
        }));
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [code, name, requestKey, retry]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    async function setupMap() {
      if (!mapNodeRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !mapNodeRef.current) return;
      const map = L.map(mapNodeRef.current, {
        center: [64.9, 26.1],
        zoom: 5,
        minZoom: 4,
        zoomControl: false,
        attributionControl: true,
      });
      L.control.zoom({ position: "bottomright", zoomInTitle: "Lähennä", zoomOutTitle: "Loitonna" }).addTo(map);
      map.attributionControl.addAttribution('Kuntaraja: <a href="https://geo.stat.fi/geoserver/tilastointialueet/wfs?service=WFS&request=GetCapabilities">Tilastokeskus</a>');
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
        maxZoom: 19,
        className: "night-map-tiles",
      }).addTo(map);
      mapRef.current = map;
      resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      resizeObserver.observe(mapNodeRef.current);
      setMapReady(true);
    }
    void setupMap();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = {};
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function drawData() {
      const map = mapRef.current;
      if (!mapReady || !map || !data) return;
      const L = await import("leaflet");
      if (cancelled) return;

      Object.values(layerRef.current).forEach((layer) => layer?.remove());
      const boundary = L.geoJSON(data.boundary, {
        style: {
          color: "#f5c76b",
          fillColor: "#2f5366",
          fillOpacity: 0.14,
          opacity: 0.95,
          weight: 2,
        },
      }).addTo(map);
      const bounds = boundary.getBounds();
      if (bounds.isValid() && fittedRequestRef.current !== requestKey) {
        map.fitBounds(bounds.pad(0.08), { maxZoom: 14 });
        fittedRequestRef.current = requestKey;
      }

      const density = gridYear === null ? undefined : L.tileLayer.wms("https://geo.stat.fi/geoserver/vaestoruutu/wms", {
        layers: densityLayerName,
        format: "image/png",
        transparent: true,
        opacity: 0.58,
        attribution: "Tilastokeskus",
      });
      density?.on("tileerror", () => setGridError(true));
      layerRef.current = { boundary, density };

      if (enabledRef.current.density) density?.addTo(map);
    }
    void drawData();
    return () => {
      cancelled = true;
    };
  }, [data, densityLayerName, gridYear, mapReady, requestKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (["density"] as LayerKey[]).forEach((key) => {
      const layer = layerRef.current[key];
      if (!layer) return;
      if (enabled[key] && !map.hasLayer(layer)) layer.addTo(map);
      if (!enabled[key] && map.hasLayer(layer)) layer.remove();
    });
  }, [enabled]);

  function toggleLayer(key: LayerKey) {
    const next = { ...enabledRef.current, [key]: !enabledRef.current[key] };
    enabledRef.current = next;
    setEnabled(next);
    if (key === "density") { setGridError(false); layerRef.current.density?.redraw(); }
  }

  return (
    <section id="explore-map" className="map-section section-anchor" aria-labelledby="map-heading">
      <div className="section-heading map-heading">
        <div>
          <p className="eyebrow">TUTKI KARTALLA</p>
          <h2 id="map-heading">Kuntaraja ja väestöruudut</h2>
        </div>
        <span className="map-source"><MapPinned size={15} aria-hidden="true" />{name}</span>
      </div>
      <div className="map-layout">
        <div className="map-panel">
          <div className="map-toolbar" aria-label="Karttatasot">
            <button type="button" disabled={gridYear === null} onClick={() => toggleLayer("density")} aria-pressed={enabled.density && gridYear !== null}>
              <Layers size={16} aria-hidden="true" />Väestöruudut
            </button>
            <button type="button" disabled={!data || !mapReady} onClick={() => {
              const bounds = layerRef.current.boundary?.getBounds();
              if (bounds?.isValid()) mapRef.current?.fitBounds(bounds.pad(0.08), { maxZoom: 14 });
            }}>Näytä koko kunta</button>
            {mapResult?.error && <button type="button"
              title="Yritä uudelleen" aria-label="Yritä uudelleen" onClick={() => {
                setMapResult(current => current ? { ...current, error: null } : current);
                setRetry((current) => current + 1);
              }}><RefreshCw size={16} aria-hidden="true" /></button>}
          </div>
          <div ref={mapNodeRef} className="municipality-map" role="region"
            aria-label={`${name}: interaktiivinen kartta`} />
          <p className="map-status" role="status">{status}</p>
          {enabled.density && gridError && <p className="map-layer-error" role="status">Väestöruutuja ei saatu ladattua. Poista taso ja ota se uudelleen käyttöön.</p>}
        </div>
        <aside className="map-details" aria-label="Kartta-aineiston tiedot">
          <div className="map-legend">
            <h3>Selite</h3>
            <p><span className="legend-line" />Tilastokeskus · kuntajako 2026</p>
            <p><span className="legend-grid" />{gridYear === null ? "Väestöruutuja ei ole saatavilla valitulle vuodelle." : `Väestöruudut 1 km × 1 km, vuosi ${gridYear}`}</p>
            {gridYear !== null && String(gridYear) !== year && <p>Valittua vuotta edeltävä uusin julkaistu ruutuaineisto.</p>}
          </div>
          <p className="map-note">
            Väestökerros kuvaa ruutujen yhteenlaskettua väestöä, ei yksittäisiä koteja tai satelliitin yövaloja.
            Ruudut voivat ulottua kuntarajan yli. Kuntaraja on yleistetty (1:1 000 000), ei kiinteistöraja tai valitun vuoden historiallinen raja.
          </p>
        </aside>
      </div>
    </section>
  );
}
