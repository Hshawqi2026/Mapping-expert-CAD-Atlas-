import { GeoFeature, Project } from '../types';
import { latLonToUTM } from './geo';

export interface OBJGenerationResult {
  obj: string;
  zoneNumber: number;
  hemisphere: 'N' | 'S';
  modelCount: number;
  vertexCount: number;
}

function face(indices: number[]): string {
  return `f ${indices.join(' ')}\n`;
}

/** Creates a lightweight, standards-compatible OBJ from locally generated building volumes. */
export function generateOBJ(project: Project, features: GeoFeature[]): OBJGenerationResult {
  const models = features.filter((feature) => feature.type === 'building' && feature.model3d && (feature.elevation ?? 0) > 0 && feature.coords.length >= 3);
  const origin = models.flatMap((feature) => feature.coords)[0] ?? project.center;
  const zoneNumber = Math.floor((origin[1] + 180) / 6) + 1;
  const hemisphere: 'N' | 'S' = origin[0] >= 0 ? 'N' : 'S';
  let nextIndex = 1;
  let content = `# ${project.name} — Agon Surveyor local building models\n# Coordinates: WGS84 / UTM zone ${zoneNumber}${hemisphere}, units: meters\n`;

  for (const feature of models) {
    const base = feature.coords.map(([lat, lon]) => {
      const point = latLonToUTM(lat, lon, zoneNumber);
      return { x: point.easting, y: point.northing, z: 0 };
    });
    const roof = base.map((point) => ({ ...point, z: feature.elevation ?? 0 }));
    const indices = [...base, ...roof].map(() => nextIndex++);
    content += `\no ${feature.id}\n`; 
    content += `# ${feature.name} | ${feature.roofStyle ?? 'flat'} roof | ${feature.buildingFloors ?? 1} floors\n`;
    for (const vertex of [...base, ...roof]) content += `v ${vertex.x.toFixed(4)} ${vertex.y.toFixed(4)} ${vertex.z.toFixed(3)}\n`;

    const baseIndices = indices.slice(0, base.length);
    const roofIndices = indices.slice(base.length);
    for (let index = 1; index < baseIndices.length - 1; index += 1) {
      content += face([baseIndices[0], baseIndices[index + 1], baseIndices[index]]);
      content += face([roofIndices[0], roofIndices[index], roofIndices[index + 1]]);
    }
    for (let index = 0; index < baseIndices.length; index += 1) {
      const next = (index + 1) % baseIndices.length;
      content += face([baseIndices[index], baseIndices[next], roofIndices[next], roofIndices[index]]);
    }
  }

  return { obj: content, zoneNumber, hemisphere, modelCount: models.length, vertexCount: nextIndex - 1 };
}
