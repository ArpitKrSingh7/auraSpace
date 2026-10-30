import type { Dimension, RoomReconstructionProposal } from '../schema';

export const FURNITURE_TYPES = [
  'sofa', 'chair', 'bed', 'table', 'cabinet', 'plant', 'rug', 'custom',
  'wardrobe', 'dressing-table', 'mirror', 'air-conditioner', 'ceiling-fan',
  'desk', 'bedside-table', 'bookshelf', 'shoe-rack', 'tv-unit', 'fridge',
] as const;
export type FurnitureType = typeof FURNITURE_TYPES[number];
export type FurnitureMounting = 'floor' | 'wall' | 'ceiling';
export type DimensionSource = 'estimated' | 'measured' | 'sample';
export type ViewMode = 'overview' | 'inside' | 'plan';
/** Offsets and hinge sides follow increasing x (front/back) or z (left/right). */
export interface RoomOpening {
  id: string;
  kind: 'door' | 'window';
  wall: 'front' | 'back' | 'left' | 'right';
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  hingeSide: 'start' | 'end';
  swingDirection: 'inward' | 'outward';
  openAngleDeg: number;
}
export interface Room {
  width: number;
  depth: number;
  height: number;
  dimensionSources?: Partial<Record<'width' | 'depth' | 'height', Dimension['source']>>;
  wallColor: string;
  floorColor: string;
  door: {
    wall: 'front' | 'back' | 'left' | 'right';
    offset: number;
    width: number;
  };
  /** Undefined keeps the original single door; an empty array means no openings. */
  openings?: RoomOpening[];
}
export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  name: string;
  width: number;
  depth: number;
  height: number;
  /** Missing mounting and elevation retain the original floor-based behavior. */
  mounting?: FurnitureMounting;
  /** Bottom of the item above the floor, in meters; ceiling mounting uses room height. */
  elevationM?: number;
  color: string;
  source: DimensionSource;
  x: number;
  z: number;
  rotation: number;
  placed: boolean;
  locked: boolean;
  photoId?: string;
  detectionId?: string;
}
export interface Detection {
  id: string;
  label: string;
  type: FurnitureType;
  score: number;
  box: [number, number, number, number];
  source: 'model' | 'manual';
  color?: string;
}
export interface Photo {
  id: string;
  uri: string;
  width: number;
  height: number;
  name: string;
  detections: Detection[];
  analysisStatus: 'idle' | 'running' | 'complete' | 'failed';
  analysisMessage?: string;
  processedUri?: string;
  roomProposal?: RoomReconstructionProposal;
}
export interface LayoutSnapshot {
  id: string;
  name: string;
  items: FurnitureItem[];
  createdAt: string;
}
export interface Project {
  id: string;
  name: string;
  room: Room;
  items: FurnitureItem[];
  photos: Photo[];
  layouts: LayoutSnapshot[];
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  sample: boolean;
  cover?: 'living' | 'bedroom' | 'workspace';
}
export interface Settings {
  displayName: string;
  units: 'cm' | 'm';
  snap: boolean;
  showGrid: boolean;
  reduceMotion: boolean;
  onboardingSeen: boolean;
}
export interface CatalogEntry {
  type: FurnitureType;
  name: string;
  description: string;
  width: number;
  depth: number;
  height: number;
  mounting?: FurnitureMounting;
  elevationM?: number;
  color: string;
}
export interface SceneProps {
  project: Project;
  mode: ViewMode;
  selectedId: string | null;
  showGrid: boolean;
  snap: boolean;
  onSelect: (id: string | null) => void;
  onOpeningSelect?: (id: string) => void;
  selectedOpeningId?: string | null;
  onMove: (id: string, x: number, z: number) => void;
  onRotate?: (id: string, rotationDeg: number) => void;
  onPlace?: (x: number, z: number) => void;
  placing?: FurnitureItem | null;
  captureRef?: { current: (() => Promise<string>) | null };
}
