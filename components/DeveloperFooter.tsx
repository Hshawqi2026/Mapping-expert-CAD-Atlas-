import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { useTheme } from "@/context/ThemeContext";

export default function DeveloperFooter({ overlay = false }: { overlay?: boolean }) {
  const { palette } = useTheme();

  return (
    <View pointerEvents="none" style={[styles.container, overlay && styles.overlay, { backgroundColor: overlay ? `${palette.bgElevated}D9` : "transparent" }]}>
      <Text style={[styles.text, { color: palette.textMuted }]}>تم التطوير بواسطة Eng.Shawqi Hasan Al-Gaor</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  overlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 76,
    borderRadius: 10,
  } as ViewStyle,
  text: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
});
