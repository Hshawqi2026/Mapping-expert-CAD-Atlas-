import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, TextInput, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { useProjects } from '../context/ProjectsContext';
import { GeoFeature, FeatureType } from '../types';
import { formatArea, formatDistance, pathLength, polygonAreaSqMeters } from '../lib/geo';
import EmptyState from '../components/EmptyState';
import { focusOnMap } from '../lib/mapBus';
import DeveloperFooter from '../components/DeveloperFooter';
import ImportDataModal from '../components/ImportDataModal';

const TYPE_META: Record<FeatureType, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  point: { icon: 'location', label: 'نقاط' },
  building: { icon: 'business', label: 'مبانٍ' },
  line: { icon: 'trail-sign', label: 'خطوط' },
  polygon: { icon: 'shapes', label: 'مضلعات' },
};

type FilterType = 'all' | FeatureType | 'osm' | 'manual' | 'imported' | 'model3d';

export default function FeaturesScreen() {
  const { palette } = useTheme();
  const { activeProject, removeFeature, updateFeature, updateFeatures, clearOSMFeatures, addFeatures } = useProjects();
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>('all');
  const [selected, setSelected] = useState<GeoFeature | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [importVisible, setImportVisible] = useState(false);

  const features = activeProject?.features ?? [];

  const filtered = useMemo(() => {
    if (filter === 'all') return features;
    if (filter === 'osm') return features.filter((f) => f.source === 'osm');
    if (filter === 'manual') return features.filter((f) => f.source === 'manual');
    if (filter === 'imported') return features.filter((f) => f.source === 'imported');
    if (filter === 'model3d') return features.filter((f) => f.model3d);
    return features.filter((f) => f.type === filter);
  }, [features, filter]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    features.forEach((f) => (byType[f.type] = (byType[f.type] ?? 0) + 1));
    return byType;
  }, [features]);

  const layers = useMemo(() => {
    const map = new Map<string, GeoFeature[]>();
    features.forEach((f) => { const id = f.layerId ?? `${f.source}-${f.type}`; map.set(id, [...(map.get(id) ?? []), f]); });
    return [...map.entries()].map(([id, items]) => ({ id, items, visible: items.some((f) => f.visible !== false) }));
  }, [features]);

  const openDetail = (f: GeoFeature) => {
    setSelected(f);
    setEditName(f.name);
    setEditNotes(f.notes ?? '');
  };

  const saveEdits = () => {
    if (!selected) return;
    updateFeature(selected.id, { name: editName.trim() || selected.name, notes: editNotes.trim() || undefined });
    setSelected(null);
  };

  const confirmDelete = (f: GeoFeature) => {
    Alert.alert('حذف العنصر', `هل تريد حذف "${f.name}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => {
          removeFeature(f.id);
          setSelected(null);
        },
      },
    ]);
  };

  const viewOnMap = (f: GeoFeature) => {
    router.replace('/');
    focusOnMap(f.coords);
  };

  const handleImported = (imported: GeoFeature[], coords: [number, number][], kind: string) => {
    addFeatures(imported.map((f) => ({ ...f, layerId: f.layerId ?? `${kind}-${f.type}`, visible: true })));
    if (coords.length) focusOnMap(coords);
    Alert.alert('تم الاستيراد', `تم استيراد ${imported.length} عنصر من ${kind.toUpperCase()} وعرضه على الخريطة.`);
  };

  const measurement = (f: GeoFeature | null) => {
    if (!f) return null;
    if (f.type === 'line') return formatDistance(pathLength(f.coords));
    if (f.type === 'polygon' || f.type === 'building') return formatArea(polygonAreaSqMeters(f.coords));
    return null;
  };

  const renderItem = ({ item }: { item: GeoFeature }) => {
    const meta = TYPE_META[item.type];
    const m = measurement(item);
    return (
      <Pressable
        onPress={() => openDetail(item)}
        style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}
      >
        <View style={[styles.iconBox, { backgroundColor: item.color + '22' }]}>
          <Ionicons name={meta.icon} size={20} color={item.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: 2, textAlign: 'right' }}>
            {item.category} {item.pointCode ? `· الرمز: ${item.pointCode}` : ''} {item.elevation !== undefined ? `· الارتفاع: ${item.elevation}م` : ''} {item.buildingFloors ? `· ${item.buildingFloors} طوابق` : ''} {m ? `· ${m}` : ''}
          </Text>
        </View>
        {item.source === 'osm' && (
          <View style={[styles.osmTag, { backgroundColor: palette.primary + '20' }]}>
            <Text style={{ color: palette.primary, fontSize: 10, fontWeight: '700' }}>OSM</Text>
          </View>
        )}
        {item.source === 'imported' && (
          <View style={[styles.osmTag, { backgroundColor: palette.accent + '20' }]}>
            <Text style={{ color: palette.accent, fontSize: 10, fontWeight: '700' }}>مستورد</Text>
          </View>
        )}
        {item.model3d && (
          <View style={[styles.osmTag, { backgroundColor: palette.primary + '20' }]}>
            <Text style={{ color: palette.primary, fontSize: 10, fontWeight: '800' }}>3D محلي</Text>
          </View>
        )}
        <Ionicons name="chevron-back" size={16} color={palette.textMuted} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: palette.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => setImportVisible(true)} style={[styles.importHeaderButton, { backgroundColor: palette.primary }]}>
          <Ionicons name="download-outline" size={17} color="#fff" />
          <Text style={styles.importHeaderText}>استيراد</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: palette.text }]}>عناصر المشروع</Text>
        <Text style={{ color: palette.textMuted, fontSize: 12 }}>
          {activeProject?.name} · {features.length} عنصر إجمالي
        </Text>
      </View>

      <View style={styles.statsRow}>
        {(['point', 'building', 'line', 'polygon'] as FeatureType[]).map((t) => (
          <View key={t} style={[styles.statChip, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Ionicons name={TYPE_META[t].icon} size={14} color={palette.primary} />
            <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700', marginRight: 4 }}>{stats[t] ?? 0}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8 }}>
        {(
          [
            { key: 'all', label: 'الكل' },
            { key: 'point', label: 'نقاط' },
            { key: 'building', label: 'مبانٍ' },
            { key: 'line', label: 'خطوط' },
            { key: 'polygon', label: 'مضلعات' },
            { key: 'osm', label: 'من OSM' },
            { key: 'manual', label: 'يدوي' },
            { key: 'imported', label: 'مستورد' },
            { key: 'model3d', label: 'نماذج 3D' },
          ] as { key: FilterType; label: string }[]
        ).map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setFilter(opt.key)}
            style={[
              styles.filterChip,
              { backgroundColor: filter === opt.key ? palette.primary : palette.card, borderColor: palette.border },
            ]}
          >
            <Text style={{ color: filter === opt.key ? '#fff' : palette.text, fontSize: 12, fontWeight: '700' }}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
        {features.some((f) => f.source === 'osm') && (
          <Pressable
            onPress={() =>
              Alert.alert('مسح عناصر OSM', 'سيتم حذف كل العناصر المستوردة من OpenStreetMap فقط.', [
                { text: 'إلغاء', style: 'cancel' },
                { text: 'مسح', style: 'destructive', onPress: clearOSMFeatures },
              ])
            }
            style={[styles.filterChip, { backgroundColor: palette.danger + '15', borderColor: palette.danger }]}
          >
            <Text style={{ color: palette.danger, fontSize: 12, fontWeight: '700' }}>مسح OSM</Text>
          </Pressable>
        )}
      </ScrollView>

      {layers.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.layerRow} contentContainerStyle={{ gap: 8 }}>
        {layers.map((layer) => <Pressable key={layer.id} onPress={() => updateFeatures(layer.items.map((f) => f.id), { visible: !layer.visible })} style={[styles.layerChip, { borderColor: layer.visible ? palette.primary : palette.border, backgroundColor: layer.visible ? palette.primary + '18' : palette.card }]}>
          <Ionicons name={layer.visible ? 'eye-outline' : 'eye-off-outline'} size={15} color={layer.visible ? palette.primary : palette.textMuted} />
          <Text style={{ color: layer.visible ? palette.primary : palette.textMuted, fontSize: 11, fontWeight: '700' }}>{layer.id} ({layer.items.length})</Text>
        </Pressable>)}
      </ScrollView>}

      {filtered.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="لا توجد عناصر بعد"
          subtitle="أضف نقاطاً أو مبانٍ من شاشة الخريطة، أو اجلب المباني تلقائياً من OpenStreetMap"
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(f) => f.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <DeveloperFooter />

      <ImportDataModal visible={importVisible} onClose={() => setImportVisible(false)} onImported={handleImported} />

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
          <View style={[styles.detailCard, { backgroundColor: palette.bgElevated }]}>
            {selected && (
              <>
                <View style={styles.detailHeader}>
                  <Pressable onPress={() => setSelected(null)} hitSlop={10}>
                    <Ionicons name="close-circle" size={26} color={palette.textMuted} />
                  </Pressable>
                  <Text style={[styles.detailTitle, { color: palette.text }]}>تفاصيل العنصر</Text>
                </View>

                <Text style={[styles.label, { color: palette.textMuted }]}>الاسم</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card }]}
                  textAlign="right"
                />

                <View style={styles.infoRow}>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>{selected.category}</Text>
                  <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700' }}>التصنيف</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>{selected.coords.length}</Text>
                  <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700' }}>عدد النقاط</Text>
                </View>
                {measurement(selected) && (
                  <View style={styles.infoRow}>
                    <Text style={{ color: palette.textMuted, fontSize: 12 }}>{measurement(selected)}</Text>
                    <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700' }}>
                      {selected.type === 'line' ? 'الطول' : 'المساحة'}
                    </Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>{selected.coords[0][0].toFixed(6)}, {selected.coords[0][1].toFixed(6)}</Text>
                  <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700' }}>الإحداثيات</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={{ color: palette.textMuted, fontSize: 12 }}>
                    {selected.source === 'osm' ? 'OpenStreetMap' : 'إدخال يدوي'}
                  </Text>
                  <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700' }}>المصدر</Text>
                </View>

                <Text style={[styles.label, { color: palette.textMuted }]}>ملاحظات</Text>
                <TextInput
                  value={editNotes}
                  onChangeText={setEditNotes}
                  multiline
                  style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card, height: 70 }]}
                  textAlign="right"
                />

                <View style={styles.detailActions}>
                  <Pressable onPress={() => confirmDelete(selected)} style={[styles.detailBtn, { backgroundColor: palette.danger + '15' }]}>
                    <Ionicons name="trash-outline" size={18} color={palette.danger} />
                  </Pressable>
                  <Pressable onPress={() => viewOnMap(selected)} style={[styles.detailBtn, { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }]}>
                    <Ionicons name="map-outline" size={18} color={palette.text} />
                  </Pressable>
                  <Pressable onPress={saveEdits} style={[styles.detailBtnWide, { backgroundColor: palette.primary }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>حفظ التعديلات</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, alignItems: 'flex-end' },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  importHeaderButton: { position: 'absolute', left: 20, top: 8, zIndex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  importHeaderText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  statsRow: { flexDirection: 'row-reverse', paddingHorizontal: 20, gap: 8, marginTop: 12 },
  statChip: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  filterRow: { marginTop: 14, paddingHorizontal: 20, flexDirection: 'row-reverse', flexGrow: 0 },
  layerRow: { marginTop: 8, paddingHorizontal: 20, flexGrow: 0 },
  layerChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 10,
  },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  osmTag: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  detailCard: { width: '100%', maxWidth: 420, borderRadius: 20, padding: 18 },
  detailHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  detailTitle: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 6, textAlign: 'right' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  infoRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 8 },
  detailActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 16 },
  detailBtn: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  detailBtnWide: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
