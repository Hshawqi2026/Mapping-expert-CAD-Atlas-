import { LatLng } from '../types';

// ---------------------------------------------------------------------------
// WGS84 -> UTM projection (Snyder 1987 formulas), accurate to sub-meter level.
// Used to produce real, engineering-grade planar meter coordinates for DXF.
// ---------------------------------------------------------------------------

const WGS84_A = 6378137.0;
const ECC_SQUARED = 0.00669438;
const K0 = 0.9996;

export interface UTMResult {
  easting: number;
  northing: number;
  zoneNumber: number;
  hemisphere: 'N' | 'S';
}

export function latLonToUTM(lat: number, lon: number, forceZone?: number): UTMResult {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const zoneNumber = forceZone ?? Math.floor((lon + 180) / 6) + 1;

  const lonOrigin = (zoneNumber - 1) * 6 - 180 + 3;
  const lonOriginRad = (lonOrigin * Math.PI) / 180;

  const eccPrimeSquared = ECC_SQUARED / (1 - ECC_SQUARED);

  const N = WGS84_A / Math.sqrt(1 - ECC_SQUARED * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = eccPrimeSquared * Math.cos(latRad) * Math.cos(latRad);
  const A = Math.cos(latRad) * (lonRad - lonOriginRad);

  const M =
    WGS84_A *
    ((1 - ECC_SQUARED / 4 - (3 * ECC_SQUARED * ECC_SQUARED) / 64 - (5 * ECC_SQUARED ** 3) / 256) * latRad -
      ((3 * ECC_SQUARED) / 8 + (3 * ECC_SQUARED * ECC_SQUARED) / 32 + (45 * ECC_SQUARED ** 3) / 1024) *
        Math.sin(2 * latRad) +
      ((15 * ECC_SQUARED * ECC_SQUARED) / 256 + (45 * ECC_SQUARED ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * ECC_SQUARED ** 3) / 3072) * Math.sin(6 * latRad));

  let easting =
    K0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * eccPrimeSquared) * A ** 5) / 120) +
    500000.0;

  let northing =
    K0 *
    (M +
      N *
        Math.tan(latRad) *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * eccPrimeSquared) * A ** 6) / 720));

  if (lat < 0) {
    northing += 10000000.0;
  }

  return {
    easting,
    northing,
    zoneNumber,
    hemisphere: lat >= 0 ? 'N' : 'S',
  };
}

export function utmToLatLon(easting: number, northing: number, zoneNumber: number, hemisphere: 'N' | 'S' = 'N'): LatLng {
  const eccPrimeSquared = ECC_SQUARED / (1 - ECC_SQUARED);
  const x = easting - 500000.0;
  const y = hemisphere === 'S' ? northing - 10000000.0 : northing;
  const M = y / K0;
  const mu = M / (WGS84_A * (1 - ECC_SQUARED / 4 - (3 * ECC_SQUARED ** 2) / 64 - (5 * ECC_SQUARED ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - ECC_SQUARED)) / (1 + Math.sqrt(1 - ECC_SQUARED));
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    (151 * e1 ** 3) / 96 * Math.sin(6 * mu) + (1097 * e1 ** 4) / 512 * Math.sin(8 * mu);
  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const N1 = WGS84_A / Math.sqrt(1 - ECC_SQUARED * sinPhi * sinPhi);
  const R1 = (WGS84_A * (1 - ECC_SQUARED)) / Math.pow(1 - ECC_SQUARED * sinPhi * sinPhi, 1.5);
  const T1 = tanPhi * tanPhi;
  const C1 = eccPrimeSquared * cosPhi * cosPhi;
  const D = x / (N1 * K0);
  const lat = phi1 - (N1 * tanPhi) / R1 * (D * D / 2 -
    (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * eccPrimeSquared) * D ** 4 / 24 +
    (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * eccPrimeSquared - 3 * C1 * C1) * D ** 6 / 720);
  const lonOrigin = (zoneNumber - 1) * 6 - 180 + 3;
  const lon = (lonOrigin * Math.PI) / 180 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 +
    (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * eccPrimeSquared + 24 * T1 ** 2) * D ** 5 / 120) / cosPhi;
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}

// Haversine distance in meters
export function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pathLength(coords: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(coords[i - 1], coords[i]);
  }
  return total;
}

// Polygon area in square meters via planar (UTM) shoelace formula - accurate for
// site-scale surveys.
export function polygonAreaSqMeters(coords: LatLng[]): number {
  if (coords.length < 3) return 0;
  const zone = Math.floor(((coords[0][1] + 180) / 6) + 1);
  const pts = coords.map((c) => latLonToUTM(c[0], c[1], zone));
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    sum += p1.easting * p2.northing - p2.easting * p1.northing;
  }
  return Math.abs(sum / 2);
}

export function formatArea(sqMeters: number): string {
  if (sqMeters >= 10000) {
    return `${(sqMeters / 10000).toFixed(3)} هكتار`;
  }
  return `${sqMeters.toFixed(1)} م²`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} كم`;
  return `${meters.toFixed(1)} م`;
}

export function toDMS(deg: number, isLat: boolean): string {
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const minFloat = (abs - d) * 60;
  const m = Math.floor(minFloat);
  const s = (minFloat - m) * 60;
  return `${d}°${m}'${s.toFixed(1)}" ${dir}`;
}

export function boundsFromCoords(coords: LatLng[]) {
  const lats = coords.map((c) => c[0]);
  const lons = coords.map((c) => c[1]);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lons),
    west: Math.min(...lons),
  };
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
