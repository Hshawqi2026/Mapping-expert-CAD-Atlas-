import * as XLSX from "xlsx";
import { GeoFeature, LatLng } from "../types";
import { uid, utmToLatLon } from "./geo";

export interface ImportOptions {
  utmZone: number;
  hemisphere: "N" | "S";
}

export interface ImportResult {
  features: GeoFeature[];
  coords: LatLng[];
  kind: "excel" | "geojson" | "kml" | "gpx" | "csv";
}

const IMPORT_COLOR = "#2563EB";

function finite(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : Number(
          String(value ?? "")
            .replace(",", ".")
            .trim(),
        );
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function kmlColorToHex(value: string): { color?: string; fillOpacity?: number } {
  const raw = value.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{8}$/i.test(raw)) return {};
  const alpha = parseInt(raw.slice(0, 2), 16) / 255;
  return { color: `#${raw.slice(6, 8)}${raw.slice(4, 6)}${raw.slice(2, 4)}`, fillOpacity: Math.max(0.08, Math.min(1, alpha)) };
}

function makePointFeature(
  coords: LatLng,
  name: string,
  code: string,
  elevation?: number,
  extras?: Partial<GeoFeature>,
): GeoFeature {
  return {
    id: uid(),
    type: "point",
    name: name || code || "نقطة مستوردة",
    category: "نقطة رفع مساحي",
    coords: [coords],
    source: "imported",
    color: IMPORT_COLOR,
    createdAt: Date.now(),
    pointNumber: name || undefined,
    pointCode: code || undefined,
    elevation,
    ...extras,
  };
}

