import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TextInput, FlatList, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { useProjects } from '../context/ProjectsContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ProjectSwitcherModal({ visible, onClose }: Props) {
  const { palette } = useTheme();
  const { projects, activeProjectId, setActiveProjectId, createProject, deleteProject, renameProject, activeProject } =
    useProjects();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const handleCreate = () => {
    const center = activeProject?.center ?? [24.7136, 46.6753];
    createProject(newName || `مشروع ${projects.length + 1}`, center);
    setNewName('');
    setCreating(false);
  };

  const confirmDelete = (id: string, name: string) => {
    Alert.alert('حذف المشروع', `هل تريد حذف "${name}" وكل عناصره نهائيًا؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => deleteProject(id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: palette.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: palette.bgElevated }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.text }]}>المشاريع الميدانية</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close-circle" size={26} color={palette.textMuted} />
            </Pressable>
          </View>

          <FlatList
            data={projects}
            keyExtractor={(p) => p.id}
            style={{ maxHeight: 340, marginTop: 8 }}
            renderItem={({ item }) => {
              const selected = item.id === activeProjectId;
              const isRenaming = renamingId === item.id;
              return (
                <Pressable
                  onPress={() => {
                    setActiveProjectId(item.id);
                    onClose();
                  }}
                  style={[
                    styles.row,
                    { borderColor: selected ? palette.primary : palette.border, backgroundColor: palette.card },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    {isRenaming ? (
                      <TextInput
                        value={renameText}
                        onChangeText={setRenameText}
                        autoFocus
                        onSubmitEditing={() => {
                          renameProject(item.id, renameText.trim() || item.name);
                          setRenamingId(null);
                        }}
                        style={[styles.renameInput, { color: palette.text, borderColor: palette.border }]}
                        textAlign="right"
                      />
                    ) : (
                      <>
                        <Text style={[styles.rowTitle, { color: palette.text }]}>{item.name}</Text>
                        <Text style={{ color: palette.textMuted, fontSize: 12, marginTop: 2, textAlign: 'right' }}>
                          {item.features.length} عنصر · {new Date(item.updatedAt).toLocaleDateString('ar-EG')}
                        </Text>
                      </>
                    )}
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={palette.primary} style={{ marginLeft: 8 }} />}
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      if (isRenaming) {
                        renameProject(item.id, renameText.trim() || item.name);
                        setRenamingId(null);
                      } else {
                        setRenamingId(item.id);
                        setRenameText(item.name);
                      }
                    }}
                    style={{ padding: 6 }}
                  >
                    <Ionicons name={isRenaming ? 'checkmark' : 'pencil'} size={18} color={palette.textMuted} />
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => confirmDelete(item.id, item.name)} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={18} color={palette.danger} />
                  </Pressable>
                </Pressable>
              );
            }}
          />

          {creating ? (
            <View style={[styles.newRow, { borderColor: palette.border }]}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="اسم المشروع الجديد"
                placeholderTextColor={palette.textMuted}
                style={[styles.renameInput, { color: palette.text, borderColor: palette.border, flex: 1 }]}
                textAlign="right"
                autoFocus
              />
              <Pressable onPress={handleCreate} style={[styles.smallBtn, { backgroundColor: palette.primary }]}>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </Pressable>
              <Pressable onPress={() => setCreating(false)} style={[styles.smallBtn, { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }]}>
                <Ionicons name="close" size={18} color={palette.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setCreating(true)} style={[styles.createBtn, { backgroundColor: palette.primary }]}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', marginRight: 8 }}>مشروع جديد</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: '75%' },
  header: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  rowTitle: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  renameInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  newRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 10, alignItems: 'center' },
  smallBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  createBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 14,
  },
});
