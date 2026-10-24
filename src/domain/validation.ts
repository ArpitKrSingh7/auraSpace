import { normalizeRotation } from './geometry';
import { DEFAULT_SETTINGS } from './catalog';
import type { Detection, FurnitureItem, FurnitureType, LayoutSnapshot, Photo, Project, Room, Settings } from './types';

export const MAX_IMPORT_BYTES = 24 * 1024 * 1024;
const TYPES: FurnitureType[] = ['sofa', 'chair', 'bed', 'table', 'cabinet', 'plant', 'rug', 'custom'];

export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError'; }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, limit = 100, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new ValidationError(`${label} must contain 1–${limit} characters.`);
  return value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(`${label} must be between ${min} and ${max}.`);
  return value;
}

function bool(value: unknown, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new ValidationError('A toggle has an invalid value.');
  return value;
}

function color(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^#[a-f\d]{6}$/i.test(value)) throw new ValidationError(`${label} must be a six-digit hex color.`);
  return value;
}

function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new ValidationError(`${label} must contain at most ${max} entries.`);
  return value;
}

function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new ValidationError(`${label} is not supported.`);
  return value as T;
}

function date(value: unknown, label: string): string {
  const string = text(value, label, 40);
  if (!Number.isFinite(Date.parse(string))) throw new ValidationError(`${label} must be a valid date.`);
  return new Date(string).toISOString();
}

function unique(values: { id: string }[], label: string) {
  if (new Set(values.map((item) => item.id)).size !== values.length) throw new ValidationError(`${label} contain duplicate IDs.`);
}

function imageUri(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_IMPORT_BYTES || !/^(data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$|https?:\/\/[^\s]+$|file:\/\/[^\r\n]+$|content:\/\/[^\r\n]+$|blob:https?:\/\/[^\s]+$)/.test(value)) {
    throw new ValidationError('The photograph has an invalid or unsupported image address.');
  }
  return value;
}

export function validateRoom(input: unknown): Room {
  const room = record(input, 'Room');
  const width = number(room.width, 'Room width', 1, 40);
  const depth = number(room.depth, 'Room depth', 1, 40);
  const door = record(room.door, 'Door');
  const wall = choice(door.wall, ['front', 'back', 'left', 'right'] as const, 'Door wall');
  const wallLength = wall === 'front' || wall === 'back' ? width : depth;
  const doorWidth = number(door.width, 'Door width', 0.3, Math.min(3, wallLength));
  const offset = number(door.offset, 'Door offset', 0, wallLength - doorWidth + 0.000001);
  return {
    width, depth, height: number(room.height, 'Room height', 1.5, 12),
    wallColor: color(room.wallColor, 'Wall color'), floorColor: color(room.floorColor, 'Floor color'),
    door: { wall, width: doorWidth, offset },
  };
}

export function validateItem(input: unknown): FurnitureItem {
  const item = record(input, 'Furniture');
  return {
    id: text(item.id, 'Furniture ID', 128), type: choice(item.type, TYPES, 'Furniture type'), name: text(item.name, 'Furniture name'),
    width: number(item.width, 'Furniture width', 0.01, 20), depth: number(item.depth, 'Furniture depth', 0.01, 20),
    height: number(item.height, 'Furniture height', 0.005, 12), color: color(item.color, 'Furniture color'),
    source: choice(item.source, ['estimated', 'measured', 'sample'] as const, 'Dimension source'),
    x: number(item.x, 'Furniture X position', -100, 100), z: number(item.z, 'Furniture Z position', -100, 100),
    rotation: normalizeRotation(number(item.rotation, 'Furniture rotation', -360000, 360000)),
    placed: bool(item.placed), locked: bool(item.locked),
    ...(item.photoId !== undefined ? { photoId: text(item.photoId, 'Photo reference', 128) } : {}),
    ...(item.detectionId !== undefined ? { detectionId: text(item.detectionId, 'Detection reference', 128) } : {}),
  };
}

export function validateDetection(input: unknown, imageWidth = 16384, imageHeight = 16384): Detection {
  const detection = record(input, 'Detection');
  const box = array(detection.box, 'Detection box', 4);
  if (box.length !== 4) throw new ValidationError('A detection box must have four coordinates.');
  // Detection boxes use x, y, width, height in oriented source-image pixels.
  const x = number(box[0], 'Box X', 0, imageWidth);
  const y = number(box[1], 'Box Y', 0, imageHeight);
  const width = number(box[2], 'Box width', 1, imageWidth);
  const height = number(box[3], 'Box height', 1, imageHeight);
  if (x + width > imageWidth + 1 || y + height > imageHeight + 1) throw new ValidationError('A detection extends outside its image.');
  return {
    id: text(detection.id, 'Detection ID', 128), label: text(detection.label, 'Detection label'),
    type: choice(detection.type, TYPES, 'Detected furniture type'), score: number(detection.score, 'Detection score', 0, 1),
    box: [x, y, width, height], source: choice(detection.source, ['model', 'manual'] as const, 'Detection source'),
  };
}

