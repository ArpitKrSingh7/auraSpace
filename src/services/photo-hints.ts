import { roomPhotoHintsSchema } from '../../packages/scene-domain/src/schema';
import { floorHomography } from '../../packages/scene-domain/src/calibration';
import type { Photo } from '../domain/types';

export function validatePhotoHints(input: unknown, size: { width: number; height: number }) {
  const hints = roomPhotoHintsSchema.parse(input);
  if (hints.floorRegionPx) {
    const points = hints.floorRegionPx;
    const fit = floorHomography(points, 1, 1);
    const area = Math.abs(points.reduce((sum, a, i) => {
      const b = points[(i + 1) % 4]; return sum + a[0] * b[1] - b[0] * a[1];
    }, 0)) / 2;
    if (!fit.ok || area < size.width * size.height * .005 || points.some(([x, y]) => x < 0 || y < 0 || x > size.width || y > size.height))
      throw new Error('Mark four corners around a clear floor patch, without crossing edges.');
  }
  return hints;
}

/** Hints always belong to normalized source pixels; resize both camera axes. */
export function scaledPhotoHints(photo: Photo, target: { width: number; height: number }) {
  if (!photo.analysisHints) return {};
  const hints = validatePhotoHints(photo.analysisHints, photo);
  const sx = target.width / photo.width, sy = target.height / photo.height;
  return {
    ...(hints.floorRegionPx ? { floor_region: hints.floorRegionPx.map(([x, y]) => [x * sx, y * sy]) } : {}),
    ...(hints.intrinsics ? { intrinsics: { fx: hints.intrinsics.fx * sx, fy: hints.intrinsics.fy * sy,
      cx: hints.intrinsics.cx * sx, cy: hints.intrinsics.cy * sy } } : {}),
  };
}
