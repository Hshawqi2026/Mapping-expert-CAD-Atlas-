import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { RasterLayer } from '../types';
import { uid } from '../lib/geo';

interface Props {
  visible: boolean;
  layers: RasterLayer[];
  onClose: () => void;
  onChange: (layers: RasterLayer[]) => void;
}

export default function RasterManagerModal({ visible, layers, onClose, onChange }: Props) {
  const { palette } = useTheme();
  const [busy, setBusy] = useState(false);
  const desktop = (globalThis as any).agonDesktop;

  const importRaster = async () => {
    if (!desktop?.openRasterFile) {
      Alert.alert('مدير الصور الجوية', 'استيراد الصور الجغرافية متاح في نسخة Windows desktop.');
      return;
    }
    try {
      setBusy(true);
      const sourcePath = await desktop.openRasterFile();
      if (!sourcePath) return;
      if (desktop.rasterHealth) await desktop.rasterHealth();
      const info = await desktop.inspectRaster({ path: sourcePath });
      let preview;
      try { preview = await desktop.previewRaster({ path: sourcePath, max_size: 1600 }); } catch (error: any) {
        Alert.alert('تحتاج الصورة إلى إسناد', error?.message ?? 'أضف GCP قبل عرض الصورة على الخريطة.');
      }
      const layer: RasterLayer = {
        id: uid(), name: info.name, sourcePath, previewUrl: preview?.data_url,
        bounds: preview?.bounds, width: info.width, height: info.height,
        crs: preview?.crs ?? info.crs ?? undefined, sourceCrs: info.crs ?? undefined,
        opacity: 0.75, visible: true, zIndex: layers.length + 1,
        georeferenced: Boolean(info.georeferenced && preview), importedAt: Date.now(),
      };
      onChange([...layers, layer]);
    } catch (error: any) {
      const message = error?.message ?? String(error ?? 'تعذر قراءة ملف الصورة أو CRS.');
      Alert.alert('فشل استيراد الصورة الجوية', `${message}\n\nتحقق من أن الملف GeoTIFF أو يحتوي على World File مثل .tfw/.jgw/.pgw، ثم أعد المحاولة.`);
    } finally { setBusy(false); }
  };

  const patch = (id: string, value: Partial<RasterLayer>) => onChange(layers.map((layer) => layer.id === id ? { ...layer, ...value } : layer));
  const remove = (id: string) => onChange(layers.filter((layer) => layer.id !== id));
  const move = (index: number, direction: -1 | 1) => {
    const next = [...layers]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((layer, order) => ({ ...layer, zIndex: order + 1 })));
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.header}><Pressable onPress={onClose}><Ionicons name="close" size={24} color={palette.textMuted} /></Pressable><View><Text style={[styles.title, { color: palette.text }]}>Raster & Aerial Imagery Manager</Text><Text style={[styles.subtitle, { color: palette.textMuted }]}>إدارة الصور الجوية والمرئيات محلياً</Text></View></View>
      <Pressable disabled={busy} onPress={importRaster} style={[styles.importButton, { backgroundColor: palette.primary, opacity: busy ? 0.6 : 1 }]}><Ionicons name="images-outline" size={20} color="#fff" /><Text style={styles.importText}>{busy ? 'جارٍ قراءة الصورة...' : 'Import Raster / Aerial Imagery'}</Text></Pressable>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
        {!layers.length && <Text style={[styles.empty, { color: palette.textMuted }]}>لا توجد صور مستوردة. يدعم المحرك GeoTIFF وTIFF وJPG وJPEG وPNG مع World File.</Text>}
        {layers.map((layer, index) => <View key={layer.id} style={[styles.layerCard, { borderColor: palette.border, backgroundColor: palette.bgElevated }]}>
          <View style={styles.row}><Pressable onPress={() => remove(layer.id)}><Ionicons name="trash-outline" size={19} color={palette.danger} /></Pressable><View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={[styles.layerName, { color: palette.text }]} numberOfLines={1}>{layer.name}</Text><Text style={[styles.meta, { color: palette.textMuted }]}>{layer.crs ?? 'CRS غير متوفر'} · {layer.width ?? 0}×{layer.height ?? 0}</Text></View><Ionicons name="image-outline" size={23} color={palette.primary} /></View>
          <View style={styles.row}><Pressable onPress={() => move(index, 1)}><Ionicons name="chevron-down" size={20} color={palette.textMuted} /></Pressable><Pressable onPress={() => move(index, -1)}><Ionicons name="chevron-up" size={20} color={palette.textMuted} /></Pressable><Pressable onPress={() => patch(layer.id, { visible: !layer.visible })} style={styles.opacityControl}><Ionicons name={layer.visible ? 'eye-outline' : 'eye-off-outline'} size={18} color={layer.visible ? palette.primary : palette.textMuted} /><Text style={{ color: palette.text, fontSize: 12 }}>{layer.visible ? 'مفعلة' : 'متوقفة'}</Text></Pressable><Text style={{ color: palette.textMuted, fontSize: 11 }}>Opacity {Math.round(layer.opacity * 100)}%</Text><Pressable onPress={() => patch(layer.id, { opacity: Math.max(0, layer.opacity - 0.1) })}><Ionicons name="remove-circle-outline" size={20} color={palette.primary} /></Pressable><Pressable onPress={() => patch(layer.id, { opacity: Math.min(1, layer.opacity + 0.1) })}><Ionicons name="add-circle-outline" size={20} color={palette.primary} /></Pressable></View>
          {!layer.georeferenced && <Text style={styles.warning}>تحتاج إلى Georeferencing قبل العرض الجغرافي</Text>}
        </View>)}
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 18, gap: 14 },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }, title: { fontSize: 17, fontWeight: '800', textAlign: 'right' }, subtitle: { fontSize: 11, textAlign: 'right', marginTop: 3 },
  importButton: { borderRadius: 14, padding: 14, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 8 }, importText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { textAlign: 'right', lineHeight: 20, paddingVertical: 18 }, layerCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 }, layerName: { fontSize: 13, fontWeight: '800' }, meta: { fontSize: 10, marginTop: 3 }, opacityControl: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginLeft: 'auto' }, warning: { color: '#B45309', fontSize: 11, textAlign: 'right' },
});
