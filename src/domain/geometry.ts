import type { FurnitureItem, Project, Room } from './types';

export interface PointXZ { x: number; z: number }
export interface ProjectWarning { itemId: string; message: string }
const EPSILON = 0.00001;

/** Local +x rotates clockwise toward +z when viewed in plan. */
export function getCorners(item: Pick<FurnitureItem, 'x' | 'z' | 'width' | 'depth' | 'rotation'>): PointXZ[] {
  const radians = item.rotation * Math.PI / 180;
  const cos = Math.cos(radians); const sin = Math.sin(radians);
  return [
    [-item.width / 2, -item.depth / 2], [item.width / 2, -item.depth / 2],
    [item.width / 2, item.depth / 2], [-item.width / 2, item.depth / 2],
  ].map(([x, z]) => ({ x: item.x + x! * cos - z! * sin, z: item.z + x! * sin + z! * cos }));
}

function polygonOverlap(a: PointXZ[], b: PointXZ[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i]!; const end = polygon[(i + 1) % polygon.length]!;
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (length < EPSILON) continue;
      const axis = { x: -(end.z - start.z) / length, z: (end.x - start.x) / length };
      const pa = a.map((point) => point.x * axis.x + point.z * axis.z);
      const pb = b.map((point) => point.x * axis.x + point.z * axis.z);
      if (Math.max(...pa) <= Math.min(...pb) + EPSILON || Math.max(...pb) <= Math.min(...pa) + EPSILON) return false;
    }
  }
  return true;
}

/** Touching edges are allowed. Rugs are floor decoration rather than obstacles. */
export function overlaps(a: FurnitureItem, b: FurnitureItem): boolean {
  if (!a.placed || !b.placed || a.id === b.id || a.type === 'rug' || b.type === 'rug') return false;
  return polygonOverlap(getCorners(a), getCorners(b));
}

export function pointInFootprint(x: number, z: number, item: FurnitureItem, padding = 0): boolean {
  if (!item.placed || item.type === 'rug') return false;
  const radians = -item.rotation * Math.PI / 180;
  const dx = x - item.x; const dz = z - item.z;
  const localX = dx * Math.cos(radians) - dz * Math.sin(radians);
  const localZ = dx * Math.sin(radians) + dz * Math.cos(radians);
  return Math.abs(localX) < item.width / 2 + padding - EPSILON && Math.abs(localZ) < item.depth / 2 + padding - EPSILON;
}

export function isInsideRoom(item: FurnitureItem, room: Room): boolean {
  return getCorners(item).every(({ x, z }) => x >= -EPSILON && z >= -EPSILON && x <= room.width + EPSILON && z <= room.depth + EPSILON);
}

/** Conservative square around an inward door swing, not a building-code check. */
export function getDoorClearance(room: Room): PointXZ[] {
  const { wall, offset, width } = room.door;
  let x = offset; let z = 0; let w = width; let d = width;
  if (wall === 'front') z = room.depth - width;
  if (wall === 'left' || wall === 'right') {
    x = wall === 'left' ? 0 : room.width - width; z = offset;
    w = width; d = width;
  }
  return [{ x, z }, { x: x + w, z }, { x: x + w, z: z + d }, { x, z: z + d }];
}

export function validatePlacement(item: FurnitureItem, room: Room, items: FurnitureItem[]): string[] {
  if (!item.placed) return [];
  const warnings: string[] = [];
  if (!isInsideRoom(item, room)) warnings.push('Extends beyond the room boundary');
  if (item.height > room.height + EPSILON) warnings.push('Taller than the room ceiling');
  if (item.type !== 'rug' && polygonOverlap(getCorners(item), getDoorClearance(room))) warnings.push('Blocks the doorway clearance');
  for (const other of items) if (overlaps(item, other)) warnings.push(`Overlaps ${other.name}`);
  return warnings;
}

export function getProjectWarnings(project: Project): ProjectWarning[] {
  return project.items.flatMap((item) => validatePlacement(item, project.room, project.items).map((message) => ({ itemId: item.id, message })));
}

export function snapPosition(value: number, enabled = true, step = 0.1): number {
  return enabled ? Math.round(value / step) * step : value;
}

export function normalizeRotation(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function getRoomMetrics(project: Project) {
  const warnings = getProjectWarnings(project);
  const roomArea = project.room.width * project.room.depth;
  const occupied = project.items.filter((item) => item.placed && item.type !== 'rug').reduce((sum, item) => sum + item.width * item.depth, 0);
  const invalidArea = warnings.some((warning) => warning.message.includes('Overlaps') || warning.message.includes('boundary'));
  return {
    roomArea, occupiedArea: invalidArea ? null : occupied,
    freeArea: invalidArea ? null : Math.max(0, roomArea - occupied),
    utilization: invalidArea ? null : occupied / roomArea,
    placedCount: project.items.filter((item) => item.placed).length,
    estimatedCount: project.items.filter((item) => item.source === 'estimated').length,
  };
}
