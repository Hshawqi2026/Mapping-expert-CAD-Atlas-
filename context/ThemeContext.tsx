import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { AppSettings, loadSettings, saveSettings } from '../lib/storage';

export interface Palette {
  bg: string;
  bgElevated: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryDark: string;
  accent: string;
  danger: string;
  success: string;
  warning: string;
  overlay: string;
  isDark: boolean;
}

const LIGHT: Palette = {
  bg: '#F5F7FA',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  border: '#DCE4ED',
  text: '#142235',
  textMuted: '#65748B',
  primary: '#0F766E',
  primaryDark: '#115E59',
  accent: '#D97706',
  danger: '#D64545',
  success: '#15803D',
  warning: '#B45309',
  overlay: 'rgba(20,34,53,0.58)',
  isDark: false,
};

const DARK: Palette = {
  bg: '#0D1726',
  bgElevated: '#132238',
  card: '#182A40',
  border: '#27405B',
  text: '#F4F7FB',
  textMuted: '#9CB0C7',
  primary: '#2DD4BF',
  primaryDark: '#0F766E',
  accent: '#F5B44B',
  danger: '#FB7185',
  success: '#4ADE80',
  warning: '#FBBF24',
  overlay: 'rgba(4,12,24,0.72)',
  isDark: true,
};

interface ThemeContextValue {
  palette: Palette;
  mode: AppSettings['themeMode'];
  setMode: (m: AppSettings['themeMode']) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: LIGHT,
  mode: 'system',
  setMode: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scheme = useColorScheme();
  const [mode, setModeState] = useState<AppSettings['themeMode']>('system');

  useEffect(() => {
    loadSettings().then((s) => setModeState(s.themeMode));
  }, []);

  const setMode = (m: AppSettings['themeMode']) => {
    setModeState(m);
    loadSettings().then((s) => saveSettings({ ...s, themeMode: m }));
  };

  const resolvedDark = mode === 'system' ? scheme === 'dark' : mode === 'dark';
  const palette = useMemo(() => (resolvedDark ? DARK : LIGHT), [resolvedDark]);

  return <ThemeContext.Provider value={{ palette, mode, setMode }}>{children}</ThemeContext.Provider>;
};

export function useTheme() {
  return useContext(ThemeContext);
}
