export type FurnitureType = 'sofa' | 'chair' | 'bed' | 'table' | 'cabinet' | 'plant' | 'rug' | 'custom';
export type DimensionSource = 'estimated' | 'measured' | 'sample';
export type ViewMode = 'overview' | 'inside' | 'plan';
export interface Room {
  width: number; depth: number; height: number;
  wallColor: string; floorColor: string;
  door: { wall: 'front' | 'back' | 'left' | 'right'; offset: number; width: number };
}
export interface FurnitureItem {
  id: string; type: FurnitureType; name: string;
  width: number; depth: number; height: number;
  color: string; source: DimensionSource;
  x: number; z: number; rotation: number; placed: boolean; locked: boolean;
  photoId?: string; detectionId?: string;
}
export interface Detection {
  id: string; label: string; type: FurnitureType; score: number;
  box: [number, number, number, number];
  source: 'model' | 'manual';
}
export interface Photo {
  id: string; uri: string; width: number; height: number;
  name: string; detections: Detection[];
  analysisStatus: 'idle' | 'running' | 'complete' | 'failed';
  analysisMessage?: string; processedUri?: string;
}
export interface LayoutSnapshot { id: string; name: string; items: FurnitureItem[]; createdAt: string }
export interface Project {
  id: string; name: string; room: Room; items: FurnitureItem[]; photos: Photo[];
  layouts: LayoutSnapshot[]; createdAt: string; updatedAt: string;
  favorite: boolean; sample: boolean; cover?: 'living' | 'bedroom' | 'workspace';
}
export interface Settings {
  displayName: string; units: 'cm' | 'm'; snap: boolean; showGrid: boolean;
  reduceMotion: boolean; onboardingSeen: boolean;
}
export interface CatalogEntry {
  type: FurnitureType; name: string; description: string;
  width: number; depth: number; height: number; color: string;
}
export interface SceneProps {
  project: Project; mode: ViewMode; selectedId: string | null;
  showGrid: boolean; snap: boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  onPlace?: (x: number, z: number) => void;
  placing?: FurnitureItem | null;
  captureRef?: { current: (() => Promise<string>) | null };
}
