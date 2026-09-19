export type LatLng = [number, number]; // [lat, lon]

export type FeatureType = 'point' | 'line' | 'polygon' | 'building';

export type FeatureSource = 'manual' | 'osm' | 'imported';

export interface GeoFeature {
  id: string;
  type: FeatureType;
  name: string;
  category: string;
  coords: LatLng[];
  source: FeatureSource;
  color: string;
  createdAt: number;
  notes?: string;
  osmTags?: Record<string, string>;
  osmId?: string;
  pointNumber?: string;
  pointCode?: string;
  elevation?: number;
  easting?: number;
  northing?: number;
  fillOpacity?: number;
  lineWidth?: number;
  model3d?: boolean;
  buildingFloors?: number;
  roofStyle?: 'flat' | 'gable' | 'hip';
  modelSource?: 'local-parametric' | 'osm-height' | 'manual';
  modelVersion?: string;
  modelUpdatedAt?: number;
  layerId?: string;
  visible?: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  features: GeoFeature[];
  center: LatLng;
  zoom: number;
}

export interface BaseLayer {
  id: string;
  name: string;
  nameAr: string;
  category: 'streets' | 'satellite' | 'topo' | 'light-dark' | 'other';
  url: string;
  subdomains?: string;
  attribution: string;
  maxZoom: number;
  preview: string; // color swatch fallback
}

export type DrawMode = 'none' | 'point' | 'line' | 'polygon' | 'rectangle' | 'measure-line' | 'measure-area';

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface RNToWebMessage {
  type:
    | 'SET_LAYER'
    | 'SET_OVERLAY'
    | 'LOCATE'
    | 'SET_FEATURES'
    | 'SET_DRAW_MODE'
    | 'FINISH_DRAWING'
    | 'CANCEL_DRAWING'
    | 'UNDO_POINT'
    | 'FIT_BOUNDS'
    | 'ZOOM_IN'
    | 'ZOOM_OUT'
    | 'FOCUS_FEATURE';
  payload?: any;
}

export interface WebToRNMessage {
  type: 'READY' | 'MAP_CLICK' | 'MAP_MOVED' | 'DRAW_UPDATE' | 'DRAW_COMPLETE' | 'ERROR';
  payload?: any;
}
