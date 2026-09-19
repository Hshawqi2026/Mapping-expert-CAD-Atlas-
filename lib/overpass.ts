import { GeoFeature, LatLng, MapBounds } from '../types';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

export const MIN_ZOOM_FOR_FETCH = 15;

function bboxString(b: MapBounds): string {
  return `${b.south},${b.west},${b.north},${b.east}`;
}

function buildQuery(b: MapBounds, buildingsOnly = false): string {
  const bbox = bboxString(b);
  const selectors = buildingsOnly
    ? `way["building"](${bbox});\n    relation["building"]["type"="multipolygon"](${bbox});`
    : `way["building"](${bbox});
    relation["building"]["type"="multipolygon"](${bbox});
    node["amenity"](${bbox});
    node["shop"](${bbox});
    node["tourism"](${bbox});
    node["office"](${bbox});
    way["highway"]["highway"!~"^(footway|path|steps|corridor)$"](${bbox});
    way["landuse"](${bbox});
    way["natural"~"water|wood"](${bbox});`;
  return `[out:json][timeout:90];(${selectors});out geom qt;`;
}

function pickName(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined;
  return tags['name:ar'] || tags.name || tags['name:en'] || undefined;
}

function categoryFromTags(tags: Record<string, string>): { type: GeoFeature['type']; category: string } {
  if (tags.building) return { type: 'building', category: 'مبنى' };
  if (tags.highway) return { type: 'line', category: 'طريق' };
  if (tags.landuse) return { type: 'polygon', category: 'استخدام أرض' };
  if (tags.natural === 'water') return { type: 'polygon', category: 'مسطح مائي' };
  if (tags.natural === 'wood') return { type: 'polygon', category: 'غابة' };
  if (tags.amenity) return { type: 'point', category: `مرفق (${tags.amenity})` };
  if (tags.shop) return { type: 'point', category: `متجر (${tags.shop})` };
  if (tags.tourism) return { type: 'point', category: `سياحي (${tags.tourism})` };
  if (tags.office) return { type: 'point', category: `مكتب (${tags.office})` };
  return { type: 'point', category: 'معلم' };
}

async function fetchFromEndpoint(endpoint: string, query: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: query, signal });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

function splitBounds(bounds: MapBounds): MapBounds[] {
  const latSpan = Math.abs(bounds.north - bounds.south);
  const lonSpan = Math.abs(bounds.east - bounds.west);
  const maxSpan = 0.012;
  const rows = Math.max(1, Math.ceil(latSpan / maxSpan));
  const cols = Math.max(1, Math.ceil(lonSpan / maxSpan));
  const total = rows * cols;
  if (total > 144) {
    const factor = Math.sqrt(144 / total);
    const limitedRows = Math.max(1, Math.ceil(rows * factor));
    const limitedCols = Math.max(1, Math.ceil(cols * factor));
    return splitGrid(bounds, limitedRows, limitedCols);
  }
  return splitGrid(bounds, rows, cols);
}

function splitGrid(bounds: MapBounds, rows: number, cols: number): MapBounds[] {
  const latStep = (bounds.north - bounds.south) / rows;
  const lonStep = (bounds.east - bounds.west) / cols;
  const tiles: MapBounds[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    tiles.push({
      south: bounds.south + r * latStep,
      north: r === rows - 1 ? bounds.north : bounds.south + (r + 1) * latStep,
      west: bounds.west + c * lonStep,
      east: c === cols - 1 ? bounds.east : bounds.west + (c + 1) * lonStep,
    });
  }
  return tiles;
}

export interface OverpassResult {
  features: GeoFeature[];
  counts: { buildings: number; poi: number; roads: number; other: number };
}

export async function fetchOSMFeatures(bounds: MapBounds, signal?: AbortSignal, options?: { buildingsOnly?: boolean }): Promise<OverpassResult> {
  const buildingsOnly = options?.buildingsOnly ?? false;
  const tiles = splitBounds(bounds);
  const unique = new Map<string, GeoFeature>();
  let lastError: any = null;

  for (const tile of tiles) {
    let data: any = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try { data = await fetchFromEndpoint(endpoint, buildQuery(tile, buildingsOnly), signal); break; }
      catch (e) { lastError = e; }
    }
    if (!data) continue;
    for (const el of data.elements ?? []) {
      const tags: Record<string, string> = el.tags ?? {};
      if (!Object.keys(tags).length) continue;
      const { type, category } = categoryFromTags(tags);
      let coords: LatLng[] = [];
      if (el.type === 'node') coords = [[el.lat, el.lon]];
      else if (el.type === 'way' && Array.isArray(el.geometry)) coords = el.geometry.map((g: any) => [g.lat, g.lon] as LatLng);
      else if (el.type === 'relation' && Array.isArray(el.members)) {
        const outers = el.members.filter((m: any) => m.role === 'outer' && Array.isArray(m.geometry));
        const longest = outers.sort((a: any, b: any) => (b.geometry?.length ?? 0) - (a.geometry?.length ?? 0))[0];
        if (longest) coords = longest.geometry.map((g: any) => [g.lat, g.lon] as LatLng);
      }
      if (!coords.length || ((type === 'polygon' || type === 'building') && coords.length < 3)) continue;
      const id = `${el.type}/${el.id}`;
      if (unique.has(id)) continue;
      unique.set(id, {
        id: `osm-${el.type}-${el.id}`, type, name: pickName(tags) ?? category, category, coords,
        source: 'osm', color: type === 'building' ? '#38bdf8' : type === 'line' ? '#fbbf24' : '#34d399',
        createdAt: Date.now(), osmTags: tags, osmId: id,
        layerId: buildingsOnly ? 'osm-buildings' : `osm-${type}`, visible: true,
      });
    }
  }

  if (!unique.size && lastError) throw new Error(lastError?.message?.includes('abort') ? 'تم إلغاء الطلب' : 'تعذر جلب بيانات المنطقة كاملة من خدمة الخرائط.');
  const features = [...unique.values()];
  const counts = { buildings: features.filter((f) => f.type === 'building').length, poi: features.filter((f) => f.type === 'point').length, roads: features.filter((f) => f.type === 'line').length, other: features.filter((f) => f.type !== 'building' && f.type !== 'point' && f.type !== 'line').length };
  return { features, counts };
}
