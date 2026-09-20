import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { useProjects } from "../context/ProjectsContext";
import { generate3DDXF, generateDXF } from "../lib/dxfWriter";
import {
  generateCSV,
  generateGPX,
  generateKML,
  generateSVG,
  generateShapefileZip,
} from "../lib/exportFormats";
import { generateOBJ } from "../lib/objWriter";
import EmptyState from "../components/EmptyState";
import { FeatureType } from "../types";
import DeveloperFooter from "../components/DeveloperFooter";

const TYPE_OPTIONS: {
  key: FeatureType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "point", label: "النقاط المساحية", icon: "location" },
  { key: "building", label: "المباني", icon: "business" },
  { key: "line", label: "الخطوط والطرق", icon: "trail-sign" },
  { key: "polygon", label: "المضلعات والحدود", icon: "shapes" },
];

function sanitizeFileName(name: string) {
  return (
    name.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "_").slice(0, 60) || "project"
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function buildSurveyReportHtml(project: { name: string }, items: any[]) {
  const rows = items.map((feature, index) => {
    const coordinate = feature.coords[0]
      ? `${feature.coords[0][0].toFixed(6)}, ${feature.coords[0][1].toFixed(6)}`
      : "-";
    return `<tr><td>${index + 1}</td><td>${escapeHtml(feature.name)}</td><td>${escapeHtml(feature.category)}</td><td>${escapeHtml(feature.type)}</td><td>${coordinate}</td><td>${escapeHtml(feature.source)}</td></tr>`;
  }).join("");
  const generatedAt = new Date().toLocaleString("ar-SA");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; } body { font-family: Arial, Tahoma, sans-serif; color: #14251f; direction: rtl; }
    h1 { color: #0E7C66; margin: 0 0 4px; } h2 { font-size: 15px; color: #0E7C66; border-bottom: 2px solid #D8E8E2; padding-bottom: 5px; }
    .meta { color: #5B6B62; font-size: 11px; margin-bottom: 18px; } .summary { display: flex; gap: 10px; margin: 12px 0 20px; }
    .box { border: 1px solid #D8E8E2; border-radius: 6px; padding: 9px; flex: 1; background: #F4F9F6; } .label { display: block; color: #5B6B62; font-size: 10px; } .value { font-size: 17px; font-weight: bold; color: #0E7C66; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; } th { background: #0E7C66; color: white; } th, td { border: 1px solid #C9D9D2; padding: 6px 5px; text-align: right; } tr:nth-child(even) { background: #F7FAF8; }
    footer { margin-top: 20px; color: #6B7C73; font-size: 9px; text-align: center; }
  </style></head><body>
    <h1>تقرير مساحي</h1><div class="meta">المشروع: ${escapeHtml(project.name)}<br>تاريخ الإنشاء: ${generatedAt}</div>
    <div class="summary"><div class="box"><span class="label">إجمالي العناصر</span><span class="value">${items.length}</span></div><div class="box"><span class="label">المباني</span><span class="value">${items.filter((f) => f.type === "building").length}</span></div><div class="box"><span class="label">النقاط</span><span class="value">${items.filter((f) => f.type === "point").length}</span></div></div>
    <h2>جدول العناصر والإحداثيات</h2><table><thead><tr><th>#</th><th>الاسم</th><th>التصنيف</th><th>النوع</th><th>الإحداثيات WGS84</th><th>المصدر</th></tr></thead><tbody>${rows}</tbody></table>
    <footer>Agon Surveyor — تقرير مُنشأ من داخل التطبيق</footer>
  </body></html>`;
}

export default function ExportScreen() {
  const { palette } = useTheme();
  const { activeProject } = useProjects();
  const features = activeProject?.features ?? [];

  const [includeTypes, setIncludeTypes] = useState<
    Record<FeatureType, boolean>
  >({
    point: true,
    building: true,
    line: true,
    polygon: true,
  });
  const [includeOSM, setIncludeOSM] = useState(true);
  const [includeManual, setIncludeManual] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    zoneNumber: number;
    hemisphere: string;
    count: number;
  } | null>(null);

  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      if (!includeTypes[f.type]) return false;
      if (f.source === "osm" && !includeOSM) return false;
      if (f.source === "manual" && !includeManual) return false;
      return true;
    });
  }, [features, includeTypes, includeOSM, includeManual]);

  const countsByType = useMemo(() => {
    const c: Record<string, number> = {};
    features.forEach((f) => (c[f.type] = (c[f.type] ?? 0) + 1));
    return c;
  }, [features]);

  const exportDXF = async () => {
    if (!activeProject) return;
    if (filteredFeatures.length === 0) {
      Alert.alert(
        "لا توجد عناصر",
        "اختر نوعاً واحداً على الأقل يحتوي على عناصر للتصدير.",
      );
      return;
    }
    try {
      setExporting(true);
      const result = generateDXF(activeProject, filteredFeatures);
      const fileName = `${sanitizeFileName(activeProject.name)}_${Date.now()}.dxf`;

      if (Platform.OS === "web") {
        const blob = new Blob([result.dxf], { type: "application/dxf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, result.dxf, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/dxf",
            dialogTitle: "مشاركة ملف DXF الهندسي",
            UTI: "com.autodesk.dxf",
          });
        } else {
          Alert.alert("تم الحفظ", `تم حفظ الملف في:\n${fileUri}`);
        }
      }

      setLastResult({
        zoneNumber: result.zoneNumber,
        hemisphere: result.hemisphere,
        count: result.featureCount,
      });
    } catch (e: any) {
      Alert.alert("فشل التصدير", e?.message ?? "حدث خطأ أثناء إنشاء ملف DXF.");
    } finally {
      setExporting(false);
    }
  };

  const export3DModel = async () => {
    if (!activeProject) return;
    const models = filteredFeatures.filter(
      (f) => f.type === "building" && f.model3d && (f.elevation ?? 0) > 0,
    );
    if (!models.length) {
      Alert.alert(
        "لا توجد نماذج محفوظة",
        "أنشئ نموذجاً ثلاثي الأبعاد للمباني أولاً من شاشة الخريطة.",
      );
      return;
    }
    try {
      setExporting(true);
      const result = generate3DDXF(activeProject, filteredFeatures);
      await downloadTextOrShare(
        result.dxf,
        `${sanitizeFileName(activeProject.name)}_${Date.now()}_3D.dxf`,
        "application/dxf",
      );
      setLastResult({
        zoneNumber: result.zoneNumber,
        hemisphere: result.hemisphere,
        count: models.length,
      });
    } catch (e: any) {
      Alert.alert(
        "فشل تصدير النموذج",
        e?.message ?? "تعذر إنشاء ملف DXF ثلاثي الأبعاد.",
      );
    } finally {
      setExporting(false);
    }
  };

  const exportOBJModel = async () => {
    if (!activeProject) return;
    const models = filteredFeatures.filter(
      (f) => f.type === "building" && f.model3d && (f.elevation ?? 0) > 0,
    );
    if (!models.length) {
      Alert.alert(
        "لا توجد نماذج محفوظة",
        "أنشئ نموذجاً محلياً للمباني أولاً من شاشة الخريطة.",
      );
      return;
    }
    try {
      setExporting(true);
      const result = generateOBJ(activeProject, filteredFeatures);
      await downloadTextOrShare(
        result.obj,
        `${sanitizeFileName(activeProject.name)}_${Date.now()}_3D.obj`,
        "text/plain",
      );
      setLastResult({
        zoneNumber: result.zoneNumber,
        hemisphere: result.hemisphere,
        count: result.modelCount,
      });
    } catch (e: any) {
      Alert.alert(
        "فشل تصدير OBJ",
        e?.message ?? "تعذر إنشاء ملف OBJ ثلاثي الأبعاد.",
      );
    } finally {
      setExporting(false);
    }
  };

  const exportGeoJSON = async () => {
    if (!activeProject) return;
    if (filteredFeatures.length === 0) {
      Alert.alert(
        "لا توجد عناصر",
        "اختر نوعاً واحداً على الأقل يحتوي على عناصر للتصدير.",
      );
      return;
    }
    const geojson = {
      type: "FeatureCollection",
      features: filteredFeatures.map((f) => ({
        type: "Feature",
        properties: {
          name: f.name,
          category: f.category,
          source: f.source,
          notes: f.notes ?? "",
        },
        geometry:
          f.type === "point"
            ? { type: "Point", coordinates: [f.coords[0][1], f.coords[0][0]] }
            : f.type === "line"
              ? {
                  type: "LineString",
                  coordinates: f.coords.map((c) => [c[1], c[0]]),
                }
              : {
                  type: "Polygon",
                  coordinates: [f.coords.map((c) => [c[1], c[0]])],
                },
      })),
    };
    const content = JSON.stringify(geojson, null, 2);
    const fileName = `${sanitizeFileName(activeProject.name)}_${Date.now()}.geojson`;

    try {
      if (Platform.OS === "web") {
        const blob = new Blob([content], { type: "application/geo+json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, content, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/geo+json",
            dialogTitle: "مشاركة GeoJSON",
          });
        }
      }
    } catch (e: any) {
      Alert.alert("فشل التصدير", e?.message ?? "حدث خطأ غير متوقع.");
    }
  };

  const downloadTextOrShare = async (
    content: string,
    fileName: string,
    mimeType: string,
  ) => {
    if (Platform.OS === "web") {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return;
    }
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (await Sharing.isAvailableAsync())
      await Sharing.shareAsync(fileUri, {
        mimeType,
        dialogTitle: `مشاركة ${fileName}`,
      });
    else Alert.alert("تم الحفظ", `تم حفظ الملف في:\n${fileUri}`);
  };

  const exportKML = async () => {
    if (!activeProject || !filteredFeatures.length) {
      Alert.alert(
        "لا توجد عناصر",
        "اختر نوعاً واحداً على الأقل يحتوي على عناصر للتصدير.",
      );
      return;
    }
    try {
      await downloadTextOrShare(
        generateKML(activeProject, filteredFeatures),
        `${sanitizeFileName(activeProject.name)}_${Date.now()}.kml`,
        "application/vnd.google-earth.kml+xml",
      );
    } catch (e: any) {
      Alert.alert("فشل التصدير", e?.message ?? "تعذر إنشاء ملف KML.");
    }
  };

  const exportCSV = async () => {
    if (!activeProject || !filteredFeatures.length) {
      Alert.alert(
        "لا توجد عناصر",
        "اختر نوعاً واحداً على الأقل يحتوي على عناصر للتصدير.",
      );
      return;
    }
    try {
      await downloadTextOrShare(
        generateCSV(activeProject, filteredFeatures),
        `${sanitizeFileName(activeProject.name)}_${Date.now()}.csv`,
        "text/csv",
      );
    } catch (e: any) {
      Alert.alert("فشل تصدير CSV", e?.message ?? "تعذر إنشاء ملف CSV.");
    }
  };

  const exportGPX = async () => {
    if (!activeProject || !filteredFeatures.length) {
      Alert.alert(
        "لا توجد عناصر",
        "اختر نوعاً واحداً على الأقل يحتوي على عناصر للتصدير.",
      );
      return;
    }
    try {
      await downloadTextOrShare(
        generateGPX(activeProject, filteredFeatures),
        `${sanitizeFileName(activeProject.name)}_${Date.now()}.gpx`,
        "application/gpx+xml",
      );
    } catch (e: any) {
      Alert.alert("فشل تصدير GPX", e?.message ?? "تعذر إنشاء ملف GPX.");
    }
  };

  const exportSVG = async () => {
    if (!activeProject || !filteredFeatures.length) {
      Alert.alert(
        "لا توجد عناصر",
        "اختر نوعاً واحداً على الأقل يحتوي على عناصر للتصدير.",
      );
      return;
    }
    try {
      await downloadTextOrShare(
        generateSVG(activeProject, filteredFeatures),
        `${sanitizeFileName(activeProject.name)}_${Date.now()}.svg`,
        "image/svg+xml",
      );
    } catch (e: any) {
      Alert.alert("فشل تصدير SVG", e?.message ?? "تعذر إنشاء مخطط SVG.");
    }
  };

  const exportPDF = async () => {
    if (!activeProject || !filteredFeatures.length) {
      Alert.alert("لا توجد عناصر", "أضف عناصر مساحية أو فعّل طبقة تحتوي على بيانات أولاً.");
      return;
    }
    try {
      setExporting(true);
      const html = buildSurveyReportHtml(activeProject, filteredFeatures);
      const fileName = `${sanitizeFileName(activeProject.name)}_${Date.now()}_survey-report.pdf`;
      const desktop = (globalThis as any).agonDesktop;
      if (desktop?.savePdf) {
        const result = await desktop.savePdf(html, fileName);
        if (!result?.canceled) Alert.alert("تم إنشاء التقرير", `تم حفظ التقرير في:\n${result.filePath}`);
      } else if (Platform.OS === "web") {
        const reportWindow = window.open("", "_blank", "width=1000,height=800");
        if (!reportWindow) throw new Error("يرجى السماح بالنوافذ المنبثقة لإنشاء PDF.");
        reportWindow.document.write(html);
        reportWindow.document.close();
        reportWindow.focus();
        setTimeout(() => reportWindow.print(), 400);
      } else {
        Alert.alert("تصدير PDF", "تصدير PDF المباشر متاح في نسخة Windows والويب.");
      }
    } catch (e: any) {
      Alert.alert("فشل تصدير PDF", e?.message ?? "تعذر إنشاء التقرير المساحي.");
    } finally {
      setExporting(false);
    }
  };

  const exportShapefile = async () => {
    if (!activeProject || !filteredFeatures.length) {
      Alert.alert(
        "لا توجد عناصر",
        "اختر نوعاً واحداً على الأقل يحتوي على عناصر للتصدير.",
      );
      return;
    }
    try {
      const base64 = await generateShapefileZip(
        activeProject,
        filteredFeatures,
      );
      const fileName = `${sanitizeFileName(activeProject.name)}_${Date.now()}_shapefile.zip`;
      if (Platform.OS === "web") {
        const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const blob = new Blob([binary], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/zip",
            dialogTitle: "مشاركة Shapefile ZIP",
          });
        else Alert.alert("تم الحفظ", `تم حفظ الملف في:\n${fileUri}`);
      }
    } catch (e: any) {
      Alert.alert("فشل التصدير", e?.message ?? "تعذر إنشاء Shapefile ZIP.");
    }
  };

  if (!activeProject) return null;

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: palette.bg }]}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: palette.text }]}>
            تصدير هندسي DXF
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: 12 }}>
            ملف DXF حقيقي (AutoCAD R12) بإحداثيات UTM مترية دقيقة - يفتح مباشرة
            في AutoCAD وCivil 3D وQGIS
          </Text>
        </View>

        {features.length === 0 ? (
          <EmptyState
            icon="document-outline"
            title="لا توجد بيانات للتصدير"
            subtitle="أضف عناصر من شاشة الخريطة أولاً"
          />
        ) : (
          <>
            <View
              style={[
                styles.card,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.cardTitle, { color: palette.text }]}>
                اختر طبقات التصدير
              </Text>
              {TYPE_OPTIONS.map((opt) => (
                <View key={opt.key} style={styles.rowBetween}>
                  <Switch
                    value={includeTypes[opt.key]}
                    onValueChange={(v) =>
                      setIncludeTypes((s) => ({ ...s, [opt.key]: v }))
                    }
                    trackColor={{ true: palette.primary }}
                  />
                  <View style={styles.rowLabel}>
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={palette.primary}
                    />
                    <Text
                      style={{
                        color: palette.text,
                        fontSize: 13,
                        fontWeight: "600",
                        marginRight: 8,
                      }}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={{
                        color: palette.textMuted,
                        fontSize: 11,
                        marginRight: 6,
                      }}
                    >
                      ({countsByType[opt.key] ?? 0})
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View
              style={[
                styles.card,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.cardTitle, { color: palette.text }]}>
                مصدر البيانات
              </Text>
              <View style={styles.rowBetween}>
                <Switch
                  value={includeManual}
                  onValueChange={setIncludeManual}
                  trackColor={{ true: palette.primary }}
                />
                <Text
                  style={{
                    color: palette.text,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  عناصر يدوية
                </Text>
              </View>
              <View style={styles.rowBetween}>
                <Switch
                  value={includeOSM}
                  onValueChange={setIncludeOSM}
                  trackColor={{ true: palette.primary }}
                />
                <Text
                  style={{
                    color: palette.text,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  عناصر من OpenStreetMap
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: palette.primary + "15",
                  borderColor: palette.primary + "40",
                },
              ]}
            >
              <Ionicons
                name="information-circle"
                size={20}
                color={palette.primary}
              />
              <Text
                style={{
                  color: palette.text,
                  fontSize: 12,
                  flex: 1,
                  textAlign: "right",
                  marginRight: 8,
                  lineHeight: 18,
                }}
              >
                سيتم تصدير {filteredFeatures.length} عنصر بنظام إحداثيات UTM
                (WGS84) المتري، مع طبقات منفصلة لكل نوع وألوان مطابقة لمعايير
                الرسم الهندسي (CAD).
              </Text>
            </View>

            <Pressable
              onPress={exportDXF}
              disabled={exporting}
              style={[
                styles.exportBtn,
                {
                  backgroundColor: palette.primary,
                  opacity: exporting ? 0.7 : 1,
                },
              ]}
            >
              {exporting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="download" size={20} color="#fff" />
              )}
              <Text style={styles.exportBtnText}>
                {exporting ? "جارٍ إنشاء الملف..." : "تصدير ملف DXF"}
              </Text>
            </Pressable>

            <Pressable
              onPress={exportPDF}
              disabled={exporting}
              style={[styles.exportBtn, { backgroundColor: "#B45309", opacity: exporting ? 0.7 : 1 }]}
            >
              <Ionicons name="document-text-outline" size={20} color="#fff" />
              <Text style={styles.exportBtnText}>تصدير تقرير مساحي PDF</Text>
            </Pressable>

            <Pressable
              onPress={export3DModel}
              disabled={exporting}
              style={[
                styles.exportBtn,
                { backgroundColor: "#9333EA", opacity: exporting ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="cube-outline" size={20} color="#fff" />
              <Text style={styles.exportBtnText}>
                تصدير النموذج ثلاثي الأبعاد DXF (
                {filteredFeatures.filter((f) => f.model3d).length})
              </Text>
            </Pressable>

            <Pressable
              onPress={exportOBJModel}
              disabled={exporting}
              style={[styles.exportBtnOutline, { borderColor: "#9333EA" }]}
            >
              <Ionicons name="cube-outline" size={18} color="#9333EA" />
              <Text
                style={{ color: "#9333EA", fontWeight: "800", marginRight: 8 }}
              >
                تصدير OBJ قابل للعرض في Blender (
                {filteredFeatures.filter((f) => f.model3d).length})
              </Text>
            </Pressable>

            <Pressable
              onPress={exportGeoJSON}
              style={[styles.exportBtnOutline, { borderColor: palette.border }]}
            >
              <Ionicons
                name="code-download-outline"
                size={18}
                color={palette.text}
              />
              <Text
                style={{
                  color: palette.text,
                  fontWeight: "700",
                  marginRight: 8,
                }}
              >
                تصدير كـ GeoJSON (إضافي)
              </Text>
            </Pressable>

            <Pressable
              onPress={exportKML}
              style={[styles.exportBtnOutline, { borderColor: palette.border }]}
            >
              <Ionicons name="globe-outline" size={18} color={palette.text} />
              <Text
                style={{
                  color: palette.text,
                  fontWeight: "700",
                  marginRight: 8,
                }}
              >
                تصدير كـ KML
              </Text>
            </Pressable>

            <Pressable
              onPress={exportShapefile}
              style={[
                styles.exportBtnOutline,
                { borderColor: palette.primary },
              ]}
            >
              <Ionicons
                name="archive-outline"
                size={18}
                color={palette.primary}
              />
              <Text
                style={{
                  color: palette.primary,
                  fontWeight: "800",
                  marginRight: 8,
                }}
              >
                تصدير Shapefile ZIP
              </Text>
            </Pressable>

            <View style={[styles.formatGrid, { borderColor: palette.border }]}>
              <Text style={[styles.formatGridTitle, { color: palette.text }]}>
                صيغ إضافية للاستخدام الميداني
              </Text>
              <View style={styles.formatGridRow}>
                <Pressable
                  onPress={exportCSV}
                  style={[
                    styles.formatTile,
                    {
                      backgroundColor: palette.bgElevated,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="grid-outline"
                    size={21}
                    color={palette.primary}
                  />
                  <Text
                    style={[styles.formatTileTitle, { color: palette.text }]}
                  >
                    CSV
                  </Text>
                  <Text
                    style={[
                      styles.formatTileHint,
                      { color: palette.textMuted },
                    ]}
                  >
                    جدول النقاط
                  </Text>
                </Pressable>
                <Pressable
                  onPress={exportGPX}
                  style={[
                    styles.formatTile,
                    {
                      backgroundColor: palette.bgElevated,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="navigate-outline"
                    size={21}
                    color={palette.primary}
                  />
                  <Text
                    style={[styles.formatTileTitle, { color: palette.text }]}
                  >
                    GPX
                  </Text>
                  <Text
                    style={[
                      styles.formatTileHint,
                      { color: palette.textMuted },
                    ]}
                  >
                    أجهزة GPS
                  </Text>
                </Pressable>
                <Pressable
                  onPress={exportSVG}
                  style={[
                    styles.formatTile,
                    {
                      backgroundColor: palette.bgElevated,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="color-palette-outline"
                    size={21}
                    color={palette.primary}
                  />
                  <Text
                    style={[styles.formatTileTitle, { color: palette.text }]}
                  >
                    SVG
                  </Text>
                  <Text
                    style={[
                      styles.formatTileHint,
                      { color: palette.textMuted },
                    ]}
                  >
                    مخطط متجهي
                  </Text>
                </Pressable>
              </View>
            </View>

            {lastResult && (
              <View
                style={[
                  styles.resultCard,
                  {
                    backgroundColor: palette.card,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={palette.success}
                />
                <Text
                  style={{
                    color: palette.text,
                    fontSize: 12,
                    textAlign: "right",
                    flex: 1,
                    marginRight: 8,
                  }}
                >
                  تم التصدير بنجاح · نطاق UTM {lastResult.zoneNumber}
                  {lastResult.hemisphere} · {lastResult.count} عنصر
                </Text>
              </View>
            )}

            <View style={[styles.specsCard, { borderColor: palette.border }]}>
              <Text style={[styles.specsTitle, { color: palette.textMuted }]}>
                مواصفات الملف الفنية
              </Text>
              {[
                "الصيغة: AutoCAD DXF (AC1009 / R12) - أوسع توافق مع برامج CAD",
                "نظام الإحداثيات: UTM WGS84 (بالأمتار) يُحسب تلقائياً حسب الموقع",
                "الطبقات: SURVEY_POINTS · BUILDINGS · BUILDINGS_OSM · ROADS · BOUNDARY · LABELS",
                "كل عنصر: نقطة/دائرة + نص باسم العنصر + متعدد خطوط مغلق للمضلعات",
              ].map((line, i) => (
                <View key={i} style={styles.specRow}>
                  <Ionicons
                    name="ellipse"
                    size={5}
                    color={palette.textMuted}
                    style={{ marginTop: 6 }}
                  />
                  <Text
                    style={{
                      color: palette.textMuted,
                      fontSize: 11,
                      flex: 1,
                      textAlign: "right",
                      marginRight: 6,
                      lineHeight: 17,
                    }}
                  >
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <DeveloperFooter />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    alignItems: "flex-end",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  card: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  rowLabel: {
    flexDirection: "row-reverse",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  summaryCard: {
    flexDirection: "row-reverse",
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  exportBtn: {
    flexDirection: "row-reverse",
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  exportBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  exportBtnOutline: {
    flexDirection: "row-reverse",
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 16,
  },
  resultCard: {
    flexDirection: "row-reverse",
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: "center",
  },
  specsCard: {
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  specsTitle: {
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
    marginBottom: 8,
  },
  specRow: { flexDirection: "row-reverse", marginBottom: 6 },
  formatGrid: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  formatGridTitle: {
    textAlign: "right",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
  },
  formatGridRow: { flexDirection: "row", gap: 8 },
  formatTile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  formatTileTitle: { fontSize: 13, fontWeight: "800" },
  formatTileHint: { fontSize: 10 },
});
