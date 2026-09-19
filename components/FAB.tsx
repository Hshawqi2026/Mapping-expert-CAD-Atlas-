import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';

interface FABProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
  size?: number;
  color?: string;
  style?: ViewStyle;
  disabled?: boolean;
}

export default function FAB({ icon, onPress, active, size = 22, color, style, disabled }: FABProps) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: active ? palette.primary : palette.card,
          borderColor: palette.border,
          opacity: disabled ? 0.4 : pressed ? 0.82 : 1,
          shadowColor: palette.text,
          shadowOpacity: palette.isDark ? 0.26 : 0.14,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color ?? (active ? '#fff' : palette.text)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
    elevation: 5,
  },
});
