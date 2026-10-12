"use client";

import "leaflet/dist/leaflet.css";
import { Building2, Landmark, Layers, MapPinned, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type * as Leaflet from "leaflet";
import { gridYearFor, safeWebsite } from "@/lib/map-data";

type Settlement = {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  population: string | null;
};
type Place = {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  address: string | null;
  website: string | null;
  operator: string | null;
  openingHours: string | null;
};
type MapResponse = {
  boundary: Feature<Polygon | MultiPolygon, { name: string; displayName: string; source: string }>;
  settlements: Settlement[];
  places: Place[];
  detailsStatus: "loading" | "ready" | "unavailable";
  attribution: { boundaryAndPlaces: string; populationGrid: string };
  error?: string;
};
type LayerKey = "density" | "settlements" | "places";

const formatter = new Intl.NumberFormat("fi-FI");
const placeLabels: Record<string, string> = {
  attraction: "Nähtävyys",
  gallery: "Galleria",
  historic: "Historiallinen kohde",
  library: "Kirjasto",
  museum: "Museo",
  park: "Puisto",
  viewpoint: "Näköalapaikka",
};
const settlementLabels: Record<string, string> = {
  city: "Kaupunki",
  town: "Taajama",
  village: "Kylä",
  hamlet: "Kylä",
  suburb: "Kaupunginosa",
  neighbourhood: "Naapurusto",
  locality: "Paikannimi",
};

function placeKindLabel(kind: string) {
  return placeLabels[kind] ?? "Kohde";
}

function settlementKindLabel(kind: string) {
  return settlementLabels[kind] ?? "Asutus";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (match) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[match] ?? match);
}

function popupForPlace(place: Place) {
  const details = [
    place.address,
    place.operator ? `Ylläpitäjä: ${place.operator}` : null,
    place.openingHours ? `Aukiolo: ${place.openingHours}` : null,
  ].filter(Boolean).map((item) => `<p>${escapeHtml(item ?? "")}</p>`).join("");
  const url = safeWebsite(place.website);
  const website = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Verkkosivut</a>`
    : "";
  return `<strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(placeKindLabel(place.kind))}</span>${details}${website}`;
}

function popupForSettlement(settlement: Settlement) {
  return `<strong>${escapeHtml(settlement.name)}</strong><span>${escapeHtml(settlementKindLabel(settlement.kind))}</span>`;
}

function createDivIcon(L: typeof Leaflet, label: string, className: string) {
  return L.divIcon({
    className,
    html: `<span>${escapeHtml(label)}</span>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

function createPlaceLayer(L: typeof Leaflet, places: Place[]) {
  const group = L.layerGroup();
  for (const place of places) {
    const marker = L.circleMarker([place.lat, place.lon], {
      radius: place.kind === "library" ? 5 : 4,
      color: place.kind === "library" ? "#f5c76b" : "#f08d61",
      fillColor: place.kind === "library" ? "#f5c76b" : "#f08d61",
      fillOpacity: 0.9,
      opacity: 0.95,
      weight: 1,
    });
    marker.bindPopup(popupForPlace(place), { className: "map-popup" });
    marker.addTo(group);
  }
  return group;
}

