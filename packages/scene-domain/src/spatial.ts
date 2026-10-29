import { getCorners, getItemElevation, overlaps, pointInFootprint } from './legacy/geometry';
import { activeLayout, legacyItem } from './scene';
import type { Placement, PointXZ, RoomScene } from './schema';
import { getOpeningLeaf, getOpeningSettings } from './openings';
export const EPS = 1e-6;
export function polygonArea(points: PointXZ[]) {
  return (
    Math.abs(
      points.reduce(
        (sum, p, i) =>
          sum +
          p[0] * points[(i + 1) % points.length][1] -
          points[(i + 1) % points.length][0] * p[1],
        0,
      ),
    ) / 2
  );
}
const cross = (a: PointXZ, b: PointXZ, c: PointXZ) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function pointInPolygon(p: PointXZ, polygon: PointXZ[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i];
    if (
      Math.abs(cross(a, b, p)) < EPS &&
      p[0] >= Math.min(a[0], b[0]) - EPS &&
      p[0] <= Math.max(a[0], b[0]) + EPS &&
      p[1] >= Math.min(a[1], b[1]) - EPS &&
      p[1] <= Math.max(a[1], b[1]) + EPS
    )
      return true;
    if (
      b[1] > p[1] !== a[1] > p[1] &&
      p[0] < ((a[0] - b[0]) * (p[1] - b[1])) / (a[1] - b[1]) + b[0]
    )
      inside = !inside;
  }
  return inside;
}
export function segmentsCross(a: PointXZ, b: PointXZ, c: PointXZ, d: PointXZ) {
  return (
    cross(a, b, c) * cross(a, b, d) < -EPS &&
    cross(c, d, a) * cross(c, d, b) < -EPS
  );
}
export function footprintContained(corners: PointXZ[], boundary: PointXZ[]) {
  return (
    corners.every((p) => pointInPolygon(p, boundary)) &&
    corners.every((a, i) => {
      const b = corners[(i + 1) % corners.length];
      return (
        pointInPolygon([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], boundary) &&
        !boundary.some((c, j) =>
          segmentsCross(a, b, c, boundary[(j + 1) % boundary.length]),
        )
      );
    })
  );
}
export function openingClearance(
  scene: RoomScene,
): Array<{ id: string; polygon: PointXZ[] }> {
  const floor = scene.floorPolygonXZ;
  const winding =
    floor.reduce(
      (sum, p, i) =>
        sum +
        p[0] * floor[(i + 1) % floor.length][1] -
        floor[(i + 1) % floor.length][0] * p[1],
      0,
    ) >= 0
      ? 1
      : -1;
  return scene.openings
    .filter((o) => o.kind === 'door' && getOpeningSettings(o).swingDirection === 'inward')
    .map((o) => {
      const a = floor[o.wallIndex],
        b = floor[(o.wallIndex + 1) % floor.length],
        len = Math.hypot(b[0] - a[0], b[1] - a[1]),
        ux = (b[0] - a[0]) / len,
        uz = (b[1] - a[1]) / len,
        nx = -uz * winding,
        nz = ux * winding;
      const start: PointXZ = [a[0] + ux * o.offsetM, a[1] + uz * o.offsetM];
      return {
        id: o.id,
        polygon: [
          start,
          [start[0] + ux * o.widthM, start[1] + uz * o.widthM],
          [
            start[0] + ux * o.widthM + nx * o.widthM,
            start[1] + uz * o.widthM + nz * o.widthM,
          ],
          [start[0] + nx * o.widthM, start[1] + nz * o.widthM],
        ],
      };
    });
}
function polygonsOverlap(a: PointXZ[], b: PointXZ[]) {
  for (const p of [a, b])
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length],
        axis = [-(q[1] - p[i][1]), q[0] - p[i][0]];
      const aa = a.map((x) => x[0] * axis[0] + x[1] * axis[1]),
        bb = b.map((x) => x[0] * axis[0] + x[1] * axis[1]);
      if (
        Math.max(...aa) <= Math.min(...bb) + EPS ||
        Math.max(...bb) <= Math.min(...aa) + EPS
      )
        return false;
    }
  return true;
}
export function placementWarnings(
  scene: RoomScene,
  placement: Placement,
): string[] {
  const item = scene.items.find((i) => i.id === placement.physicalItemId);
  if (!item) return ['Furniture is missing'];
  const legacy = legacyItem(item, placement),
    elevation = getItemElevation(legacy, scene.height.meters),
    top = elevation + item.height.meters,
    corners = getCorners(legacy).map((p) => [p.x, p.z] as PointXZ),
    warnings: string[] = [];
  if (!footprintContained(corners, scene.floorPolygonXZ))
    warnings.push('Extends beyond the room boundary');
  if (item.height.meters > scene.height.meters + EPS)
    warnings.push('Taller than the ceiling');
  else if (top > scene.height.meters + EPS)
    warnings.push('Extends above the ceiling');
  if (
    item.category !== 'rug' &&
    openingClearance(scene).some((d) => {
      const opening = scene.openings.find((o) => o.id === d.id)!;
      return top > opening.sillHeightM + EPS &&
        elevation < opening.sillHeightM + opening.heightM - EPS &&
        polygonsOverlap(corners, d.polygon);
    })
  )
    warnings.push('Blocks a doorway clearance');
  if (item.category !== 'rug')
    for (const opening of scene.openings) {
      if ((opening.openAngleDeg ?? 0) <= 0 || top <= opening.sillHeightM + EPS ||
        elevation >= opening.sillHeightM + opening.heightM - EPS) continue;
      if (polygonsOverlap(corners, getOpeningLeaf(scene.floorPolygonXZ, opening).footprint))
        warnings.push(`Blocks an open ${opening.kind}`);
    }
  for (const other of activeLayout(scene).placements) {
    if (other.physicalItemId === item.id) continue;
    const oi = scene.items.find((i) => i.id === other.physicalItemId);
    if (oi && overlaps(legacy, legacyItem(oi, other), scene.height.meters))
      warnings.push(`Overlaps ${oi.name}`);
  }
  return warnings;
}
export function roomFeedback(scene: RoomScene) {
  const placements = activeLayout(scene).placements;
  const warnings = placements.flatMap((p) =>
    placementWarnings(scene, p).map((message) => ({
      itemId: p.physicalItemId,
      message,
    })),
  );
  const area = polygonArea(scene.floorPolygonXZ);
  const invalid = warnings.some(
    (w) => w.message.includes('Overlaps') || w.message.includes('boundary'),
  );
  const occupied = placements.reduce((sum, p) => {
    const i = scene.items.find((i) => i.id === p.physicalItemId)!;
    return sum + (i.category === 'rug' || getItemElevation(legacyItem(i), scene.height.meters) > EPS
      ? 0 : i.width.meters * i.depth.meters);
  }, 0);
  return {
    area,
    occupiedArea: invalid ? null : occupied,
    freeArea: invalid ? null : Math.max(0, area - occupied),
    warnings,
    estimatedCount: scene.items.filter((i) =>
      [i.width, i.depth, i.height].some(
        (d) => !['user-measured', 'product-specification'].includes(d.source),
      ),
    ).length,
  };
}
export function canStand(
  scene: RoomScene,
  x: number,
  z: number,
  margin = 0.18,
) {
  const boundary = scene.floorPolygonXZ;
  for (const p of [
    [x, z],
    [x - margin, z - margin],
    [x + margin, z - margin],
    [x + margin, z + margin],
    [x - margin, z + margin],
  ] as PointXZ[])
    if (!pointInPolygon(p, boundary)) return false;
  return !activeLayout(scene).placements.some((p) => {
    const i = scene.items.find((i) => i.id === p.physicalItemId)!;
    const item = legacyItem(i, p);
    // A bounded standing volume, rather than an infinitely tall floor footprint.
    return getItemElevation(item, scene.height.meters) < 1.8 - EPS &&
      pointInFootprint(x, z, item, margin);
  });
}
export function walkPathClear(
  scene: RoomScene,
  from: PointXZ,
  to: PointXZ,
  margin = 0.18,
) {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.05),
  );
  for (let i = 0; i <= steps; i++)
    if (
      !canStand(
        scene,
        from[0] + ((to[0] - from[0]) * i) / steps,
        from[1] + ((to[1] - from[1]) * i) / steps,
        margin,
      )
    )
      return false;
  return true;
}
/** Conservative raster BFS with no diagonal corner cutting. Width is a preference, not a code certification. */
export function circulation(
  scene: RoomScene,
  start: PointXZ,
  end: PointXZ,
  passageWidth = 0.7,
  step = 0.15,
) {
  if (
    !canStand(scene, start[0], start[1], passageWidth / 2) ||
    !canStand(scene, end[0], end[1], passageWidth / 2)
  )
    return {
      reachable: false,
      reason: 'The selected start or destination lacks this clearance.',
      path: [] as PointXZ[],
    };
  const xs = scene.floorPolygonXZ.map((p) => p[0]),
    zs = scene.floorPolygonXZ.map((p) => p[1]),
    minX = Math.min(...xs),
    minZ = Math.min(...zs);
  const w = Math.ceil((Math.max(...xs) - minX) / step) + 1,
    h = Math.ceil((Math.max(...zs) - minZ) / step) + 1;
  if (w * h > 100_000)
    return {
      reachable: false,
      reason: 'Choose a larger grid step for this room.',
      path: [] as PointXZ[],
    };
  const cell = (p: PointXZ) => [
    Math.round((p[0] - minX) / step),
    Math.round((p[1] - minZ) / step),
  ];
  const [a, b] = [cell(start), cell(end)],
    sid = a[1] * w + a[0],
    eid = b[1] * w + b[0];
  const prev = new Map<number, number>([[sid, -1]]),
    queue = [sid];
  let index = 0;
  while (index < queue.length) {
    const n = queue[index++];
    if (n === eid) {
      const path: PointXZ[] = [];
      for (let at = n; at !== -1; at = prev.get(at)!)
        path.push([minX + (at % w) * step, minZ + Math.floor(at / w) * step]);
      return {
        reachable: true,
        reason: 'Approximate route on a conservative grid.',
        path: path.reverse(),
      };
    }
    const x = n % w,
      z = Math.floor(n / w);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        id = nz * w + nx;
      if (
        nx < 0 ||
        nz < 0 ||
        nx >= w ||
        nz >= h ||
        prev.has(id) ||
        !canStand(scene, minX + nx * step, minZ + nz * step, passageWidth / 2)
      )
        continue;
      prev.set(id, n);
      queue.push(id);
    }
  }
  return {
    reachable: false,
    reason: 'No route at this passage width and grid resolution.',
    path: [] as PointXZ[],
  };
}
export function bresenham(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): PointXZ[] {
  const points: PointXZ[] = [],
    dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1,
    dy = -Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 10000; n++) {
    points.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e = 2 * err;
    if (e >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return points;
}
