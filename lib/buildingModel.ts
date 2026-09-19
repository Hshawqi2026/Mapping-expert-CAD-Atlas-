import { GeoFeature, Project } from '../types';
import { polygonAreaSqMeters } from './geo';

export type RoofStyle = 'flat' | 'gable' | 'hip';

export interface LocalModelConfig {
  floorHeight: number;
  stories: number;
  roofStyle: RoofStyle;
}

export interface LocalModelSummary {
  buildingCount: number;
  footprintAreaSqMeters: number;
  totalVolumeM3: number;
  averageHeightM: number;
  roofStyle: RoofStyle;
}

export interface LocalModelBuildResult {
  updates: Array<{ id: string; patch: Partial<GeoFeature> }>;
  summary: LocalModelSummary;
}

export const DEFAULT_MODEL_CONFIG: LocalModelConfig = {
  floorHeight: 3,
  stories: 2,
  roofStyle: 'flat',
};

export function normalizeModelConfig(config: LocalModelConfig): LocalModelConfig {
  return {
    floorHeight: Math.min(12, Math.max(2.2, Number(config.floorHeight) || DEFAULT_MODEL_CONFIG.floorHeight)),
    stories: Math.min(40, Math.max(1, Math.round(Number(config.stories) || DEFAULT_MODEL_CONFIG.stories))),
    roofStyle: config.roofStyle,
  };
}

export function roofRiseM(style: RoofStyle, floorHeight: number): number {
  if (style === 'gable') return Math.max(0.35, floorHeight * 0.35);
  if (style === 'hip') return Math.max(0.25, floorHeight * 0.25);
  return 0;
}

export function modelHeightM(config: LocalModelConfig): number {
  const normalized = normalizeModelConfig(config);
  return normalized.stories * normalized.floorHeight + roofRiseM(normalized.roofStyle, normalized.floorHeight);
}

/**
 * Converts building footprints into deterministic local parametric models.
 * The processor runs entirely on-device: no photo upload and no remote model API
 * are needed. Each footprint becomes an extruded engineering volume with a
 * persisted height, floors, roof style, and source marker for later exports.
 */
export function buildLocalBuildingModels(
  features: GeoFeature[],
  config: LocalModelConfig,
  _project?: Project,
): LocalModelBuildResult {
  const normalized = normalizeModelConfig(config);
  const height = modelHeightM(normalized);
  const buildings = features.filter((feature) => feature.type === 'building' && feature.coords.length >= 3);
  const footprintAreaSqMeters = buildings.reduce((sum, feature) => sum + polygonAreaSqMeters(feature.coords), 0);
  const totalVolumeM3 = footprintAreaSqMeters * height;

  return {
    updates: buildings.map((feature) => ({
      id: feature.id,
      patch: {
        elevation: Number(height.toFixed(2)),
        buildingFloors: normalized.stories,
        roofStyle: normalized.roofStyle,
        model3d: true,
        modelSource: 'local-parametric',
        modelVersion: '1.0',
        modelUpdatedAt: Date.now(),
        fillOpacity: 0.42,
      },
    })),
    summary: {
      buildingCount: buildings.length,
      footprintAreaSqMeters,
      totalVolumeM3,
      averageHeightM: height,
      roofStyle: normalized.roofStyle,
    },
  };
}

export function describeRoofStyle(style: RoofStyle): string {
  if (style === 'gable') return 'جملون';
  if (style === 'hip') return 'هرمي';
  return 'مسطح';
}