function createSettlementLayer(L: typeof Leaflet, settlements: Settlement[], map: Leaflet.Map) {
  const group = L.layerGroup();
  const ranked = [...settlements].sort((a, b) => {
    const rank = ["city", "town", "village", "hamlet", "suburb", "neighbourhood"];
    return rank.indexOf(a.kind) - rank.indexOf(b.kind);
  });
  const markers = ranked.map((settlement) => {
    const marker = L.marker([settlement.lat, settlement.lon], {
      icon: createDivIcon(L, settlement.name, `settlement-label settlement-${settlement.kind}`),
      keyboard: true,
      title: settlement.name,
    });
    marker.bindPopup(popupForSettlement(settlement), { className: "map-popup" });
    return { marker, settlement };
  });
  const update = () => {
    group.clearLayers();
    const occupied: { left: number; top: number; right: number; bottom: number }[] = [];
    const size = map.getSize();
    for (const { marker, settlement } of markers) {
      const minZoom = settlement.kind === "neighbourhood" ? 14 : settlement.kind === "suburb" ? 12 : settlement.kind === "hamlet" ? 11 : 0;
      if (map.getZoom() < minZoom) continue;
      const point = map.latLngToContainerPoint(marker.getLatLng());
      if (point.x < 0 || point.y < 0 || point.x > size.x || point.y > size.y) continue;
      // Measure the rendered label so long names reserve enough space.
      marker.addTo(group);
      const span = marker.getElement()?.querySelector("span");
      const width = span?.getBoundingClientRect().width ?? 160;
      const height = span?.getBoundingClientRect().height ?? 24;
      const box = { left: point.x - width / 2 - 8, right: point.x + width / 2 + 8,
        top: point.y - height / 2 - 5, bottom: point.y + height / 2 + 5 };
      if (occupied.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) {
        group.removeLayer(marker);
      } else occupied.push(box);
    }
  };
  group.on("add", () => { map.on("moveend zoomend resize", update); update(); });
  group.on("remove", () => map.off("moveend zoomend resize", update));
  return group;
}

