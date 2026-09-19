import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { parseImportedFile } from "../lib/importData";
import { GeoFeature, LatLng } from "../types";

interface Props {
  visible: boolean;
  onClose: () => void;
  onImported: (features: GeoFeature[], coords: LatLng[], kind: string) => void;
}

export default function ImportDataModal({
  visible,
  onClose,
  onImported,
}: Props) {
  const { palette } = useTheme();
  const [zone, setZone] = useState("38");
  const [hemisphere, setHemisphere] = useState<"N" | "S">("N");
  const [loading, setLoading] = useState(false);

  const pickAndImport = async () => {
    const utmZone = Number(zone);
    if (!Number.isInteger(utmZone) || utmZone < 1 || utmZone > 60) {
      Alert.alert(
        "منطقة UTM غير صحيحة",
        "أدخل رقم منطقة بين 1 و60 لملفات Excel المساحية.",
      );
      return;
    }
    try {
      setLoading(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const isBinary = /\.(xlsx|xls)$/i.test(asset.name);
      const content = isBinary
        ? {
            base64:
              asset.base64 ??
              (await FileSystem.readAsStringAsync(asset.uri, {
                encoding: FileSystem.EncodingType.Base64,
              })),
          }
        : {
            text: await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.UTF8,
            }),
          };
      const parsed = parseImportedFile(
        { name: asset.name, ...content },
        { utmZone, hemisphere },
      );
      onImported(parsed.features, parsed.coords, parsed.kind);
      onClose();
    } catch (error: any) {
      Alert.alert(
        "تعذر الاستيراد",
        error?.message ?? "تحقق من نوع الملف وترتيب البيانات ثم حاول مرة أخرى.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
        <View style={[styles.card, { backgroundColor: palette.bgElevated }]}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons
                name="close-circle"
                size={26}
                color={palette.textMuted}
              />
            </Pressable>
            <Text style={[styles.title, { color: palette.text }]}>
              استيراد البيانات
            </Text>
          </View>
          <Text style={[styles.description, { color: palette.textMuted }]}>
            يدعم GeoJSON وKML وGPX وCSV، وملفات Excel لنقاط الرفع المساحي.
          </Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: palette.textMuted }]}>
                منطقة UTM
              </Text>
              <TextInput
                value={zone}
                onChangeText={setZone}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  {
                    color: palette.text,
                    borderColor: palette.border,
                    backgroundColor: palette.card,
                  },
                ]}
                textAlign="center"
              />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: palette.textMuted }]}>
                نصف الكرة
              </Text>
              <View style={styles.hemisphereRow}>
                {(["N", "S"] as const).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setHemisphere(value)}
                    style={[
                      styles.hemisphereButton,
                      {
                        backgroundColor:
                          hemisphere === value ? palette.primary : palette.card,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: hemisphere === value ? "#fff" : palette.text,
                        fontWeight: "700",
                      }}
                    >
                      {value === "N" ? "شمال N" : "جنوب S"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <View
            style={[
              styles.excelHint,
              {
                backgroundColor: palette.primary + "12",
                borderColor: palette.primary + "44",
              },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={palette.primary}
            />
            <Text style={[styles.hintText, { color: palette.text }]}>
              Excel: A رقم النقطة، B الشرقي، C الشمالي، D المنسوب، F رمز النقطة.
            </Text>
          </View>
          <Pressable
            onPress={pickAndImport}
            disabled={loading}
            style={[
              styles.importButton,
              { backgroundColor: palette.primary, opacity: loading ? 0.65 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="folder-open-outline" size={20} color="#fff" />
            )}
            <Text style={styles.importText}>
              {loading ? "جارٍ قراءة الملف..." : "اختيار ملف واستيراده"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: { width: "100%", maxWidth: 440, borderRadius: 20, padding: 18 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 19, fontWeight: "800" },
  description: {
    textAlign: "right",
    lineHeight: 20,
    fontSize: 12,
    marginTop: 10,
  },
  row: { flexDirection: "row-reverse", gap: 10, marginTop: 14 },
  field: { flex: 1 },
  label: {
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, fontSize: 15 },
  hemisphereRow: { flexDirection: "row", gap: 6 },
  hemisphereButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  excelHint: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 14,
  },
  hintText: { flex: 1, textAlign: "right", fontSize: 11, lineHeight: 18 },
  importButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 16,
  },
  importText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
