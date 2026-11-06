import { Plane, Vector3, type Ray } from 'three';
import type { FurnitureItem, Room, ViewMode } from '../../domain/types';
import { attachToWall, placementPose, type WallSide } from '../../domain/placement';

export function wallPoint(ray: Ray, room: Room, wall: WallSide, inset = 0) {
  const horizontal = wall === 'back' || wall === 'front';
  const coordinate = wall === 'back' || wall === 'left' ? inset : (horizontal ? room.depth : room.width) - inset;
  return ray.intersectPlane(new Plane(new Vector3(horizontal ? 0 : 1, 0, horizontal ? 1 : 0), -coordinate), new Vector3());
}

export function placementFromRay(ray: Ray, item: FurnitureItem, room: Room, mode: ViewMode, snap: boolean) {
  if (item.mounting === 'wall' && mode !== 'plan') {
    const hits = (['back', 'front', 'left', 'right'] as WallSide[]).flatMap((wall) => {
      const p = wallPoint(ray, room, wall);
      return p && (mode !== 'overview' || (wall !== 'front' && wall !== 'right') || p.y <= .075) && p.x >= -.001 && p.x <= room.width + .001 && p.z >= -.001 && p.z <= room.depth + .001 && p.y >= 0 && p.y <= room.height
        ? [{wall, p, distance: ray.origin.distanceToSquared(p)}] : [];
    }).sort((a, b) => a.distance - b.distance);
    if (hits.length) {
      const {wall, p} = hits[0];
      return attachToWall(item, room, wall, p.x, p.z, p.y - item.height / 2, snap);
    }
  }
  // Plan places at floor coordinates; perspective ceiling placement follows
  // the ceiling plane instead of a displaced point on the floor beneath it.
  const elevation = item.mounting === 'ceiling' && mode !== 'plan' ? room.height : 0;
  const p = ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -elevation), new Vector3());
  if (!p || p.x < 0 || p.x > room.width || p.z < 0 || p.z > room.depth) return null;
  return placementPose(item, room, p.x, p.z, snap);
}
