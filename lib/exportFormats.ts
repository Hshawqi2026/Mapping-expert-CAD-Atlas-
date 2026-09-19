import JSZip from "jszip";
import { GeoFeature, Project } from "../types";

const WGS84_PRJ =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';

type ShapeKind = "point" | "line" | "polygon";

function safe(value: unknown): string {
  return String(value ?? "").replace(
    /[<&>"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c] ?? c,
  );
}

function csv(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function featureShape(f: GeoFeature): ShapeKind {
  return f.type === "point" ? "point" : f.type === "line" ? "line" : "polygon";
}

export function generateCSV(_project: Project, features: GeoFeature[]): string {
  const headers = [
    "id",
    "type",
    "name",
    "category",
    "source",
    "latitude",
    "longitude",
    "elevation_m",
    "point_number",
    "point_code",
    "model_3d",
    "building_floors",
    "roof_style",
  ];
  const rows = features.flatMap((f) => {
    const coords = f.coords.length ? f.coords : [[0, 0] as [number, number]];
    return coords.map(([latitude, longitude], index) =>
      [
        f.id,
        f.type,
        f.name,
        f.category,
        f.source,
        latitude.toFixed(8),
        longitude.toFixed(8),
        f.elevation ?? "",
        index === 0 ? (f.pointNumber ?? "") : "",
        index === 0 ? (f.pointCode ?? "") : "",
        index === 0 ? (f.model3d ? "true" : "false") : "",
        index === 0 ? (f.buildingFloors ?? "") : "",
        index === 0 ? (f.roofStyle ?? "") : "",
      ]
        .map(csv)
        .join(","),
    );
  });
  return `﻿${headers.map(csv).join(",")}\n${rows.join("\n")}\n`;
}

export function generateGPX(project: Project, features: GeoFeature[]): string {
  const waypoints = features.flatMap((f) =>
    f.type === "point"
      ? f.coords.map(
          ([lat, lon], index) =>
            `<wpt lat="${lat}" lon="${lon}"><name>${safe(index ? `${f.name} ${index + 1}` : f.name)}</name><desc>${safe(f.category)}</desc>${f.elevation !== undefined ? `<ele>${f.elevation}</ele>` : ""}</wpt>`,
        )
      : [],
  );
  const tracks = features
    .filter((f) => f.type === "line" || f.type === "polygon")
    .map((f) => {
      const points = f.coords
        .map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"></trkpt>`)
        .join("");
      return `<trk><name>${safe(f.name)}</name><type>${safe(f.category)}</type><trkseg>${points}</trkseg></trk>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Agon Surveyor" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${safe(project.name)}</name></metadata>${waypoints.join("")}${tracks.join("")}</gpx>`;
}

export function generateSVG(project: Project, features: GeoFeature[]): string {
  const points = features.flatMap((f) =>
    f.coords.map(([lat, lon]) => ({ lat, lon })),
  );
  if (!points.length)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700"><text x="500" y="350" text-anchor="middle">${safe(project.name)}</text></svg>`;
  const minLon = Math.min(...points.map((p) => p.lon));
  const maxLon = Math.max(...points.map((p) => p.lon));
  const minLat = Math.min(...points.map((p) => p.lat));
  const maxLat = Math.max(...points.map((p) => p.lat));
  const pad = 60;
  const width = 1200;
  const height = 800;
  const scaleX = (width - pad * 2) / Math.max(maxLon - minLon, 0.000001);
  const scaleY = (height - pad * 2) / Math.max(maxLat - minLat, 0.000001);
  const projectPoint = ([lat, lon]: [number, number]) =>
    `${(pad + (lon - minLon) * scaleX).toFixed(2)},${(height - pad - (lat - minLat) * scaleY).toFixed(2)}`;
  const geometry = features
    .map((f) => {
      const color = f.color || "#0E7C66";
      const path = f.coords.map(projectPoint).join(" ");
      if (f.type === "point")
        return `<circle cx="${path.split(",")[0]}" cy="${path.split(",")[1]}" r="7" fill="${color}" stroke="#ffffff" stroke-width="2"><title>${safe(f.name)}</title></circle>`;
      return `<polyline points="${path}${f.type === "polygon" ? ` ${projectPoint(f.coords[0])}` : ""}" fill="${f.type === "polygon" ? `${color}33` : "none"}" stroke="${color}" stroke-width="3" stroke-linejoin="round"><title>${safe(f.name)}</title></polyline>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><text x="${width - pad}" y="34" text-anchor="end" font-family="sans-serif" font-size="24" fill="#0F1B14">${safe(project.name)}</text>${geometry}</svg>`;
}

export function generateKML(project: Project, features: GeoFeature[]): string {
  const placemarks = features
    .map((f) => {
      const coordinates = f.coords
        .map(([lat, lon]) => `${lon},${lat},${f.elevation ?? 0}`)
        .join(" ");
      const geometry =
        featureShape(f) === "point"
          ? `<Point><coordinates>${coordinates}</coordinates></Point>`
          : featureShape(f) === "line"
            ? `<LineString><tessellate>1</tessellate><coordinates>${coordinates}</coordinates></LineString>`
            : `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates}${coordinates ? ` ${coordinates.split(" ")[0]}` : ""}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      return `<Placemark><name>${safe(f.name)}</name><description>${safe(`الرمز: ${f.pointCode ?? ""} | المنسوب: ${f.elevation ?? ""} | التصنيف: ${f.category}`)}</description>${geometry}</Placemark>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${safe(project.name)}</name>${placemarks}</Document></kml>`;
}

function bounds(features: GeoFeature[]) {
  const points = features
    .flatMap((f) => f.coords)
    .map(([lat, lon]) => [lon, lat]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs, -180),
    minY: Math.min(...ys, -90),
    maxX: Math.max(...xs, 180),
    maxY: Math.max(...ys, 90),
  };
}

function writeHeader(
  view: DataView,
  shapeType: number,
  fileLengthWords: number,
  b: ReturnType<typeof bounds>,
) {
  view.setInt32(0, 9994, false);
  view.setInt32(24, fileLengthWords, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, shapeType, true);
  view.setFloat64(36, b.minX, true);
  view.setFloat64(44, b.minY, true);
  view.setFloat64(52, b.maxX, true);
  view.setFloat64(60, b.maxY, true);
  view.setFloat64(68, 0, true);
  view.setFloat64(76, 0, true);
}

function encodeShape(f: GeoFeature, kind: ShapeKind): Uint8Array {
  if (kind === "point") {
    const buffer = new ArrayBuffer(20);
    const view = new DataView(buffer);
    view.setInt32(0, 1, true);
    view.setFloat64(4, f.coords[0][1], true);
    view.setFloat64(12, f.coords[0][0], true);
    return new Uint8Array(buffer);
  }
  const coords = f.coords.map(([lat, lon]) => [lon, lat]);
  const ring =
    kind === "polygon" &&
    coords.length &&
    (coords[0][0] !== coords[coords.length - 1][0] ||
      coords[0][1] !== coords[coords.length - 1][1])
      ? [...coords, coords[0]]
      : coords;
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const partCount = 1;
  const pointCount = ring.length;
  const byteLength = 44 + partCount * 4 + pointCount * 16;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  view.setInt32(0, kind === "polygon" ? 5 : 3, true);
  view.setFloat64(4, Math.min(...xs), true);
  view.setFloat64(12, Math.min(...ys), true);
  view.setFloat64(20, Math.max(...xs), true);
  view.setFloat64(28, Math.max(...ys), true);
  view.setInt32(36, partCount, true);
  view.setInt32(40, pointCount, true);
  view.setInt32(44, 0, true);
  ring.forEach((p, i) => {
    const offset = 48 + i * 16;
    view.setFloat64(offset, p[0], true);
    view.setFloat64(offset + 8, p[1], true);
  });
  return new Uint8Array(buffer);
}

function buildShpFiles(features: GeoFeature[], kind: ShapeKind) {
  const shapes = features.map((f) => encodeShape(f, kind));
  const shapeType = kind === "point" ? 1 : kind === "line" ? 3 : 5;
  const b = bounds(features);
  const shpLength = 100 + shapes.reduce((sum, s) => sum + 8 + s.length, 0);
  const shp = new ArrayBuffer(shpLength);
  const shpView = new DataView(shp);
  writeHeader(shpView, shapeType, shpLength / 2, b);
  const shxLength = 100 + shapes.length * 8;
  const shx = new ArrayBuffer(shxLength);
  const shxView = new DataView(shx);
  writeHeader(shxView, shapeType, shxLength / 2, b);
  let shpOffsetWords = 50;
  shapes.forEach((shape, i) => {
    const shpOffset =
      100 + shapes.slice(0, i).reduce((sum, s) => sum + 8 + s.length, 0);
    shpView.setInt32(shpOffset, i + 1, false);
    shpView.setInt32(shpOffset + 4, shape.length / 2, false);
    new Uint8Array(shp).set(shape, shpOffset + 8);
    shxView.setInt32(100 + i * 8, shpOffsetWords, false);
    shxView.setInt32(104 + i * 8, shape.length / 2, false);
    shpOffsetWords += (shape.length + 8) / 2;
  });
  return { shp: new Uint8Array(shp), shx: new Uint8Array(shx) };
}

function writeDbf(features: GeoFeature[]): Uint8Array {
  const fields = [
    { name: "NAME", type: "C", length: 80, decimals: 0 },
    { name: "PT_NO", type: "C", length: 32, decimals: 0 },
    { name: "CODE", type: "C", length: 32, decimals: 0 },
    { name: "ELEV", type: "N", length: 18, decimals: 3 },
    { name: "CATEGORY", type: "C", length: 40, decimals: 0 },
  ];
  const recordLength = 1 + fields.reduce((s, f) => s + f.length, 0);
  const headerLength = 32 + fields.length * 32 + 1;
  const buffer = new ArrayBuffer(
    headerLength + features.length * recordLength + 1,
  );
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const now = new Date();
  view.setUint8(0, 3);
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, features.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  let offset = 32;
  fields.forEach((field) => {
    const name = new TextEncoder().encode(field.name);
    bytes.set(name.slice(0, 10), offset);
    view.setUint8(offset + 11, field.type.charCodeAt(0));
    view.setUint8(offset + 16, field.length);
    view.setUint8(offset + 17, field.decimals);
    offset += 32;
  });
  bytes[headerLength - 1] = 13;
  const encoder = new TextEncoder();
  features.forEach((f, i) => {
    let p = headerLength + i * recordLength;
    bytes[p++] = 32;
    const vals = [
      f.name,
      f.pointNumber ?? "",
      f.pointCode ?? "",
      f.elevation === undefined ? "" : f.elevation.toFixed(3),
      f.category,
    ];
    fields.forEach((field, j) => {
      const raw = encoder.encode(String(vals[j] ?? ""));
      const out = new Uint8Array(field.length);
      out.fill(32);
      out.set(
        raw.slice(0, field.length),
        field.type === "N" ? Math.max(0, field.length - raw.length) : 0,
      );
      bytes.set(out, p);
      p += field.length;
    });
  });
  bytes[buffer.byteLength - 1] = 26;
  return bytes;
}

export async function generateShapefileZip(
  project: Project,
  features: GeoFeature[],
): Promise<string> {
  const zip = new JSZip();
  const base =
    project.name.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "_").slice(0, 40) ||
    "project";
  (["point", "line", "polygon"] as ShapeKind[]).forEach((kind) => {
    const selected = features.filter((f) => featureShape(f) === kind);
    if (!selected.length) return;
    const files = buildShpFiles(selected, kind);
    const folder = zip.folder(`${base}_${kind}`)!;
    folder.file(`${base}_${kind}.shp`, files.shp);
    folder.file(`${base}_${kind}.shx`, files.shx);
    folder.file(`${base}_${kind}.dbf`, writeDbf(selected));
    folder.file(`${base}_${kind}.prj`, WGS84_PRJ);
  });
  return zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}
