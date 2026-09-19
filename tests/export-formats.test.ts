import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  generateCSV,
  generateGPX,
  generateKML,
  generateSVG,
  generateShapefileZip,
} from "../lib/exportFormats";
import { GeoFeature, Project } from "../types";

const project: Project = {
  id: "p",
  name: "مشروع اختبار",
  createdAt: 0,
  updatedAt: 0,
  center: [24.7, 46.6],
  zoom: 15,
  features: [],
};
const features: GeoFeature[] = [
  {
    id: "1",
    type: "point",
    name: "P-001",
    category: "نقطة رفع مساحي",
    coords: [[24.7, 46.6]],
    source: "imported",
    color: "#2563EB",
    createdAt: 0,
    pointNumber: "P-001",
    pointCode: "BM",
    elevation: 612.4,
  },
  {
    id: "2",
    type: "line",
    name: "خط اختبار",
    category: "خط",
    coords: [
      [24.7, 46.6],
      [24.71, 46.61],
    ],
    source: "manual",
    color: "#0E7C66",
    createdAt: 0,
  },
];

describe("export formats", () => {
  it("creates KML with point metadata and geometries", () => {
    const kml = generateKML(project, features);
    expect(kml).toContain("<kml");
    expect(kml).toContain("P-001");
    expect(kml).toContain("612.4");
    expect(kml).toContain("<LineString>");
  });

  it("creates a ZIP containing complete Shapefile component sets", async () => {
    const base64 = await generateShapefileZip(project, features);
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const names = Object.keys(zip.files);
    expect(names.some((name) => name.endsWith(".shp"))).toBe(true);
    expect(names.some((name) => name.endsWith(".shx"))).toBe(true);
    expect(names.some((name) => name.endsWith(".dbf"))).toBe(true);
    expect(names.some((name) => name.endsWith(".prj"))).toBe(true);
  });

  it("creates field-friendly CSV, GPX, and SVG exports", () => {
    const csv = generateCSV(project, features);
    expect(csv).toContain("latitude");
    expect(csv).toContain("P-001");

    const gpx = generateGPX(project, features);
    expect(gpx).toContain("<gpx");
    expect(gpx).toContain("P-001");
    expect(gpx).toContain("<trk>");

    const svg = generateSVG(project, features);
    expect(svg).toContain("<svg");
    expect(svg).toContain("خط اختبار");
  });
});
