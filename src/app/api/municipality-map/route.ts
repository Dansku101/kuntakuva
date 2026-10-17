import type { FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import type { NextRequest } from "next/server";

type BoundaryResponse = FeatureCollection<Geometry, { kunta: string; nimi: string; vuosi: number }>;
const BOUNDARY_URL = "https://geo.stat.fi/geoserver/tilastointialueet/wfs";
const APP_USER_AGENT = "Kuntakuva/0.1 (+https://github.com/Dansku101/kuntakuva)";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: {
    "Cache-Control": init?.status && init.status >= 400 ? "no-store" : "public, max-age=3600, stale-while-revalidate=86400",
    ...init?.headers,
  } });
}

function isSupportedGeometry(geometry: Geometry): geometry is Polygon | MultiPolygon {
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
}

async function fetchBoundary(code: string, signal?: AbortSignal) {
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
    signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]),
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

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code?.match(/^KU\d{3}$/)) return json({ error: "Invalid municipality parameters." }, { status: 400 });
  try {
    request.signal?.throwIfAborted();
    const boundary = await fetchBoundary(code, request.signal);
    if (!boundary) return json({ error: "Kunnan rajaa ei löytynyt avoimista karttalähteistä." }, { status: 404 });
    const name = boundary.properties.nimi;
    return json({ code, name, bbox: boundary.bbox, boundary: {
      type: "Feature", geometry: boundary.geometry,
      properties: { name, displayName: name, source: "Tilastokeskus, kuntajako 2026 (1:1 000 000)" },
    } });
  } catch (error) {
    if (request.signal?.aborted) return json({ error: "Request cancelled." }, { status: 499 });
    console.error("Municipality boundary unavailable:", error);
    return json({ error: "Kuntarajaa ei saatu ladattua juuri nyt." }, { status: 502 });
  }
}
