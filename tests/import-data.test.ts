import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseImportedFile } from "../lib/importData";
import { latLonToUTM, utmToLatLon } from "../lib/geo";

describe("survey data import", () => {
  it("round-trips Riyadh coordinates through UTM zone 38N", () => {
    const source: [number, number] = [24.7136, 46.6753];
    const utm = latLonToUTM(source[0], source[1], 38);
    const restored = utmToLatLon(utm.easting, utm.northing, 38, "N");
    expect(Math.abs(restored[0] - source[0])).toBeLessThan(0.00001);
    expect(Math.abs(restored[1] - source[1])).toBeLessThan(0.00001);
  });

  it("imports Excel columns A/B/C/D/F as survey point metadata", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["رقم النقطة", "الشرقي", "الشمالي", "المنسوب", "", "الرمز"],
      ["P-001", 671234.5, 2734567.8, 612.4, "", "BM"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Points");
    const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
    const result = parseImportedFile(
      { name: "survey.xlsx", base64 },
      { utmZone: 38, hemisphere: "N" },
    );
    expect(result.kind).toBe("excel");
    expect(result.features).toHaveLength(1);
    expect(result.features[0].pointNumber).toBe("P-001");
    expect(result.features[0].pointCode).toBe("BM");
    expect(result.features[0].elevation).toBe(612.4);
    expect(result.features[0].coords[0][0]).toBeGreaterThan(0);
    expect(result.features[0].coords[0][1]).toBeGreaterThan(0);
  });

  it("imports GeoJSON points and preserves their labels", () => {
    const result = parseImportedFile(
      {
        name: "points.geojson",
        text: JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { name: "نقطة اختبار", code: "T1", elevation: 99 },
              geometry: { type: "Point", coordinates: [46.6753, 24.7136] },
            },
          ],
        }),
      },
      { utmZone: 38, hemisphere: "N" },
    );
    expect(result.features[0].name).toBe("نقطة اختبار");
    expect(result.features[0].pointCode).toBe("T1");
    expect(result.features[0].elevation).toBe(99);
    expect(result.coords[0]).toEqual([24.7136, 46.6753]);
  });

  it("imports KML polygons and preserves style and description", () => {
    const result = parseImportedFile(
      {
        name: "area.kml",
        text: `<kml><Document><Placemark><name>منطقة اختبار</name><description>حدود المشروع</description><Style><PolyStyle><color>80112233</color></PolyStyle></Style><Polygon><outerBoundaryIs><LinearRing><coordinates>46.67,24.71 46.68,24.71 46.68,24.72 46.67,24.71</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`,
      },
      { utmZone: 38, hemisphere: "N" },
    );
    expect(result.features[0].type).toBe("polygon");
    expect(result.features[0].name).toBe("منطقة اختبار");
    expect(result.features[0].notes).toBe("حدود المشروع");
    expect(result.features[0].color).toBe("#332211");
    expect(result.features[0].fillOpacity).toBeGreaterThan(0.4);
  });
});
