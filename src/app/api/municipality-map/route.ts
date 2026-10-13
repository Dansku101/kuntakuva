import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import type { NextRequest } from "next/server";
import { safeWebsite } from "../../../lib/map-data";

type BoundaryFeature = Feature<Geometry, {
  kunta: string;
  nimi: string;
  vuosi: number;
}>;
type BoundaryResponse = FeatureCollection<Geometry, BoundaryFeature["properties"]>;
type OverpassElement = {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};
type OverpassResponse = { elements?: OverpassElement[]; remark?: string };

const BOUNDARY_URL = "https://geo.stat.fi/geoserver/tilastointialueet/wfs";
const OVERPASS_URLS = ["https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"];
const overpassCache = new Map<string, { expires: number; pending: Promise<OverpassResponse> }>();
const APP_USER_AGENT = "Kuntakuva/0.1 (+https://github.com/Dansku101/kuntakuva)";
const PLACE_TYPES = new Set(["museum", "library", "attraction", "gallery", "viewpoint", "historic", "park"]);

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": init?.status && init.status >= 400 ? "no-store" : "public, max-age=3600, stale-while-revalidate=86400",
      ...init?.headers,
    },
  });
}

function isSupportedGeometry(geometry: Geometry): geometry is Polygon | MultiPolygon {
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
}

function getFeaturePoint(element: OverpassElement) {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function pointInRing(point: { lat: number; lon: number }, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInBoundary(point: { lat: number; lon: number }, geometry: Polygon | MultiPolygon) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => {
    const [outer, ...holes] = polygon;
    return pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole));
  });
}

function classifyPlace(tags: Record<string, string>) {
  if (tags.amenity === "library") return "library";
  if (tags.tourism === "museum") return "museum";
  if (tags.tourism === "gallery") return "gallery";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.tourism === "attraction") return "attraction";
  if (tags.historic) return "historic";
  if (tags.leisure === "park") return "park";
  return null;
}

function displayAddress(tags: Record<string, string>) {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const city = tags["addr:city"];
  return [street || undefined, city].filter(Boolean).join(", ") || null;
}

function simplifyPlaces(elements: OverpassElement[], boundary: Polygon | MultiPolygon) {
  const seen = new Set<string>();
  const settlements: { id: string; name: string; kind: string; lat: number; lon: number; population: string | null }[] = [];
  const places = [];
  for (const element of elements) {
    const point = getFeaturePoint(element);
    const tags = element.tags ?? {};
    const name = (tags["name:fi"] || tags.name || tags["name:sv"])?.trim();
    if (!point || !name || !pointInBoundary(point, boundary)) continue;
    const key = `${element.type}-${element.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Only settlement nodes have a deliberately mapped label position.
    if (tags.place && element.type === "node" && ["city", "town", "village", "hamlet", "suburb", "neighbourhood"].includes(tags.place)) {
      if (settlements.some((item) => item.name === name && item.kind === tags.place)) continue;
      settlements.push({
        id: key,
        name,
        kind: tags.place,
        lat: point.lat,
        lon: point.lon,
        population: tags.population ?? null,
      });
      continue;
    }

    const kind = classifyPlace(tags);
    if (!kind || !PLACE_TYPES.has(kind)) continue;
    places.push({
      id: key,
      name,
      kind,
      lat: point.lat,
      lon: point.lon,
      address: displayAddress(tags),
      website: safeWebsite(tags.website || tags["contact:website"]),
      operator: tags.operator ?? null,
      openingHours: tags.opening_hours ?? null,
    });
  }

  return {
    settlements: settlements.sort((a, b) => {
      const rank = ["city", "town", "village", "hamlet", "suburb", "neighbourhood"];
      return rank.indexOf(a.kind) - rank.indexOf(b.kind) || a.name.localeCompare(b.name, "fi");
    }).slice(0, 200),
    places: places.sort((a, b) => a.name.localeCompare(b.name, "fi")).slice(0, 120),
  };
}

async function fetchBoundary(code: string) {
  const params = new URLSearchParams({
    service: "WFS", version: "1.0.0", request: "GetFeature",
    typeName: "tilastointialueet:kunta1000k_2026",
    outputFormat: "application/json", srsName: "EPSG:4326",
    CQL_FILTER: `kunta='${code.slice(2)}'`,
  });
  const response = await fetch(`${BOUNDARY_URL}?${params}`, {
    headers: { "User-Agent": APP_USER_AGENT, Accept: "application/geo+json" },
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 * 14 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Boundary request failed: ${response.status}`);
  const data = await response.json() as BoundaryResponse;
  const feature = data.features?.[0];
  if (data.features?.length !== 1 || !feature?.geometry || !isSupportedGeometry(feature.geometry) ||
      feature.properties?.kunta !== code.slice(2) || feature.properties.vuosi !== 2026 ||
      typeof feature.properties.nimi !== "string") return null;
  // Derive bounds from the verified geometry, not an unrelated response envelope.
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) for (const ring of polygon) {
    if (ring.length < 4) return null;
    for (const [lon, lat] of ring) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
      bbox[0] = Math.min(bbox[0], lon); bbox[1] = Math.min(bbox[1], lat);
      bbox[2] = Math.max(bbox[2], lon); bbox[3] = Math.max(bbox[3], lat);
    }
  }
  if (!bbox.every(Number.isFinite) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return null;
  return { ...feature, bbox, geometry: feature.geometry };
}

