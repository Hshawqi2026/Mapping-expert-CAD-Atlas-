import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { useProjects } from "../context/ProjectsContext";
import ProjectSwitcherModal from "../components/ProjectSwitcherModal";
import DeveloperFooter from "../components/DeveloperFooter";
import { AppSettings } from "../lib/storage";

const THEME_OPTIONS: {
  key: AppSettings["themeMode"];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "system", label: "تلقائي (النظام)", icon: "phone-portrait-outline" },
  { key: "light", label: "فاتح", icon: "sunny-outline" },
  { key: "dark", label: "داكن", icon: "moon-outline" },
];

export default function SettingsScreen() {
  const { palette, mode, setMode } = useTheme();
  const { activeProject, projects } = useProjects();
  const [projectModalVisible, setProjectModalVisible] = useState(false);

  const totalFeatures = projects.reduce((s, p) => s + p.features.length, 0);

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
            الإعدادات
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <Pressable
            style={styles.rowBetween}
            onPress={() => setProjectModalVisible(true)}
          >
            <Ionicons name="chevron-back" size={16} color={palette.textMuted} />
            <View style={{ flex: 1, alignItems: "flex-end", marginRight: 10 }}>
              <Text
                style={{ color: palette.text, fontSize: 14, fontWeight: "700" }}
              >
                إدارة المشاريع
              </Text>
              <Text
                style={{ color: palette.textMuted, fontSize: 12, marginTop: 2 }}
              >
                {projects.length} مشروع · {totalFeatures} عنصر إجمالي
              </Text>
            </View>
            <Ionicons
              name="folder-open-outline"
              size={20}
              color={palette.primary}
            />
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
          المظهر
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setMode(opt.key)}
              style={[styles.rowBetween, { paddingVertical: 12 }]}
            >
              {mode === opt.key ? (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={palette.primary}
                />
              ) : (
                <Ionicons
                  name="ellipse-outline"
                  size={20}
                  color={palette.textMuted}
                />
              )}
              <View
                style={{
                  flex: 1,
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  marginRight: 10,
                  gap: 8,
                }}
              >
                <Ionicons name={opt.icon} size={18} color={palette.text} />
                <Text
                  style={{
                    color: palette.text,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {opt.label}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
          مصادر الخرائط والبيانات
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <InfoRow
            icon="layers-outline"
            title="طبقات خرائط مجانية"
            subtitle="14 طبقة أساسية (شوارع، أقمار صناعية، طبوغرافي، فاتح/داكن) من OpenStreetMap وEsri وCARTO دون أي مفتاح API"
            color={palette.text}
            mutedColor={palette.textMuted}
          />
          <InfoRow
            icon="business-outline"
            title="تعرف دقيق على المعالم"
            subtitle="جلب حي و دقيق لأشكال المباني الحقيقية ونقاط الاهتمام مباشرة من قاعدة بيانات OpenStreetMap عبر Overpass API"
            color={palette.text}
            mutedColor={palette.textMuted}
          />
          <InfoRow
            icon="document-text-outline"
            title="تصدير هندسي متعدد الصيغ"
            subtitle="DXF وGeoJSON وKML وShapefile، إضافة إلى CSV للنقاط وGPX لأجهزة GPS وSVG للمخططات المتجهية"
            color={palette.text}
            mutedColor={palette.textMuted}
          />
          <InfoRow
            icon="cube-outline"
            title="معالج مبانٍ محلي ثلاثي الأبعاد"
            subtitle="حوّل بصمات المباني إلى مجسمات بارامترية على الجهاز من خلال عدد الطوابق وارتفاعها ونوع السقف، ثم صدّرها بصيغة DXF أو OBJ دون رفع البيانات"
            color={palette.text}
            mutedColor={palette.textMuted}
            last
          />
        </View>

        <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
          حول التطبيق
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <View style={styles.aboutRow}>
            <View
              style={[styles.appIcon, { backgroundColor: palette.primary }]}
            >
              <Ionicons name="map" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end", marginRight: 12 }}>
              <Text
                style={{ color: palette.text, fontWeight: "800", fontSize: 15 }}
              >
                Agon Surveyor
              </Text>
              <Text
                style={{ color: palette.textMuted, fontSize: 12, marginTop: 2 }}
              >
                الإصدار 2.1.0 · مساحة ميدانية ونمذجة محلية
              </Text>
            </View>
          </View>
          <Pressable
            style={styles.linkRow}
            onPress={() =>
              Linking.openURL("https://www.openstreetmap.org/copyright")
            }
          >
            <Ionicons name="open-outline" size={16} color={palette.primary} />
            <Text
              style={{ color: palette.primary, fontSize: 12, marginRight: 6 }}
            >
              حقوق بيانات OpenStreetMap
            </Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <Text
            style={{
              color: palette.textMuted,
              fontSize: 11,
              textAlign: "center",
              lineHeight: 18,
            }}
          >
            جميع الطبقات والبيانات المستخدمة مجانية ومفتوحة المصدر. تأكد من
            الاتصال بالإنترنت عند تحميل الخرائط وجلب المعالم.
          </Text>
        </View>
      </ScrollView>

      <DeveloperFooter />

      <ProjectSwitcherModal
        visible={projectModalVisible}
        onClose={() => setProjectModalVisible(false)}
      />
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  title,
  subtitle,
  color,
  mutedColor,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
  mutedColor: string;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.infoRow,
        !last && styles.infoRowBorder,
        { borderColor: mutedColor + "22" },
      ]}
    >
      <Ionicons name={icon} size={20} color={color} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text
          style={{ color, fontSize: 13, fontWeight: "700", textAlign: "right" }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: mutedColor,
            fontSize: 11,
            textAlign: "right",
            marginTop: 3,
            lineHeight: 16,
          }}
        >
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: "flex-end",
  },
  headerTitle: { fontSize: 22, fontWeight: "800" },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 8,
    textAlign: "right",
  },
  card: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  rowBetween: { flexDirection: "row-reverse", alignItems: "center" },
  infoRow: { flexDirection: "row-reverse", paddingVertical: 12 },
  infoRowBorder: { borderBottomWidth: 1 },
  aboutRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingBottom: 12,
  },
  appIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  linkRow: { flexDirection: "row-reverse", alignItems: "center", marginTop: 4 },
});
