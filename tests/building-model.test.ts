import { describe, expect, it } from 'vitest';
import { buildLocalBuildingModels, modelHeightM } from '../lib/buildingModel';
import { generateOBJ } from '../lib/objWriter';
import type { GeoFeature, Project } from '../types';

const project: Project = {
  id: 'p-1',
  name: 'اختبار نموذج',
  createdAt: 0,
  updatedAt: 0,
  center: [24.7136, 46.6753],
  zoom: 15,
  features: [],
};

const building: GeoFeature = {
  id: 'b-1',
  type: 'building',
  name: 'مبنى اختبار',
  category: 'مبنى',
  coords: [
    [24.7136, 46.6753],
    [24.7136, 46.6763],
    [24.7146, 46.6763],
    [24.7146, 46.6753],
  ],
  source: 'manual',
  color: '#9333EA',
  createdAt: 0,
};

describe('local building model processor', () => {
  it('calculates the parametric building height', () => {
    expect(modelHeightM({ floorHeight: 3, stories: 2, roofStyle: 'gable' })).toBeCloseTo(7.05, 2);
  });

  it('returns persisted model metadata for each building footprint', () => {
    const result = buildLocalBuildingModels([building], { floorHeight: 3, stories: 3, roofStyle: 'flat' });
    expect(result.summary.buildingCount).toBe(1);
    expect(result.summary.footprintAreaSqMeters).toBeGreaterThan(9000);
    expect(result.updates[0].patch.model3d).toBe(true);
    expect(result.updates[0].patch.buildingFloors).toBe(3);
    expect(result.updates[0].patch.roofStyle).toBe('flat');
  });

  it('creates an OBJ with roof, base, and side faces', () => {
    const result = generateOBJ(project, [{ ...building, ...buildLocalBuildingModels([building], { floorHeight: 3, stories: 2, roofStyle: 'flat' }).updates[0].patch }]);
    expect(result.modelCount).toBe(1);
    expect(result.vertexCount).toBe(8);
    expect(result.obj).toContain('o b-1');
    expect(result.obj).toContain('f 1 2 6 5');
  });
});
