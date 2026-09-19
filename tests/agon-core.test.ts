import { describe, expect, it } from "vitest";

import { formatArea, formatDistance, latLonToUTM, pathLength, polygonAreaSqMeters } from "../lib/geo";
import { generateDXF } from "../lib/dxfWriter";
import type { GeoFeature, Project } from "../types";

describe("AGON surveying core", () => {
  it("formats metric distance and area for field work", () => {
    expect(formatDistance(1250)).toBe("1.25 كم");
    expect(formatArea(15000)).toBe("1.500 هكتار");
  });

  it("projects geographic coordinates into a northern UTM zone", () => {
    const result = latLonToUTM(24.7136, 46.6753);
    expect(result.zoneNumber).toBe(38);
    expect(result.hemisphere).toBe("N");
    expect(result.easting).toBeGreaterThan(0);
    expect(result.northing).toBeGreaterThan(0);
  });

  it("calculates line length and polygon area", () => {
    const line = pathLength([
      [24.7136, 46.6753],
      [24.7146, 46.6753],
    ]);
    const area = polygonAreaSqMeters([
      [24.7136, 46.6753],
      [24.7136, 46.6743],
      [24.7146, 46.6743],
      [24.7146, 46.6753],
    ]);

    expect(line).toBeGreaterThan(100);
    expect(area).toBeGreaterThan(9000);
  });

  it("generates an AutoCAD R12 DXF with separate engineering layers", () => {
    const project: Project = {
      id: "project-1",
      name: "اختبار ميداني",
      createdAt: 0,
      updatedAt: 0,
      center: [24.7136, 46.6753],
      zoom: 15,
      features: [],
    };
    const feature: GeoFeature = {
      id: "point-1",
      type: "point",
      name: "نقطة 1",
      category: "نقطة مساحية",
      coords: [[24.7136, 46.6753]],
      source: "manual",
      color: "#0E7C66",
      createdAt: 0,
    };

    const result = generateDXF(project, [feature]);
    expect(result.dxf).toContain("$ACADVER");
    expect(result.dxf).toContain("SURVEY_POINTS");
    expect(result.dxf).toContain("نقطة 1");
    expect(result.zoneNumber).toBe(38);
    expect(result.featureCount).toBe(1);
  });
});
