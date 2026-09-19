import AsyncStorage from '@react-native-async-storage/async-storage';
import { Project } from '../types';

const PROJECTS_KEY = '@geosurvey/projects_v1';
const ACTIVE_PROJECT_KEY = '@geosurvey/active_project_v1';
const SETTINGS_KEY = '@geosurvey/settings_v1';
const LAST_LAYER_KEY = '@geosurvey/last_layer_v1';

export async function loadProjects(): Promise<Project[]> {
  try {
    const raw = await AsyncStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveProjects(projects: Project[]): Promise<void> {
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export async function loadActiveProjectId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_PROJECT_KEY);
}

export async function saveActiveProjectId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PROJECT_KEY, id);
}

export interface AppSettings {
  themeMode: 'system' | 'light' | 'dark';
  units: 'metric';
  gpsHighAccuracy: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  units: 'metric',
  gpsHighAccuracy: true,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadLastLayer(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_LAYER_KEY);
}

export async function saveLastLayer(id: string): Promise<void> {
  await AsyncStorage.setItem(LAST_LAYER_KEY, id);
}