export default function MunicipalityMap({ code, name, year }: { code: string; name: string; year: string }) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const fittedRequestRef = useRef<string | null>(null);
  const layerRef = useRef<{
    boundary?: Leaflet.GeoJSON;
    density?: Leaflet.TileLayer.WMS;
    places?: Leaflet.LayerGroup;
    settlements?: Leaflet.LayerGroup;
  }>({});
  const [enabled, setEnabled] = useState<Record<LayerKey, boolean>>({
    density: false,
    settlements: true,
    places: true,
  });
  const [mapReady, setMapReady] = useState(false);
  const enabledRef = useRef(enabled);
  const [gridError, setGridError] = useState(false);
  const [mapResult, setMapResult] = useState<{ key: string; data: MapResponse | null; error: string | null } | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [retry, setRetry] = useState(0);
  const requestKey = `${code}:${name}`;
  const gridYear = useMemo(() => gridYearFor(year), [year]);
  const densityLayerName = `vaestoruutu:vaki${gridYear}_1km`;
  const data = mapResult?.key === requestKey ? mapResult.data : null;
  const status = mapResult?.key === requestKey
    ? mapResult.error ?? (data?.detailsStatus === "unavailable" ? "Kuntaraja ladattu. Paikannimet ja kohteet eivät juuri nyt ole saatavilla."
      : data?.detailsStatus === "loading" ? "Kuntaraja ladattu. Ladataan paikannimiä ja kohteita…"
      : data ? "Kartta-aineisto ladattu." : "Ladataan kartta-aineistoa…")
    : "Ladataan kartta-aineistoa…";

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    async function load() {
      for (const details of ["0", "1"]) {
        const response = await fetch(`/api/municipality-map?${new URLSearchParams({ code, name, details })}`, {
          signal: controller.signal, cache: "no-store",
        });
        const payload = await response.json() as MapResponse;
        if (!response.ok) throw new Error(payload.error || "Kartta-aineisto puuttuu.");
        if (!alive) return;
        setMapResult({ key: requestKey, data: payload, error: null });
        setSelectedPlace(null);
      }
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
      const updateZoomClass = () => {
        mapNodeRef.current?.classList.toggle("map-zoom-detailed", map.getZoom() >= 12);
      };
      map.on("zoomend", updateZoomClass);
      map.whenReady(updateZoomClass);
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
      const settlements = createSettlementLayer(L, data.settlements, map);
      const places = createPlaceLayer(L, data.places);
      layerRef.current = { boundary, density, settlements, places };

      if (enabledRef.current.density) density?.addTo(map);
      if (enabledRef.current.settlements) settlements.addTo(map);
      if (enabledRef.current.places) places.addTo(map);
    }
    void drawData();
    return () => {
      cancelled = true;
    };
  }, [data, densityLayerName, gridYear, mapReady, requestKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (["density", "settlements", "places"] as LayerKey[]).forEach((key) => {
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
          <h2 id="map-heading">Kunnan paikat ja väestöruudut</h2>
        </div>
        <span className="map-source"><MapPinned size={15} aria-hidden="true" />{name}</span>
      </div>
      <div className="map-layout">
        <div className="map-panel">
          <div className="map-toolbar" aria-label="Karttatasot">
            <button type="button" disabled={gridYear === null} onClick={() => toggleLayer("density")} aria-pressed={enabled.density && gridYear !== null}>
              <Layers size={16} aria-hidden="true" />Väestöruudut
            </button>
            <button type="button" onClick={() => toggleLayer("settlements")} aria-pressed={enabled.settlements}>
              <UsersRound size={16} aria-hidden="true" />Nimet
            </button>
            <button type="button" onClick={() => toggleLayer("places")} aria-pressed={enabled.places}>
              <Landmark size={16} aria-hidden="true" />Kohteet
            </button>
            <button type="button" disabled={!data || !mapReady} onClick={() => {
              const bounds = layerRef.current.boundary?.getBounds();
              if (bounds?.isValid()) mapRef.current?.fitBounds(bounds.pad(0.08), { maxZoom: 14 });
            }}>Näytä koko kunta</button>
            {(mapResult?.error || data?.detailsStatus === "unavailable") && <button type="button"
              title="Yritä uudelleen" aria-label="Yritä uudelleen" onClick={() => {
                setMapResult(null);
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
            <p><span className="legend-dot legend-library" />Kirjastot</p>
            <p><span className="legend-dot legend-place" />Museot, nähtävyydet ja muut kohteet</p>
            <p><span className="legend-grid" />{gridYear === null ? "Väestöruutuja ei ole saatavilla valitulle vuodelle." : `Väestöruudut 1 km × 1 km, vuosi ${gridYear}`}</p>
            {gridYear !== null && String(gridYear) !== year && <p>Valittua vuotta edeltävä uusin julkaistu ruutuaineisto.</p>}
          </div>
          <div className="map-counts">
            <div><strong>{data?.detailsStatus === "ready" ? formatter.format(data.settlements.length) : data?.detailsStatus === "unavailable" ? "-" : "…"}</strong><span>paikannimeä</span></div>
            <div><strong>{data?.detailsStatus === "ready" ? formatter.format(data.places.length) : data?.detailsStatus === "unavailable" ? "-" : "…"}</strong><span>klikattavaa kohdetta</span></div>
          </div>
          <div className="place-list">
            <h3>Kohteet · myös näppäimistöllä</h3>
            {data?.places.length ? data.places.map((place) => (
              <button key={place.id} type="button" onClick={() => setSelectedPlace(place)}
                aria-pressed={selectedPlace?.id === place.id}>
                <Building2 size={15} aria-hidden="true" />
                <span>{place.name}</span>
                <small>{placeKindLabel(place.kind)}</small>
              </button>
            )) : <p>{mapResult?.error || data?.detailsStatus === "unavailable" ? "Kohdetietoja ei juuri nyt saada lähteestä." : data?.detailsStatus === "ready" ? "Kohteita ei löytynyt." : "Ladataan kohteita…"}</p>}
          </div>
          {selectedPlace && <div className="selected-place">
            <h3>{selectedPlace.name}</h3>
            <p>{placeKindLabel(selectedPlace.kind)}</p>
            {selectedPlace.address && <p>{selectedPlace.address}</p>}
            {selectedPlace.openingHours && <p>Aukiolo: {selectedPlace.openingHours}</p>}
            {safeWebsite(selectedPlace.website) && <a className="text-link" href={safeWebsite(selectedPlace.website)!} target="_blank" rel="noreferrer">Verkkosivut</a>}
          </div>}
          <p className="map-note">
            Väestökerros kuvaa ruutujen yhteenlaskettua väestöä, ei yksittäisiä koteja tai satelliitin yövaloja.
            Ruudut voivat ulottua kuntarajan yli. Kuntaraja on yleistetty (1:1 000 000), ei kiinteistöraja tai valitun vuoden historiallinen raja.
            OSM-nimet ja kohteet kuvaavat nykyistä kartoitusta; kattavuus vaihtelee. Näytetään enintään 200 nimeä ja 120 kohdetta, ei kunnan kaikkia palveluja.
          </p>
        </aside>
      </div>
    </section>
  );
}
