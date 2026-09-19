import { GeoFeature, Project } from '../types';
import { latLonToUTM } from './geo';

// ---------------------------------------------------------------------------
// Real, valid ASCII DXF (AutoCAD R12 - AC1009) generator.
// R12 is used deliberately: it is the most universally compatible DXF
// dialect, readable by AutoCAD, BricsCAD, QGIS, Civil3D, Global Mapper, etc.
// Coordinates are projected to real-world UTM meters (WGS84) so the file is
// directly usable for engineering / surveying work.
// ---------------------------------------------------------------------------

interface LayerDef {
  name: string;
  color: number; // AutoCAD Color Index (ACI)
}

const LAYER_TABLE: Record<string, LayerDef> = {
  SURVEY_POINTS: { name: 'SURVEY_POINTS', color: 1 }, // red
  BUILDINGS: { name: 'BUILDINGS', color: 5 }, // blue
  BUILDINGS_OSM: { name: 'BUILDINGS_OSM', color: 150 }, // cyan-ish
  ROADS: { name: 'ROADS', color: 2 }, // yellow
  POI: { name: 'POI', color: 3 }, // green
  BOUNDARY: { name: 'BOUNDARY', color: 6 }, // magenta
  BUILDINGS_3D: { name: 'BUILDINGS_3D', color: 30 }, // orange
  LABELS: { name: 'LABELS', color: 7 }, // white/black
  METADATA: { name: 'METADATA', color: 8 }, // grey
};

function layerForFeature(f: GeoFeature): string {
  if (f.type === 'point') return 'SURVEY_POINTS';
  if (f.type === 'building') return f.source === 'osm' ? 'BUILDINGS_OSM' : 'BUILDINGS';
  if (f.type === 'line') return f.category === 'طريق' ? 'ROADS' : 'BOUNDARY';
  if (f.type === 'polygon') return 'BOUNDARY';
  return 'SURVEY_POINTS';
}

