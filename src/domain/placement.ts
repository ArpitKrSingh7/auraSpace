import type { FurnitureItem, Room } from './types';
import { getItemElevation, normalizeRotation } from './geometry';

export type PlacementAdjustment = Pick<FurnitureItem, 'rotation' | 'elevationM'>;
export type PlacementPose = { x: number; z: number; rotation: number; elevationM: number };
export type WallSide = Room['door']['wall'];
const clamp = (value: number, size: number, half: number) => half * 2 > size ? size / 2 : Math.max(half, Math.min(size - half, value));
const grid = (value: number, snap: boolean) => snap ? Math.round(value * 10) / 10 : value;

export function nearestWall(x: number, z: number, room: Room): WallSide {
  const distances: [WallSide, number][] = [['back', Math.abs(z)], ['front', Math.abs(room.depth - z)], ['left', Math.abs(x)], ['right', Math.abs(room.width - x)]];
  return distances.sort((a, b) => a[1] - b[1])[0][0];
}

export function attachToWall(item: FurnitureItem, room: Room, wall: WallSide, x: number, z: number, elevationM: number, snap: boolean): PlacementPose {
  const horizontal = wall === 'back' || wall === 'front';
  const along = clamp(grid(horizontal ? x : z, snap), horizontal ? room.width : room.depth, item.width / 2);
  const inset = Math.min(item.depth / 2, (horizontal ? room.depth : room.width) / 2);
  return {
    x: horizontal ? along : wall === 'left' ? inset : room.width - inset,
    z: horizontal ? wall === 'back' ? inset : room.depth - inset : along,
    rotation: {back: 0, front: 180, left: 270, right: 90}[wall],
    elevationM: Math.max(0, Math.min(Math.max(0, room.height - item.height), grid(elevationM, snap))),
  };
}

/** Snap first, constrain second: a second rounding pass can push items through a wall. */
export function placementPose(item: FurnitureItem, room: Room, x: number, z: number, snap: boolean, wall?: WallSide): PlacementPose {
  if (item.mounting === 'wall') return attachToWall(item, room, wall ?? nearestWall(x, z, room), x, z, item.elevationM ?? 0, snap);
  const angle = item.rotation * Math.PI / 180;
  const halfX = (Math.abs(Math.cos(angle)) * item.width + Math.abs(Math.sin(angle)) * item.depth) / 2;
  const halfZ = (Math.abs(Math.sin(angle)) * item.width + Math.abs(Math.cos(angle)) * item.depth) / 2;
  return {x: clamp(grid(x, snap), room.width, halfX), z: clamp(grid(z, snap), room.depth, halfZ),
    rotation: normalizeRotation(item.rotation), elevationM: getItemElevation(item, room.height)};
}

export function mountingPose(item: FurnitureItem, room: Room, mounting: FurnitureItem['mounting'], snap: boolean): FurnitureItem {
  const next = {...item, mounting, elevationM: mounting === 'floor' ? 0 : mounting === 'wall' ? Math.min(item.elevationM || 1.5, Math.max(0, room.height - item.height)) : 0};
  return {...next, ...placementPose(next, room, next.x, next.z, snap)};
}

export function wallFromRotation(rotation?: number): WallSide | undefined {
  return rotation === undefined ? undefined : ({0: 'back', 90: 'right', 180: 'front', 270: 'left'} as Record<number, WallSide>)[normalizeRotation(rotation)];
}
