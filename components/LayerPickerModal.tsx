import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView, Switch } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { BASE_LAYERS, CATEGORY_LABELS } from '../lib/mapLayers';
import { BaseLayer } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  currentLayerId: string;
  onSelect: (id: string) => void;
  labelsOn: boolean;
  onToggleLabels: (v: boolean) => void;
}

const CATEGORIES: BaseLayer['category'][] = ['streets', 'satellite', 'topo', 'light-dark', 'other'];

export default function LayerPickerModal({ visible, onClose, currentLayerId, onSelect, labelsOn, onToggleLabels }: Props) {
  const { palette } = useTheme();
  const [tab, setTab] = useState<BaseLayer['category']>('streets');
  const currentLayer = BASE_LAYERS.find((l) => l.id === currentLayerId);
  const filtered = BASE_LAYERS.filter((l) => l.category === tab);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: palette.bgElevated }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.text }]}>طبقات الخريطة الأساسية</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close-circle" size={26} color={palette.textMuted} />
            </Pressable>
          </View>
          <Text style={[styles.subtitle, { color: palette.textMuted }]}>
            جميع الطبقات مجانية ومفتوحة المصدر - بدون مفاتيح API
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow} contentContainerStyle={{ gap: 8 }}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setTab(c)}
                style={[
                  styles.tabChip,
                  {
                    backgroundColor: tab === c ? palette.primary : palette.card,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text style={{ color: tab === c ? '#fff' : palette.text, fontSize: 13, fontWeight: '600' }}>
                  {CATEGORY_LABELS[c]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {filtered.map((layer) => {
                const selected = layer.id === currentLayerId;
                return (
                  <Pressable
                    key={layer.id}
                    onPress={() => onSelect(layer.id)}
                    style={[
                      styles.card,
                      { borderColor: selected ? palette.primary : palette.border, backgroundColor: palette.card },
                    ]}
                  >
                    <View style={[styles.swatch, { backgroundColor: layer.preview }]}>
                      {selected && <Ionicons name="checkmark-circle" size={22} color="#fff" />}
                    </View>
                    <Text numberOfLines={1} style={[styles.cardTitle, { color: palette.text }]}>
                      {layer.nameAr}
                    </Text>
                    <Text numberOfLines={1} style={[styles.cardSub, { color: palette.textMuted }]}>
                      {layer.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {currentLayer?.category === 'satellite' && (
              <View style={[styles.overlayRow, { borderColor: palette.border, backgroundColor: palette.card }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontWeight: '600' }}>إظهار أسماء الأماكن والحدود</Text>
                  <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: 2 }}>
                    طبقة تسميات مرجعية فوق القمر الصناعي
                  </Text>
                </View>
                <Switch value={labelsOn} onValueChange={onToggleLabels} trackColor={{ true: palette.primary }} />
              </View>
            )}
            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 18,
    maxHeight: '82%',
  },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 4, marginBottom: 12, textAlign: 'right' },
  tabsRow: { flexDirection: 'row-reverse' },
  tabChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  card: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 2,
    padding: 10,
    marginBottom: 10,
  },
  swatch: { height: 64, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  cardSub: { fontSize: 11, textAlign: 'right', marginTop: 1 },
  overlayRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
    gap: 10,
  },
});