export function validatePhoto(input: unknown): Photo {
  const photo = record(input, 'Photo');
  const width = number(photo.width, 'Photo width', 1, 16384);
  const height = number(photo.height, 'Photo height', 1, 16384);
  if (width * height > 40_000_000) throw new ValidationError('The photo exceeds 40 megapixels.');
  const detections = array(photo.detections, 'Detections', 100).map((item) => validateDetection(item, width, height));
  unique(detections, 'Detections');
  return {
    id: text(photo.id, 'Photo ID', 128), name: text(photo.name, 'Photo name', 180),
    uri: imageUri(photo.uri), width, height, detections,
    analysisStatus: choice(photo.analysisStatus, ['idle', 'running', 'complete', 'failed'] as const, 'Analysis status'),
    ...(photo.analysisMessage !== undefined ? { analysisMessage: text(photo.analysisMessage, 'Analysis message', 1000) } : {}),
    ...(photo.processedUri !== undefined ? { processedUri: imageUri(photo.processedUri) } : {}),
  };
}

function checkReferences(items: FurnitureItem[], photos: Photo[]) {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  for (const item of items) {
    if (item.detectionId && !item.photoId) throw new ValidationError('A furniture detection needs a source photo.');
    if (item.photoId && !byId.has(item.photoId)) throw new ValidationError('Furniture refers to a missing source photograph.');
    if (item.detectionId && !byId.get(item.photoId!)!.detections.some((detection) => detection.id === item.detectionId)) throw new ValidationError('Furniture refers to a missing detection.');
  }
}

export function validateProject(input: unknown): Project {
  const project = record(input, 'Project');
  const photos = array(project.photos, 'Photographs', 30).map(validatePhoto);
  const items = array(project.items, 'Furniture', 200).map(validateItem);
  unique(photos, 'Photographs'); unique(items, 'Furniture'); checkReferences(items, photos);
  const layouts: LayoutSnapshot[] = array(project.layouts, 'Layouts', 30).map((input) => {
    const layout = record(input, 'Layout');
    const layoutItems = array(layout.items, 'Layout furniture', 200).map(validateItem);
    unique(layoutItems, 'Layout furniture'); checkReferences(layoutItems, photos);
    return { id: text(layout.id, 'Layout ID', 128), name: text(layout.name, 'Layout name'), items: layoutItems, createdAt: date(layout.createdAt, 'Layout creation date') };
  });
  unique(layouts, 'Layouts');
  return {
    id: text(project.id, 'Project ID', 128), name: text(project.name, 'Project name'), room: validateRoom(project.room),
    items, photos, layouts, createdAt: date(project.createdAt, 'Creation date'), updatedAt: date(project.updatedAt, 'Update date'),
    favorite: bool(project.favorite), sample: bool(project.sample),
    ...(project.cover !== undefined ? { cover: choice(project.cover, ['living', 'bedroom', 'workspace'] as const, 'Project cover') } : {}),
  };
}

export function validateSettings(input: unknown): Settings {
  const settings = record(input, 'Settings');
  return {
    displayName: text(settings.displayName, 'Studio name', 60, DEFAULT_SETTINGS.displayName),
    units: settings.units === undefined ? 'cm' : choice(settings.units, ['cm', 'm'] as const, 'Display units'),
    snap: bool(settings.snap, true), showGrid: bool(settings.showGrid, true),
    reduceMotion: bool(settings.reduceMotion), onboardingSeen: bool(settings.onboardingSeen),
  };
}

export function parseProjectJson(json: string): Project {
  if (typeof json !== 'string' || new TextEncoder().encode(json).length > MAX_IMPORT_BYTES) throw new ValidationError('Project files must be smaller than 24 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new ValidationError('This file is not valid JSON. Choose an AuraSpace project export.'); }
  const source = record(parsed, 'Project file');
  if (source.format !== undefined) {
    if ((source.format !== 'auraspace-project' && source.format !== 'morrow-project') || source.version !== 1) throw new ValidationError('This project export version is not supported.');
    return validateProject(source.project);
  }
  return validateProject(source);
}

export function exportProjectJson(project: Project): string {
  const portablePhotos = project.photos.filter((photo) => photo.uri.startsWith('data:image/')).map((photo) => ({
    ...photo,
    processedUri: photo.processedUri?.startsWith('data:image/') ? photo.processedUri : undefined,
    analysisStatus: photo.analysisStatus === 'running' ? 'idle' as const : photo.analysisStatus,
  }));
  const ids = new Set(portablePhotos.map((photo) => photo.id));
  const cleanItem = (item: FurnitureItem): FurnitureItem => item.photoId && !ids.has(item.photoId)
    ? { ...item, photoId: undefined, detectionId: undefined } : item;
  const portable = validateProject({ ...project, photos: portablePhotos, items: project.items.map(cleanItem), layouts: project.layouts.map((layout) => ({ ...layout, items: layout.items.map(cleanItem) })) });
  return JSON.stringify({
    format: 'auraspace-project', version: 1, exportedAt: new Date().toISOString(),
    omittedMediaCount: project.photos.length - portablePhotos.length,
    mediaNote: 'Embedded photos travel with this file. Device-local, temporary, and remote-only images are omitted; your layout and furniture remain editable.',
    project: portable,
  }, null, 2);
}