function fetchOverpassData(bbox: number[]) {
  const key = bbox.join(",");
  const cached = overpassCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.pending;
  const pending = requestOverpassData(bbox);
  if (overpassCache.size >= 64) overpassCache.delete(overpassCache.keys().next().value!);
  overpassCache.set(key, { expires: Date.now() + 3600_000, pending });
  pending.catch(() => { if (overpassCache.get(key)?.pending === pending) overpassCache.delete(key); });
  return pending;
}

async function requestOverpassData(bbox: number[]) {
  const [west, south, east, north] = bbox;
  const query = `
    [out:json][timeout:25][maxsize:67108864][bbox:${south},${west},${north},${east}];
    (
      node["place"~"^(city|town|village|hamlet|suburb|neighbourhood)$"];
      node["amenity"="library"];
      way["amenity"="library"];
      relation["amenity"="library"];
      node["tourism"~"^(museum|attraction|gallery|viewpoint)$"];
      way["tourism"~"^(museum|attraction|gallery|viewpoint)$"];
      relation["tourism"~"^(museum|attraction|gallery|viewpoint)$"];
      node["historic"];
      way["historic"];
      relation["historic"];
      node["leisure"="park"]["name"];
      way["leisure"="park"]["name"];
      relation["leisure"="park"]["name"];
    );
    out center tags;
  `;
  const options: RequestInit = {
    headers: {
      "User-Agent": APP_USER_AGENT,
      Accept: "application/json",
    },
    // HTTP 200 can contain a timeout remark. Cache only validated successes above.
    cache: "no-store",
  };
  let lastError: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(`${url}?${new URLSearchParams({ data: query })}`, {
        ...options,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Overpass request failed: ${response.status}`);
      }
      const data = await response.json() as OverpassResponse;
      if (!Array.isArray(data.elements) || data.remark) throw new Error("Incomplete Overpass response");
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (!code?.match(/^KU\d{3}$/)) {
    return json({ error: "Invalid municipality parameters." }, { status: 400 });
  }

  try {
    const boundary = await fetchBoundary(code);
    if (!boundary?.bbox || !isSupportedGeometry(boundary.geometry)) {
      return json({ error: "Kunnan rajaa ei löytynyt avoimista karttalähteistä." }, { status: 404 });
    }
    const boundaryOnly = params.get("details") === "0";
    const name = boundary.properties.nimi;
    let detailsStatus: "loading" | "ready" | "unavailable" = boundaryOnly ? "loading" : "ready";
    let overpass: OverpassResponse = { elements: [] };
    if (!boundaryOnly) {
      try {
        overpass = await fetchOverpassData(boundary.bbox);
      } catch (error) {
        console.warn("Municipality map places unavailable:", error);
        detailsStatus = "unavailable";
      }
    }
    const { settlements, places } = simplifyPlaces(overpass.elements ?? [], boundary.geometry);
    return json({
      code,
      name,
      boundary: {
        type: "Feature",
        geometry: boundary.geometry,
        properties: {
          name,
          displayName: name,
          source: "Tilastokeskus, kuntajako 2026 (1:1 000 000)",
        },
      },
      bbox: boundary.bbox,
      settlements,
      places,
      detailsStatus,
      attribution: {
        boundaryAndPlaces: "Kuntaraja: Tilastokeskus · Kohteet: © OpenStreetMap contributors",
        populationGrid: "Tilastokeskus, väestöruutuaineisto 1 km x 1 km",
      },
    }, { headers: detailsStatus !== "ready" ? { "Cache-Control": "no-store" } : {} });
  } catch (error) {
    console.error("Municipality map data unavailable:", error);
    return json({ error: "Kartta-aineistoa ei saatu ladattua juuri nyt." }, { status: 502 });
  }
}
