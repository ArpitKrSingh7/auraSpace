import type { Opening, PointXZ } from './schema';

/** New fields take precedence while older documents retain their swing setting. */
export function getOpeningSettings(opening: Opening) {
  return {
    hingeSide: opening.hingeSide ??
      (opening.doorSwing === 'inward-end' ? 'end' : 'start'),
    swingDirection: opening.swingDirection ??
      (opening.doorSwing === 'outward' ? 'outward' : 'inward'),
    openAngleDeg: opening.openAngleDeg ?? 0,
  } as const;
}

/** A hinged leaf in x/z coordinates, with a Three-compatible yaw about +y. */
export function getOpeningLeaf(
  floorPolygonXZ: ReadonlyArray<readonly [number, number]>,
  opening: Opening,
) {
  const a = floorPolygonXZ[opening.wallIndex],
    b = floorPolygonXZ[(opening.wallIndex + 1) % floorPolygonXZ.length];
  if (!a || !b) throw new Error('Opening refers to a missing wall');
  const wallLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (wallLength < 1e-9) throw new Error('Opening wall has no length');
  const ux = (b[0] - a[0]) / wallLength,
    uz = (b[1] - a[1]) / wallLength,
    settings = getOpeningSettings(opening),
    winding = floorPolygonXZ.reduce((sum, p, index) => {
      const q = floorPolygonXZ[(index + 1) % floorPolygonXZ.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) >= 0 ? 1 : -1,
    closedStart: PointXZ = [a[0] + ux * opening.offsetM, a[1] + uz * opening.offsetM],
    closedEnd: PointXZ = [closedStart[0] + ux * opening.widthM, closedStart[1] + uz * opening.widthM],
    hinge: PointXZ = settings.hingeSide === 'start' ? closedStart : closedEnd,
    side = settings.hingeSide === 'start' ? 1 : -1,
    angle = settings.openAngleDeg * Math.PI / 180 * winding * side *
      (settings.swingDirection === 'inward' ? 1 : -1),
    dx = side * (ux * Math.cos(angle) - uz * Math.sin(angle)),
    dz = side * (ux * Math.sin(angle) + uz * Math.cos(angle)),
    end: PointXZ = [hinge[0] + dx * opening.widthM, hinge[1] + dz * opening.widthM],
    center: PointXZ = [(hinge[0] + end[0]) / 2, (hinge[1] + end[1]) / 2],
    thicknessM = 0.04,
    halfX = -dz * thicknessM / 2,
    halfZ = dx * thicknessM / 2,
    footprint: PointXZ[] = [
      [hinge[0] + halfX, hinge[1] + halfZ],
      [end[0] + halfX, end[1] + halfZ],
      [end[0] - halfX, end[1] - halfZ],
      [hinge[0] - halfX, hinge[1] - halfZ],
    ];
  return {
    ...settings,
    hinge,
    end,
    center,
    closedStart,
    closedEnd,
    // In plan, positive clockwise rotation corresponds to negative yaw.
    yawRad: -Math.atan2(dz, dx),
    widthM: opening.widthM,
    heightM: opening.heightM,
    sillHeightM: opening.sillHeightM,
    thicknessM,
    footprint,
  };
}
