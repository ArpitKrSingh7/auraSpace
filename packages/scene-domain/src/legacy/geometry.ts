import type { FurnitureItem, Project, Room } from './types';
import { getRoomOpenings, roomOpeningToCanonical } from './openings';
import { getOpeningLeaf } from '../openings';
export { getRoomOpenings, roomOpeningToCanonical } from './openings';

export interface PointXZ {
  x: number;
  z: number;
}
export interface ProjectWarning {
  itemId: string;
  message: string;
}
const EPSILON = 0.00001;

/** Bottom elevation in meters. Missing fields retain legacy floor placement. */
export function getItemElevation(
  item: Pick<FurnitureItem, 'mounting' | 'elevationM' | 'height'>,
  roomHeight?: number,
): number {
  return item.mounting === 'ceiling' && roomHeight !== undefined
    ? Math.max(0, roomHeight - item.height)
    : item.elevationM ?? 0;
}

/** Bounding vertical intervals are conservative; touching surfaces may coexist. */
function verticallyOverlaps(
  a: Pick<FurnitureItem, 'mounting' | 'elevationM' | 'height'>,
  b: Pick<FurnitureItem, 'mounting' | 'elevationM' | 'height'>,
  roomHeight?: number,
): boolean {
  const bottomA = getItemElevation(a, roomHeight),
    bottomB = getItemElevation(b, roomHeight);
  return bottomA + a.height > bottomB + EPSILON &&
    bottomB + b.height > bottomA + EPSILON;
}

/** Local +x rotates clockwise toward +z when viewed in plan. */
export function getCorners(
  item: Pick<FurnitureItem, 'x' | 'z' | 'width' | 'depth' | 'rotation'>,
): PointXZ[] {
  const radians = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    [-item.width / 2, -item.depth / 2],
    [item.width / 2, -item.depth / 2],
    [item.width / 2, item.depth / 2],
    [-item.width / 2, item.depth / 2],
  ].map(([x, z]) => ({
    x: item.x + x! * cos - z! * sin,
    z: item.z + x! * sin + z! * cos,
  }));
}

function polygonOverlap(a: PointXZ[], b: PointXZ[]): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i]!;
      const end = polygon[(i + 1) % polygon.length]!;
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (length < EPSILON) continue;
      const axis = {
        x: -(end.z - start.z) / length,
        z: (end.x - start.x) / length,
      };
      const pa = a.map((point) => point.x * axis.x + point.z * axis.z);
      const pb = b.map((point) => point.x * axis.x + point.z * axis.z);
      if (
        Math.max(...pa) <= Math.min(...pb) + EPSILON ||
        Math.max(...pb) <= Math.min(...pa) + EPSILON
      )
        return false;
    }
  }
  return true;
}

/** Touching edges are allowed. Rugs are floor decoration rather than obstacles. */
export function overlaps(a: FurnitureItem, b: FurnitureItem, roomHeight?: number): boolean {
  if (
    !a.placed ||
    !b.placed ||
    a.id === b.id ||
    a.type === 'rug' ||
    b.type === 'rug' ||
    !verticallyOverlaps(a, b, roomHeight)
  )
    return false;
  return polygonOverlap(getCorners(a), getCorners(b));
}

export function pointInFootprint(
  x: number,
  z: number,
  item: FurnitureItem,
  padding = 0,
): boolean {
  if (!item.placed || item.type === 'rug') return false;
  const radians = (-item.rotation * Math.PI) / 180;
  const dx = x - item.x;
  const dz = z - item.z;
  const localX = dx * Math.cos(radians) - dz * Math.sin(radians);
  const localZ = dx * Math.sin(radians) + dz * Math.cos(radians);
  return (
    Math.abs(localX) < item.width / 2 + padding - EPSILON &&
    Math.abs(localZ) < item.depth / 2 + padding - EPSILON
  );
}

export function isInsideRoom(item: FurnitureItem, room: Room): boolean {
  return getCorners(item).every(
    ({ x, z }) =>
      x >= -EPSILON &&
      z >= -EPSILON &&
      x <= room.width + EPSILON &&
      z <= room.depth + EPSILON,
  );
}

