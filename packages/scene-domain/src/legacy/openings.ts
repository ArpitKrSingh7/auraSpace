import { getOpeningSettings } from '../openings';
import type { Opening } from '../schema';
import type { Room, RoomOpening } from './types';

const cleanOffset = (value: number) => Math.abs(value) < 1e-9 ? 0 : value;

/** Only missing openings fall back to the original single-door format. */
export function getRoomOpenings(room: Room): RoomOpening[] {
  if (room.openings !== undefined) return room.openings;
  return [{
    id: 'legacy-door',
    kind: 'door',
    ...room.door,
    height: Math.min(2.1, room.height),
    sillHeight: 0,
    hingeSide: 'start',
    swingDirection: 'inward',
    openAngleDeg: 0,
  }];
}

/** Canonical edges follow polygon order; legacy wall offsets follow +x/+z. */
export function roomOpeningToCanonical(
  room: Pick<Room, 'width' | 'depth'>,
  opening: RoomOpening,
): Opening {
  const reversed = opening.wall === 'front' || opening.wall === 'left',
    wallLength = opening.wall === 'front' || opening.wall === 'back' ? room.width : room.depth,
    hingeSide = reversed
      ? opening.hingeSide === 'start' ? 'end' : 'start'
      : opening.hingeSide;
  return {
    id: opening.id,
    kind: opening.kind,
    wallIndex: ({ back: 0, right: 1, front: 2, left: 3 } as const)[opening.wall],
    offsetM: cleanOffset(reversed ? wallLength - opening.offset - opening.width : opening.offset),
    widthM: opening.width,
    heightM: opening.height,
    sillHeightM: opening.sillHeight,
    source: 'placeholder',
    hingeSide,
    swingDirection: opening.swingDirection,
    openAngleDeg: opening.openAngleDeg,
    ...(opening.kind === 'door' ? {
      doorSwing: opening.swingDirection === 'outward' ? 'outward' as const :
        hingeSide === 'start' ? 'inward-start' as const : 'inward-end' as const,
    } : {}),
  };
}

/** Rectangular projection also supports reversed winding and translated rooms. */
export function canonicalOpeningToRoom(
  floor: ReadonlyArray<readonly [number, number]>,
  opening: Opening,
): RoomOpening {
  const minX = Math.min(...floor.map((p) => p[0])),
    maxX = Math.max(...floor.map((p) => p[0])),
    minZ = Math.min(...floor.map((p) => p[1])),
    maxZ = Math.max(...floor.map((p) => p[1])),
    a = floor[opening.wallIndex],
    b = floor[(opening.wallIndex + 1) % floor.length],
    settings = getOpeningSettings(opening),
    horizontal = Math.abs(b[1] - a[1]) < 1e-6,
    wall: RoomOpening['wall'] = horizontal
      ? Math.abs(a[1] - minZ) <= Math.abs(a[1] - maxZ) ? 'back' : 'front'
      : Math.abs(a[0] - minX) <= Math.abs(a[0] - maxX) ? 'left' : 'right',
    increasing = horizontal ? b[0] > a[0] : b[1] > a[1],
    edgeStart = horizontal ? a[0] - minX : a[1] - minZ;
  return {
    id: opening.id,
    kind: opening.kind,
    wall,
    offset: cleanOffset(increasing ? edgeStart + opening.offsetM : edgeStart - opening.offsetM - opening.widthM),
    width: opening.widthM,
    height: opening.heightM,
    sillHeight: opening.sillHeightM,
    hingeSide: increasing ? settings.hingeSide : settings.hingeSide === 'start' ? 'end' : 'start',
    swingDirection: settings.swingDirection,
    openAngleDeg: settings.openAngleDeg,
  };
}