function dxfPair(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

function headerSection(minX: number, minY: number, maxX: number, maxY: number): string {
  let s = '0\nSECTION\n2\nHEADER\n';
  s += dxfPair(9, '$ACADVER') + dxfPair(1, 'AC1009');
  s += dxfPair(9, '$INSBASE') + '10\n0.0\n20\n0.0\n30\n0.0\n';
  s += dxfPair(9, '$EXTMIN') + `10\n${minX.toFixed(4)}\n20\n${minY.toFixed(4)}\n30\n0.0\n`;
  s += dxfPair(9, '$EXTMAX') + `10\n${maxX.toFixed(4)}\n20\n${maxY.toFixed(4)}\n30\n0.0\n`;
  s += dxfPair(9, '$MEASUREMENT') + dxfPair(70, 1);
  s += '0\nENDSEC\n';
  return s;
}

function tablesSection(usedLayers: Set<string>): string {
  let s = '0\nSECTION\n2\nTABLES\n';
  s += '0\nTABLE\n2\nLTYPE\n70\n1\n';
  s += '0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n';
  s += '0\nENDTAB\n';

  const layers = Array.from(usedLayers);
  s += '0\nTABLE\n2\nLAYER\n' + dxfPair(70, layers.length + 1);
  s += '0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n';
  for (const key of layers) {
    const def = LAYER_TABLE[key] ?? { name: key, color: 7 };
    s += '0\nLAYER\n';
    s += dxfPair(2, def.name);
    s += dxfPair(70, 0);
    s += dxfPair(62, def.color);
    s += dxfPair(6, 'CONTINUOUS');
  }
  s += '0\nENDTAB\n';

  s += '0\nTABLE\n2\nSTYLE\n70\n1\n';
  s += '0\nSTYLE\n2\nSTANDARD\n70\n0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n0\n42\n1.0\n3\ntxt\n4\n\n';
  s += '0\nENDTAB\n';

  s += '0\nENDSEC\n';
  return s;
}

function pointEntity(layer: string, x: number, y: number, radius: number): string {
  let s = '';
  s += '0\nPOINT\n' + dxfPair(8, layer);
  s += dxfPair(10, x.toFixed(4)) + dxfPair(20, y.toFixed(4)) + dxfPair(30, '0.0');
  s += '0\nCIRCLE\n' + dxfPair(8, layer);
  s += dxfPair(10, x.toFixed(4)) + dxfPair(20, y.toFixed(4)) + dxfPair(30, '0.0');
  s += dxfPair(40, radius.toFixed(3));
  return s;
}

function textEntity(layer: string, x: number, y: number, height: number, text: string): string {
  const safe = text.replace(/[\r\n]/g, ' ').slice(0, 120);
  let s = '0\nTEXT\n' + dxfPair(8, layer);
  s += dxfPair(10, (x + height * 0.6).toFixed(4)) + dxfPair(20, y.toFixed(4)) + dxfPair(30, '0.0');
  s += dxfPair(40, height.toFixed(3));
  s += dxfPair(1, safe);
  return s;
}

function polylineEntity(layer: string, pts: { x: number; y: number }[], closed: boolean): string {
  let s = '0\nPOLYLINE\n' + dxfPair(8, layer);
  s += dxfPair(66, 1);
  s += dxfPair(70, closed ? 1 : 0);
  for (const p of pts) {
    s += '0\nVERTEX\n' + dxfPair(8, layer);
    s += dxfPair(10, p.x.toFixed(4)) + dxfPair(20, p.y.toFixed(4)) + dxfPair(30, '0.0');
  }
  s += '0\nSEQEND\n';
  return s;
}

function face3DEntity(layer: string, pts: { x: number; y: number; z: number }[]): string {
  if (pts.length < 3) return '';
  const corners = pts.slice(0, 4);
  while (corners.length < 4) corners.push(corners[corners.length - 1]);
  let s = '0\n3DFACE\n' + dxfPair(8, layer);
  corners.forEach((p, i) => {
    const code = i === 0 ? 10 : i === 1 ? 11 : i === 2 ? 12 : 13;
    s += dxfPair(code, p.x.toFixed(4)) + dxfPair(code + 10, p.y.toFixed(4)) + dxfPair(code + 20, p.z.toFixed(3));
  });
  return s;
}

function triangulatedFaces(layer: string, pts: { x: number; y: number; z: number }[]): string {
  if (pts.length < 3) return '';
  let result = '';
  for (let i = 1; i < pts.length - 1; i += 1) {
    result += face3DEntity(layer, [pts[0], pts[i], pts[i + 1]]);
  }
  return result;
}

export interface DXFGenerationResult {
  dxf: string;
  zoneNumber: number;
  hemisphere: 'N' | 'S';
  featureCount: number;
  pointRadius: number;
}

export function generate3DDXF(project: Project, features: GeoFeature[]): DXFGenerationResult {
  const result = generateDXF(project, features);
  const modelFeatures = features.filter((f) => f.type === 'building' && f.model3d && (f.elevation ?? 0) > 0);
  if (!modelFeatures.length) return result;
  const origin = modelFeatures.flatMap((f) => f.coords)[0] ?? project.center;
  const zoneNumber = Math.floor((origin[1] + 180) / 6) + 1;
  let faces = '';
  for (const feature of modelFeatures) {
    const roof = feature.coords.map((c) => { const u = latLonToUTM(c[0], c[1], zoneNumber); return { x: u.easting, y: u.northing, z: feature.elevation ?? 0 }; });
    const base = roof.map((p) => ({ ...p, z: 0 }));
    faces += triangulatedFaces('BUILDINGS_3D', base);
    faces += triangulatedFaces('BUILDINGS_3D', roof);
    for (let i = 0; i < roof.length; i++) faces += face3DEntity('BUILDINGS_3D', [base[i], base[(i + 1) % base.length], roof[(i + 1) % roof.length], roof[i]]);
  }
  return { ...result, dxf: result.dxf.replace('0\nENDSEC\n0\nEOF\n', `${faces}0\nENDSEC\n0\nEOF\n`), featureCount: modelFeatures.length };
}

export function generateDXF(project: Project, features: GeoFeature[]): DXFGenerationResult {
  const allCoords = features.flatMap((f) => f.coords);
  const originLL = allCoords[0] ?? project.center;
  const zoneNumber = Math.floor((originLL[1] + 180) / 6) + 1;
  const hemisphere: 'N' | 'S' = originLL[0] >= 0 ? 'N' : 'S';

  const projected = features.map((f) => ({
    feature: f,
    pts: f.coords.map((c) => {
      const u = latLonToUTM(c[0], c[1], zoneNumber);
      return { x: u.easting, y: u.northing };
    }),
  }));

  const allX = projected.flatMap((p) => p.pts.map((pt) => pt.x));
  const allY = projected.flatMap((p) => p.pts.map((pt) => pt.y));
  const minX = allX.length ? Math.min(...allX) : 500000;
  const maxX = allX.length ? Math.max(...allX) : 500000;
  const minY = allY.length ? Math.min(...allY) : 0;
  const maxY = allY.length ? Math.max(...allY) : 0;

  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pointRadius = Math.max(0.15, span * 0.0025);
  const textHeight = Math.max(0.3, span * 0.004);

  const usedLayers = new Set<string>(['LABELS', 'METADATA', 'BUILDINGS_3D']);
  let entities = '0\nSECTION\n2\nENTITIES\n';

  for (const { feature, pts } of projected) {
    const layer = layerForFeature(feature);
    usedLayers.add(layer);

    if (feature.type === 'point') {
      entities += pointEntity(layer, pts[0].x, pts[0].y, pointRadius);
      entities += textEntity('LABELS', pts[0].x, pts[0].y, textHeight, feature.name);
    } else if (feature.type === 'building' || feature.type === 'polygon') {
      entities += polylineEntity(layer, pts, true);
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      entities += textEntity('LABELS', cx, cy, textHeight, feature.name);
    } else if (feature.type === 'line') {
      entities += polylineEntity(layer, pts, false);
      entities += textEntity('LABELS', pts[0].x, pts[0].y, textHeight, feature.name);
    }
  }

  // Metadata header text block near the top-left of the extents.
  const metaX = minX;
  const metaY = maxY + textHeight * 3;
  const metaLines = [
    `${project.name} - GeoSurvey Pro`,
    `UTM Zone ${zoneNumber}${hemisphere} / WGS84 - Units: Meters`,
    `Exported: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    `Features: ${features.length}`,
  ];
  metaLines.forEach((line, i) => {
    entities += textEntity('METADATA', metaX, metaY + i * textHeight * 1.4, textHeight * 0.8, line);
  });

  entities += '0\nENDSEC\n';

  const dxf =
    headerSection(minX, minY, maxX, Math.max(maxY, metaY + metaLines.length * textHeight * 1.4)) +
    tablesSection(usedLayers) +
    '0\nSECTION\n2\nBLOCKS\n0\nENDSEC\n' +
    entities +
    '0\nEOF\n';

  return { dxf, zoneNumber, hemisphere, featureCount: features.length, pointRadius };
}