function parseExcel(base64: string, options: ImportOptions): GeoFeature[] {
  const workbook = XLSX.read(base64, { type: "base64", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("لم يتم العثور على ورقة بيانات في ملف Excel.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  const features: GeoFeature[] = [];
  rows.forEach((row, index) => {
    const values = Array.isArray(row) ? row : [];
    const easting = finite(values[1]);
    const northing = finite(values[2]);
    if (easting === null || northing === null) return;
    const pointNumber = text(values[0]) || String(index);
    const elevation = finite(values[3]);
    const pointCode = text(values[5]);
    const coords = utmToLatLon(
      easting,
      northing,
      options.utmZone,
      options.hemisphere,
    );
    features.push(
      makePointFeature(coords, pointNumber, pointCode, elevation ?? undefined, {
        easting,
        northing,
      }),
    );
  });
  if (!features.length)
    throw new Error(
      "لم يتم العثور على صفوف مساحية صالحة. تأكد من الأعمدة A/B/C/D/F والإحداثيات UTM.",
    );
  return features;
}

function coordinatesFromGeoJson(value: any): LatLng[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    if (typeof value[0] === "number") {
      const [lon, lat] = value;
      return Number.isFinite(lat) && Number.isFinite(lon) ? [[lat, lon]] : [];
    }
    return value.flatMap(coordinatesFromGeoJson);
  }
  if (value.type === "FeatureCollection")
    return (value.features ?? []).flatMap(coordinatesFromGeoJson);
  if (value.type === "Feature") return coordinatesFromGeoJson(value.geometry);
  if (value.type === "GeometryCollection")
    return (value.geometries ?? []).flatMap(coordinatesFromGeoJson);
  if (Array.isArray(value.coordinates)) {
    if (typeof value.coordinates[0] === "number") {
      const [lon, lat] = value.coordinates;
      return Number.isFinite(lat) && Number.isFinite(lon) ? [[lat, lon]] : [];
    }
    return value.coordinates.flatMap(coordinatesFromGeoJson);
  }
  return [];
}

function featuresFromGeoJson(json: any): GeoFeature[] {
  const rawFeatures =
    json?.type === "FeatureCollection"
      ? (json.features ?? [])
      : json?.type === "Feature"
        ? [json]
        : [];
  if (!rawFeatures.length && json?.type) {
    const coords = coordinatesFromGeoJson(json);
    return coords.map((c, i) => makePointFeature(c, `GeoJSON ${i + 1}`, ""));
  }
  return rawFeatures.flatMap((feature: any, index: number) => {
    const coords = coordinatesFromGeoJson(feature.geometry);
    if (!coords.length) return [];
    const geometryType = String(
      feature.geometry?.type ?? "Point",
    ).toLowerCase();
    const type = geometryType.includes("polygon")
      ? "polygon"
      : geometryType.includes("line")
        ? "line"
        : "point";
    const props = feature.properties ?? {};
    return [
      {
        ...makePointFeature(
          coords[0],
          text(props.name) || `عنصر GeoJSON ${index + 1}`,
          text(props.code),
          finite(props.elevation) ?? undefined,
        ),
        type,
        coords,
        category: text(props.category) || `مستورد ${type}`,
        notes: text(props.description) || undefined,
      } as GeoFeature,
    ];
  });
}

function featuresFromKml(textContent: string): GeoFeature[] {
  const features: GeoFeature[] = [];
  const placemarks = textContent.match(/<Placemark[\s\S]*?<\/Placemark>/gi) ?? [
    textContent,
  ];
  placemarks.forEach((placemark, index) => {
    const name = decodeXml(
      placemark.match(/<name[^>]*>([\s\S]*?)<\/name>/i)?.[1]?.trim() ??
      `KML ${index + 1}`,
    );
    const description = decodeXml(placemark.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ?? '');
    const styleColor = placemark.match(/<(?:color|PolyStyle>\s*<color)[^>]*>([0-9a-f]{8})<\/[^>]*color>/i)?.[1] ?? '';
    const style = kmlColorToHex(styleColor);
    const raw =
      placemark.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i)?.[1] ??
      "";
    const coords = raw
      .trim()
      .split(/\s+/)
      .flatMap((pair) => {
        const [lon, lat] = pair.split(",").map(Number);
        return Number.isFinite(lat) && Number.isFinite(lon)
          ? [[lat, lon] as LatLng]
          : [];
      });
    if (!coords.length) return;
    const type =
      /<Polygon\b/i.test(placemark)
        ? 'polygon'
        : /<(?:LineString|Track|MultiGeometry)\b/i.test(placemark) || coords.length > 1
          ? 'line'
          : 'point';
    features.push({
      ...makePointFeature(coords[0], name, '', undefined, { notes: description || undefined, ...style }),
      type,
      coords,
      category: `مستورد ${type}`,
    });
  });
  return features;
}

function featuresFromGpx(textContent: string): GeoFeature[] {
  const features: GeoFeature[] = [];
  const points = textContent.match(/<(?:wpt|trkpt)\b[^>]*>/gi) ?? [];
  points.forEach((tag, index) => {
    const lat = Number(tag.match(/\blat=["']([^"']+)/i)?.[1]);
    const lon = Number(tag.match(/\blon=["']([^"']+)/i)?.[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon))
      features.push(makePointFeature([lat, lon], `GPX ${index + 1}`, ""));
  });
  return features;
}

function featuresFromCsv(textContent: string): GeoFeature[] {
  const lines = textContent.split(/\r?\n/).filter(Boolean);
  const features: GeoFeature[] = [];
  lines.forEach((line, index) => {
    const cols = line.split(/[;,\t]/).map((v) => v.trim());
    const first = finite(cols[0]);
    const second = finite(cols[1]);
    if (first === null || second === null) return;
    // CSV import accepts the common longitude,latitude order.
    const coords: LatLng =
      Math.abs(first) <= 90 ? [first, second] : [second, first];
    features.push(
      makePointFeature(
        coords,
        text(cols[2]) || `CSV ${index + 1}`,
        text(cols[3]),
        finite(cols[4]) ?? undefined,
      ),
    );
  });
  return features;
}

export function parseImportedFile(
  input: { name: string; text?: string; base64?: string },
  options: ImportOptions,
): ImportResult {
  const lower = input.name.toLowerCase();
  let features: GeoFeature[];
  let kind: ImportResult["kind"];
  if (/\.(xlsx|xls)$/.test(lower)) {
    if (!input.base64) throw new Error("تعذر قراءة ملف Excel.");
    features = parseExcel(input.base64, options);
    kind = "excel";
  } else if (/\.geojson?$/.test(lower)) {
    try {
      features = featuresFromGeoJson(JSON.parse(input.text ?? ""));
    } catch {
      throw new Error("ملف GeoJSON غير صالح.");
    }
    kind = "geojson";
  } else if (/\.kml$/.test(lower)) {
    features = featuresFromKml(input.text ?? "");
    kind = "kml";
  } else if (/\.gpx$/.test(lower)) {
    features = featuresFromGpx(input.text ?? "");
    kind = "gpx";
  } else {
    features = featuresFromCsv(input.text ?? "");
    kind = "csv";
  }
  if (!features.length)
    throw new Error("لم يتم العثور على بيانات جغرافية قابلة للاستيراد.");
  return {
    features,
    coords: features.flatMap((feature) => feature.coords),
    kind,
  };
}
