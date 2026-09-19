import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { describeRoofStyle, LocalModelConfig, modelHeightM, RoofStyle } from '../lib/buildingModel';

const ROOF_OPTIONS: Array<{ key: RoofStyle; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'flat', label: 'مسطح', icon: 'remove-outline' },
  { key: 'gable', label: 'جملون', icon: 'triangle-outline' },
  { key: 'hip', label: 'هرمي', icon: 'home-outline' },
];

export default function BuildingModelModal({
  visible,
  onClose,
  buildingCount,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  buildingCount: number;
  onCreate: (config: LocalModelConfig) => void;
}) {
  const { palette } = useTheme();
  const [floorHeight, setFloorHeight] = useState('3');
  const [stories, setStories] = useState('2');
  const [roofStyle, setRoofStyle] = useState<RoofStyle>('flat');

  useEffect(() => {
    if (visible) {
      setFloorHeight('3');
      setStories('2');
      setRoofStyle('flat');
    }
  }, [visible]);

  const previewHeight = useMemo(() => modelHeightM({ floorHeight: Number(floorHeight.replace(',', '.')), stories: Number(stories), roofStyle }), [floorHeight, stories, roofStyle]);

  const submit = () => {
    const config: LocalModelConfig = {
      floorHeight: Number(floorHeight.replace(',', '.')),
      stories: Number(stories),
      roofStyle,
    };
    if (!Number.isFinite(config.floorHeight) || config.floorHeight <= 0 || !Number.isFinite(config.stories) || config.stories <= 0) {
      Alert.alert('قيمة غير صحيحة', 'أدخل ارتفاع الطابق وعدد طوابق صالحين.');
      return;
    }
    if (!buildingCount) {
      Alert.alert('لا توجد مبانٍ', 'حدّد منطقة تحتوي على بصمات مبانٍ أو اجلب المباني من OpenStreetMap أولاً.');
      return;
    }
    onCreate(config);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
        <View style={[styles.card, { backgroundColor: palette.bgElevated }]}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close-circle-outline" size={25} color={palette.textMuted} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: palette.primary }]}>معالج محلي · بدون رفع بيانات</Text>
              <Text style={[styles.title, { color: palette.text }]}>تحويل البصمات إلى نموذج 3D</Text>
            </View>
            <View style={[styles.iconBox, { backgroundColor: palette.primary + '18' }]}>
              <Ionicons name="cube-outline" size={22} color={palette.primary} />
            </View>
          </View>

          <Text style={[styles.help, { color: palette.textMuted }]}>سيتم بثق كل بصمة مبنى إلى حجم هندسي قابل للتصدير محلياً. لا تُرفع الصور أو الإحداثيات إلى خدمة خارجية.</Text>

          <View style={[styles.countCard, { backgroundColor: palette.primary + '12', borderColor: palette.primary + '30' }]}>
            <Ionicons name="business-outline" size={20} color={palette.primary} />
            <Text style={{ color: palette.text, fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' }}>{buildingCount} مبنى في المنطقة المحددة</Text>
          </View>

          <View style={styles.fieldsRow}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: palette.textMuted }]}>عدد الطوابق</Text>
              <TextInput value={stories} onChangeText={setStories} keyboardType="number-pad" textAlign="right" style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card }]} placeholder="2" placeholderTextColor={palette.textMuted} />
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: palette.textMuted }]}>ارتفاع الطابق (م)</Text>
              <TextInput value={floorHeight} onChangeText={setFloorHeight} keyboardType="decimal-pad" textAlign="right" style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card }]} placeholder="3" placeholderTextColor={palette.textMuted} />
            </View>
          </View>

          <Text style={[styles.label, { color: palette.textMuted }]}>نوع السقف</Text>
          <View style={styles.roofRow}>
            {ROOF_OPTIONS.map((option) => {
              const selected = roofStyle === option.key;
              return (
                <Pressable key={option.key} onPress={() => setRoofStyle(option.key)} style={[styles.roofOption, { backgroundColor: selected ? palette.primary : palette.card, borderColor: selected ? palette.primary : palette.border }]}>
                  <Ionicons name={option.icon} size={18} color={selected ? '#fff' : palette.textMuted} />
                  <Text style={{ color: selected ? '#fff' : palette.text, fontSize: 12, fontWeight: '700' }}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.preview, { borderColor: palette.border, backgroundColor: palette.card }]}>
            <Text style={{ color: palette.textMuted, fontSize: 11 }}>الارتفاع النهائي التقريبي</Text>
            <Text style={{ color: palette.text, fontSize: 20, fontWeight: '800' }}>{Number.isFinite(previewHeight) ? previewHeight.toFixed(2) : '—'} م</Text>
            <Text style={{ color: palette.textMuted, fontSize: 11 }}>سقف {describeRoofStyle(roofStyle)} · معالجة بارامترية محلية</Text>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.button, { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1 }]}><Text style={{ color: palette.text, fontWeight: '700' }}>إلغاء</Text></Pressable>
            <Pressable onPress={submit} style={[styles.button, { backgroundColor: palette.primary }]}><Ionicons name="sparkles-outline" size={17} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800' }}>إنشاء محلي</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28 },
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 11 },
  headerCopy: { flex: 1, alignItems: 'flex-end' },
  eyebrow: { fontSize: 11, fontWeight: '800', marginBottom: 4 },
  title: { fontSize: 19, fontWeight: '900', textAlign: 'right' },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  help: { fontSize: 13, lineHeight: 21, textAlign: 'right', marginTop: 14 },
  countCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9, padding: 12, borderRadius: 14, borderWidth: 1, marginTop: 14 },
  fieldsRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 16 },
  field: { flex: 1 },
  label: { fontSize: 11, fontWeight: '700', textAlign: 'right', marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 },
  roofRow: { flexDirection: 'row-reverse', gap: 8 },
  roofOption: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  preview: { borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'flex-end', marginTop: 16 },
  actions: { flexDirection: 'row-reverse', gap: 10, marginTop: 18 },
  button: { flex: 1, minHeight: 48, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13 },
});