/** Conservative square around an inward door swing, not a building-code check. */
export function getDoorClearance(room: Room): PointXZ[] {
  return getDoorClearances(room)[0] ?? [];
}

export function getDoorClearances(room: Room): PointXZ[][] {
  return getRoomOpenings(room)
    .filter((opening) => opening.kind === 'door' && opening.swingDirection === 'inward')
    .map(({ wall, offset, width }) => {
      const x = wall === 'left' ? 0 : wall === 'right' ? room.width - width : offset,
        z = wall === 'front' ? room.depth - width : wall === 'back' ? 0 : offset;
      return [
        { x, z },
        { x: x + width, z },
        { x: x + width, z: z + width },
        { x, z: z + width },
      ];
    });
}

export function validatePlacement(
  item: FurnitureItem,
  room: Room,
  items: FurnitureItem[],
): string[] {
  if (!item.placed) return [];
  const warnings: string[] = [];
  const elevation = getItemElevation(item, room.height);
  if (!isInsideRoom(item, room))
    warnings.push('Extends beyond the room boundary');
  if (item.height > room.height + EPSILON)
    warnings.push('Taller than the room ceiling');
  else if (elevation + item.height > room.height + EPSILON)
    warnings.push('Extends above the room ceiling');
  const inwardDoors = getRoomOpenings(room)
    .filter((opening) => opening.kind === 'door' && opening.swingDirection === 'inward');
  if (
    item.type !== 'rug' &&
    getDoorClearances(room).some((clearance, index) => {
      const opening = inwardDoors[index]!;
      return verticallyOverlaps(item, { height: opening.height, elevationM: opening.sillHeight }, room.height) &&
        polygonOverlap(getCorners(item), clearance);
    })
  )
    warnings.push('Blocks the doorway clearance');
  if (item.type !== 'rug') {
    const floor: [number, number][] = [[0, 0], [room.width, 0], [room.width, room.depth], [0, room.depth]];
    for (const opening of getRoomOpenings(room)) {
      if (opening.openAngleDeg <= 0 ||
        !verticallyOverlaps(item, { height: opening.height, elevationM: opening.sillHeight }, room.height)) continue;
      const leaf = getOpeningLeaf(floor, roomOpeningToCanonical(room, opening));
      if (polygonOverlap(getCorners(item), leaf.footprint.map(([x, z]) => ({ x, z }))))
        warnings.push(`Blocks an open ${opening.kind}`);
    }
  }
  for (const other of items)
    if (overlaps(item, other, room.height)) warnings.push(`Overlaps ${other.name}`);
  return warnings;
}

export function getProjectWarnings(project: Project): ProjectWarning[] {
  return project.items.flatMap((item) =>
    validatePlacement(item, project.room, project.items).map((message) => ({
      itemId: item.id,
      message,
    })),
  );
}

export function snapPosition(
  value: number,
  enabled = true,
  step = 0.1,
): number {
  if (!enabled) return value;
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toFixed(4));
}

export function normalizeRotation(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function getRoomMetrics(project: Project) {
  const warnings = getProjectWarnings(project);
  const roomArea = project.room.width * project.room.depth;
  const occupied = project.items
    .filter((item) => item.placed && item.type !== 'rug' && getItemElevation(item, project.room.height) <= EPSILON)
    .reduce((sum, item) => sum + item.width * item.depth, 0);
  const invalidArea = warnings.some(
    (warning) =>
      warning.message.includes('Overlaps') ||
      warning.message.includes('boundary'),
  );
  return {
    roomArea,
    occupiedArea: invalidArea ? null : occupied,
    freeArea: invalidArea ? null : Math.max(0, roomArea - occupied),
    utilization: invalidArea ? null : occupied / roomArea,
    placedCount: project.items.filter((item) => item.placed).length,
    estimatedCount: project.items.filter((item) => item.source === 'estimated')
      .length,
  };
}
