import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { FeatureType, GeoFeature } from '../types';

interface Props {
  visible: boolean;
  type: FeatureType | null;
  pointCount: number;
  feature?: GeoFeature | null;
  onCancel: () => void;
  onDelete?: () => void;
  onSave: (name: string, category: string, color: string, notes: string) => void;
}

const CATEGORIES: Record<FeatureType, { label: string; options: string[] }> = {
  point: { label: 'نقطة مساحية', options: ['نقطة مساحية', 'نقطة ارتفاع', 'ركيزة', 'بئر', 'عمود كهرباء', 'أخرى'] },
  building: { label: 'مبنى', options: ['مبنى سكني', 'مبنى تجاري', 'منشأة صناعية', 'ملحق', 'أخرى'] },
  line: { label: 'خط', options: ['طريق', 'خط حدودي', 'مسار مياه', 'خط كهرباء', 'أخرى'] },
  polygon: { label: 'مضلع', options: ['حد أرض', 'قطعة أرض', 'منطقة خضراء', 'موقف سيارات', 'أخرى'] },
};

const COLORS = ['#0E7C66', '#DC2626', '#2563EB', '#D97706', '#7C3AED', '#DB2777', '#059669', '#4B5563'];

export default function FeatureFormModal({ visible, type, pointCount, feature, onCancel, onDelete, onSave }: Props) {
  const { palette } = useTheme();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState(COLORS[0]);

  useEffect(() => {
    if (visible && type) {
      const def = CATEGORIES[type];
      setCategory(feature?.category ?? def.options[0]);
      setName(feature?.name ?? `${def.label} ${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`);
      setNotes(feature?.notes ?? '');
      setColor(feature?.color ?? COLORS[0]);
    }
  }, [visible, type, feature]);

  if (!type) return null;
  const def = CATEGORIES[type];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { backgroundColor: palette.overlay }]}
      >
        <View style={[styles.card, { backgroundColor: palette.bgElevated }]}>
          <View style={styles.headerRow}>
            <Ionicons
              name={type === 'point' ? 'location' : type === 'line' ? 'trail-sign' : 'shapes'}
              size={22}
              color={palette.primary}
            />
            <Text style={[styles.title, { color: palette.text }]}>{feature ? 'تعديل العنصر' : 'حفظ عنصر جديد'}</Text>
          </View>
          <Text style={{ color: palette.textMuted, fontSize: 12, textAlign: 'right', marginBottom: 12 }}>
            {type === 'point' ? 'موقع نقطة واحدة' : `${pointCount} نقطة تشكل ${type === 'line' ? 'خطاً' : 'مضلعاً'}`}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.label, { color: palette.textMuted }]}>الاسم</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card }]}
              placeholder="اسم العنصر"
              placeholderTextColor={palette.textMuted}
              textAlign="right"
              returnKeyType="done"
            />

            <Text style={[styles.label, { color: palette.textMuted }]}>التصنيف</Text>
            <View style={styles.chipsRow}>
              {def.options.map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => setCategory(opt)}
                  style={[
                    styles.chip,
                    { borderColor: palette.border, backgroundColor: category === opt ? palette.primary : palette.card },
                  ]}
                >
                  <Text style={{ color: category === opt ? '#fff' : palette.text, fontSize: 12, fontWeight: '600' }}>{opt}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: palette.textMuted }]}>اللون</Text>
            <View style={styles.chipsRow}>
              {COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c, borderColor: color === c ? palette.text : 'transparent' },
                  ]}
                />
              ))}
            </View>

            <Text style={[styles.label, { color: palette.textMuted }]}>ملاحظات (اختياري)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.card, height: 70 }]}
              placeholder="أضف ملاحظات ميدانية..."
              placeholderTextColor={palette.textMuted}
              textAlign="right"
              multiline
            />
          </ScrollView>

          <View style={styles.actions}>
            {feature && onDelete && (
              <Pressable onPress={onDelete} style={[styles.deleteBtn, { backgroundColor: palette.danger + '15' }]}>
                <Ionicons name="trash-outline" size={19} color={palette.danger} />
              </Pressable>
            )}
            <Pressable onPress={onCancel} style={[styles.btn, { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1 }] }>
              <Text style={{ color: palette.textMuted, fontWeight: '700' }}>إغلاق</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(name.trim() || def.label, category, color, notes.trim())}
              style={[styles.btn, { backgroundColor: palette.primary }]}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{feature ? 'حفظ التعديل' : 'حفظ العنصر'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, borderRadius: 20, padding: 18, maxHeight: '85%' },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6, textAlign: 'right' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  chipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, borderWidth: 1 },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 3 },
  actions: { flexDirection: 'row-reverse', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  deleteBtn: { width: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
