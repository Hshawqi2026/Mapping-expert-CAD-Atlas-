import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { RasterGCP, RasterLayer } from '../types';
import { uid } from '../lib/geo';

export default function GCPManagerModal({ visible, layer, onClose, onComplete }: { visible: boolean; layer: RasterLayer | null; onClose: () => void; onComplete: (layer: RasterLayer) => void }) {
  const { palette } = useTheme();
  const [gcps, setGcps] = useState<RasterGCP[]>(layer?.gcps ?? []);
  const [values, setValues] = useState({ pixel: '', line: '', easting: '', northing: '' });
  const [crs, setCrs] = useState(layer?.crs || 'EPSG:32638');
  const desktop = (globalThis as any).agonDesktop;
  const add = () => {
    const numbers = Object.values(values).map(Number);
    if (numbers.some((v) => !Number.isFinite(v))) return Alert.alert('بيانات غير مكتملة', 'أدخل Pixel وLine وEasting وNorthing بقيم رقمية.');
    setGcps([...gcps, { id: uid(), pixel: numbers[0], line: numbers[1], easting: numbers[2], northing: numbers[3] }]);
    setValues({ pixel: '', line: '', easting: '', northing: '' });
  };
  const run = async () => {
    if (!layer || gcps.length < 3) return Alert.alert('نقاط غير كافية', 'يلزم 3 نقاط على الأقل للتحويل Affine.');
    if (!desktop?.georeferenceRaster) return Alert.alert('نسخة سطح المكتب مطلوبة', 'تشغيل Raster Engine متاح في نسخة Windows.');
    try {
      const output = layer.sourcePath.replace(/\.[^.]+$/, '') + '.georeferenced.tif';
      const result = await desktop.georeferenceRaster({ input: layer.sourcePath, output, crs, gcps, rms_warning: 2 });
      onComplete({ ...layer, sourcePath: result.output, crs: result.crs, georeferenced: true, rmsError: result.rms_error, gcps, name: `${layer.name} (Georeferenced)` });
      Alert.alert('اكتمل الإسناد', `RMS Error: ${Number(result.rms_error).toFixed(3)} متر`);
      onClose();
    } catch (error: any) { Alert.alert('فشل الإسناد', error?.message || 'تعذر إنشاء GeoTIFF.'); }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: palette.card, borderColor: palette.border }]}>
    <View style={styles.header}><Pressable onPress={onClose}><Ionicons name="close" size={24} color={palette.textMuted} /></Pressable><View><Text style={[styles.title, { color: palette.text }]}>GCP Manager</Text><Text style={[styles.sub, { color: palette.textMuted }]}>{layer?.name || 'اختر صورة جوية'}</Text></View></View>
    <Text style={[styles.help, { color: palette.textMuted }]}>أدخل نقاط التحكم من الصورة الجوية والخريطة. استخدم نقاطاً موزعة على أطراف الصورة للحصول على RMS أدق.</Text>
    <TextInput value={crs} onChangeText={setCrs} placeholder="CRS مثل EPSG:32638" placeholderTextColor={palette.textMuted} style={[styles.input, { color: palette.text, borderColor: palette.border }]} />
    <View style={styles.grid}>{(['pixel', 'line', 'easting', 'northing'] as const).map((key) => <TextInput key={key} value={values[key]} onChangeText={(v) => setValues({ ...values, [key]: v })} keyboardType="numeric" placeholder={key} placeholderTextColor={palette.textMuted} style={[styles.cell, { color: palette.text, borderColor: palette.border }]} />)}</View>
    <Pressable onPress={add} style={[styles.secondary, { borderColor: palette.primary }]}><Ionicons name="add" size={18} color={palette.primary} /><Text style={{ color: palette.primary, fontWeight: '800' }}>إضافة نقطة GCP</Text></Pressable>
    <ScrollView style={{ maxHeight: 150 }}>{gcps.map((g, i) => <View key={g.id} style={[styles.gcp, { borderColor: palette.border }]}><Text style={{ color: palette.text, flex: 1 }}>GCP {i + 1}: ({g.pixel}, {g.line}) → ({g.easting}, {g.northing})</Text><Pressable onPress={() => setGcps(gcps.filter((x) => x.id !== g.id))}><Ionicons name="trash-outline" size={17} color={palette.danger} /></Pressable></View>)}</ScrollView>
    <Pressable onPress={run} style={[styles.primary, { backgroundColor: palette.primary }]}><Ionicons name="locate-outline" size={19} color="#fff" /><Text style={styles.primaryText}>تنفيذ الإسناد وحساب RMS وإنشاء GeoTIFF</Text></Pressable>
  </View></View></Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'flex-end' }, sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 18, gap: 12 }, header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }, title: { fontSize: 18, fontWeight: '800', textAlign: 'right' }, sub: { fontSize: 11, textAlign: 'right' }, help: { textAlign: 'right', lineHeight: 19, fontSize: 12 }, input: { borderWidth: 1, borderRadius: 10, padding: 10, textAlign: 'right' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, cell: { width: '48%', borderWidth: 1, borderRadius: 9, padding: 9, textAlign: 'center' }, secondary: { borderWidth: 1, borderRadius: 10, padding: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 6 }, gcp: { borderWidth: 1, borderRadius: 9, padding: 9, marginBottom: 6, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }, primary: { borderRadius: 12, padding: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 7 }, primaryText: { color: '#fff', fontWeight: '800', fontSize: 12 }, });
