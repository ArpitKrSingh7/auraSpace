import { makeItem } from '../domain/catalog';
import { getCorners, normalizeRotation, overlaps, validatePlacement } from '../domain/geometry';
import type { Detection, FurnitureItem, Project, Room } from '../domain/types';
import { validateItem, validateRoom } from '../domain/validation';

export interface PhotoLayoutOptions {
  selectedIds?: string[];
  widthM?: number;
  depthM?: number;
}

/** Keep detections on their source photo instead of mixing image coordinates. */
export function photoLayoutObservations(project: Project, photoId: string) {
  const anchor = project.photos.find((p) => p.id === photoId);
  if (!anchor) return [];
  const views = anchor.roomProposal?.multiView?.views;
  const fused = views?.some((v) => v.status === 'aligned') && !!anchor.roomProposal?.furniture?.length;
  const group = views ? project.photos.filter((p) => views.some((v) => v.photoId === p.id)) : [anchor];
  return group.flatMap((photo) => {
    const distinct = new Set(distinctPhotoDetections(photo.detections).map((d) => d.id));
    return photo.detections.map((detection) => ({
      photo, detection, key: `${photo.id}:${detection.id}`,
      defaultSelected: distinct.has(detection.id) && (fused ?
        !!anchor.roomProposal?.furniture?.some((pose) => (pose.photoId ?? photoId) === photo.id && detection.id === `det-${pose.detectionIndex}`) : photo.id === photoId),
      reference: views?.find((v) => v.photoId === photo.id)?.status === 'reference',
    }));
  });
}

/** Remove conflicting labels for the same large object, not separate objects. */
export function distinctPhotoDetections(detections: Detection[]): Detection[] {
  const kept: Detection[] = [];
  for (const detection of [...detections].sort((a, b) => b.score - a.score)) {
    const duplicate = detection.source !== 'manual' && kept.some((other) => {
      if (other.source === 'manual') return false;
      const [x, y, w, h] = detection.box, [a, b, c, d] = other.box;
      const intersection = Math.max(0, Math.min(x + w, a + c) - Math.max(x, a)) * Math.max(0, Math.min(y + h, b + d) - Math.max(y, b));
      const iou = intersection / (w * h + c * d - intersection);
      return detection.type === other.type ? iou > .85 :
        new Set([detection.type, other.type]).size === 2 &&
        [detection.type, other.type].every((type) => type === 'bed' || type === 'table') &&
        iou > .72 && other.score - detection.score > .15;
    });
    if (!duplicate) kept.push(detection);
  }
  return kept;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const ranges = {
  bed: { width: [.8, 2.2], depth: [1.85, 2.5], height: [.45, 1] },
  chair: { width: [.45, 1.1], depth: [.45, 1.1], height: [.8, 1.4] },
  table: { width: [.65, 2.5], depth: [.4, 1.2], height: [.55, 1.1] },
} as const;

function fitPosition(item: FurnitureItem, room: Room, obstacles: FurnitureItem[], target: { x: number; z: number }, preservePose = false) {
  let best: FurnitureItem | undefined, cost = Infinity;
  for (const angle of preservePose ? [] : [item.rotation, normalizeRotation(item.rotation + 90)]) {
    const atOrigin = { ...item, rotation: angle, x: 0, z: 0 };
    const corners = getCorners(atOrigin);
    const halfX = Math.max(...corners.map((p) => Math.abs(p.x)));
    const halfZ = Math.max(...corners.map((p) => Math.abs(p.z)));
    if (halfX * 2 > room.width || halfZ * 2 > room.depth) continue;
    const xs = [clamp(target.x, halfX, room.width - halfX)];
    const zs = [clamp(target.z, halfZ, room.depth - halfZ)];
    const step = Math.max(.12, Math.max(room.width, room.depth) / 35);
    for (let x = halfX + .025; x <= room.width - halfX; x += step) xs.push(x);
    for (let z = halfZ + .025; z <= room.depth - halfZ; z += step) zs.push(z);
    for (const x of xs) for (const z of zs) {
      const candidate = { ...item, x, z, rotation: angle };
      if (obstacles.some((other) => overlaps(candidate, other, room.height))) continue;
      const distance = ((x - target.x) / room.width) ** 2 + ((z - target.z) / room.depth) ** 2 + (angle === item.rotation ? 0 : .035);
      if (distance < cost) { best = candidate; cost = distance; }
    }
  }
  if (best) return best;
  const corners = getCorners({ ...item, x: 0, z: 0 });
  const halfX = Math.max(...corners.map((p) => Math.abs(p.x))), halfZ = Math.max(...corners.map((p) => Math.abs(p.z)));
  return { ...item, x: clamp(target.x, Math.min(halfX, room.width / 2), Math.max(room.width / 2, room.width - halfX)),
    z: clamp(target.z, Math.min(halfZ, room.depth / 2), Math.max(room.depth / 2, room.depth - halfZ)) };
}

/** A complete initial arrangement, with depth-projected poses where supported.
 * The image-only fallback is explicitly a composition guess, not reconstruction.
 */
export function buildPhotoLayout(project: Project, photoId: string, options: PhotoLayoutOptions = {}) {
  const photo = project.photos.find((p) => p.id === photoId);
  if (!photo) throw new Error('This room photo is no longer available.');
  for (const value of [options.widthM, options.depthM])
    if (value !== undefined && (!Number.isFinite(value) || value < 1 || value > 40)) throw new Error('Room width and length must be between 1 and 40 metres.');
  const proposal = photo.roomProposal;
  const fused = proposal?.multiView?.views.some((v) => v.status === 'aligned');
  const supported = proposal?.status === 'estimated' && proposal.source === 'model-estimated' && !!proposal.widthM && !!proposal.depthM;
  const keepSize = project.items.some((item) => item.placed);
  const keepWidth = keepSize || ['user-measured', 'product-specification'].includes(project.room.dimensionSources?.width ?? '');
  const keepDepth = keepSize || ['user-measured', 'product-specification'].includes(project.room.dimensionSources?.depth ?? '');
  const referenceWidth = options.widthM ?? (keepWidth ? project.room.width : undefined);
  const referenceDepth = options.depthM ?? (keepDepth ? project.room.depth : undefined);
  const scale = supported ? referenceWidth !== undefined ? referenceWidth / proposal!.widthM! : referenceDepth !== undefined ? referenceDepth / proposal!.depthM! : 1 : 1;
  const calibrated = supported && (referenceWidth !== undefined || referenceDepth !== undefined);
  const width = options.widthM ?? (supported && !keepWidth ? proposal!.widthM! * scale : project.room.width);
  const depth = options.depthM ?? (supported && !keepDepth ? proposal!.depthM! * scale : project.room.depth);
  const room = validateRoom({ ...project.room, width, depth,
    door: { ...project.room.door, width: Math.min(project.room.door.width, width, depth),
      offset: Math.min(project.room.door.offset, Math.max(0, (project.room.door.wall === 'front' || project.room.door.wall === 'back' ? width : depth) - project.room.door.width)) },
    dimensionSources: { ...project.room.dimensionSources,
      width: options.widthM !== undefined ? 'user-measured' : supported && !keepWidth ? calibrated ? 'calibrated-estimate' : 'model-estimated' : project.room.dimensionSources?.width ?? 'category-prior',
      depth: options.depthM !== undefined ? 'user-measured' : supported && !keepDepth ? calibrated ? 'calibrated-estimate' : 'model-estimated' : project.room.dimensionSources?.depth ?? 'category-prior' },
  });
  const observations = photoLayoutObservations(project, photoId);
  const selected = new Set(options.selectedIds ?? observations.filter((o) => o.defaultSelected).map((o) => o.key));
  const detections = observations.filter((o) => selected.has(o.key) || (o.photo.id === photoId && selected.has(o.detection.id)));
  if (!detections.length && observations.length) throw new Error('Select at least one item, or mark a missing item in the photo.');
  // A different view of this same room must not duplicate the previous draft.
  // Preserve intentional edits and manually added furniture across rebuilds.
  const retained = project.items.filter((item) => !item.photoId || item.locked || item.source === 'measured');
  const sx = supported ? width / proposal!.widthM! : 1, sz = supported ? depth / proposal!.depthM! : 1;
  const counts: Record<string, number> = {};
  const pending = detections.filter((o) => !retained.some((item) => item.photoId === o.photo.id && item.detectionId === o.detection.id)).map(({ detection, photo: sourcePhoto }) => {
    const pose = supported ? proposal!.furniture?.find((p) => detection.id === `det-${p.detectionIndex}` && (p.photoId ?? photoId) === sourcePhoto.id) : undefined;
    const item = makeItem(detection.type, { id: `${sourcePhoto.id}-${detection.id}`.slice(0, 128), photoId: sourcePhoto.id, detectionId: detection.id, placed: true,
      source: 'estimated', name: `${detection.type === 'table' ? 'Study table' : detection.type === 'bed' ? 'Bed' : detection.type === 'chair' ? 'Chair' : detection.label} ${counts[detection.type] = (counts[detection.type] ?? 0) + 1}`,
      ...(detection.color ? { color: detection.color } : {}),
      ...(detection.type === 'bed' ? { width: .95, depth: 2, height: .6 } : {}),
      ...(detection.type === 'table' || detection.type === 'desk' ? { width: 1.3, depth: .65, height: .75 } : {}),
    });
    let target = { x: (detection.box[0] + detection.box[2] / 2) / sourcePhoto.width * width,
      z: clamp((detection.box[1] + detection.box[3]) / sourcePhoto.height, .05, .95) * depth };
    if (pose) {
      const radians = pose.rotationDeg * Math.PI / 180;
      item.width = Math.hypot(Math.cos(radians) * pose.widthM * sx, Math.sin(radians) * pose.widthM * sz);
      item.depth = Math.hypot(Math.sin(radians) * pose.depthM * sx, Math.cos(radians) * pose.depthM * sz);
      item.height = pose.heightM * Math.sqrt(sx * sz);
      item.rotation = normalizeRotation(Math.atan2(Math.sin(radians) * sz, Math.cos(radians) * sx) * 180 / Math.PI);
      const snapped = normalizeRotation(Math.round(item.rotation / 90) * 90);
      if (!fused && Math.abs(Math.atan2(Math.sin((snapped - item.rotation) * Math.PI / 180), Math.cos((snapped - item.rotation) * Math.PI / 180))) < Math.PI / 6) item.rotation = snapped;
      target = { x: pose.centerXZ[0] * sx, z: pose.centerXZ[1] * sz };
      const range = ranges[detection.type as keyof typeof ranges];
      if (range) for (const axis of ['width', 'depth', 'height'] as const) item[axis] = clamp(item[axis], range[axis][0], range[axis][1]);
      const [bx, by, bw, bh] = detection.box;
      const cropped = bx < sourcePhoto.width * .015 || by < sourcePhoto.height * .015 || bx + bw > sourcePhoto.width * .985 || by + bh > sourcePhoto.height * .985;
      if (cropped && (item.type === 'table' || item.type === 'desk')) {
        // A clipped tabletop does not establish the full desk dimensions.
        item.width = 1.3; item.depth = .65; item.height = .75;
        if (Math.min(target.x, width - target.x) < width * .28) item.rotation = 90;
      }
    }
    return { item: validateItem(item), target, projected: !!pose };
  }).sort((a, b) => b.item.width * b.item.depth - a.item.width * a.item.depth);
  const items = [...retained], added: FurnitureItem[] = [];
  for (const { item, target, projected } of pending) {
    const placed = fitPosition(item, room, items.filter((i) => i.placed), target, !!fused && projected);
    items.push(placed); added.push(placed);
  }
  const warnings = added.flatMap((item) => validatePlacement(item, room, items).map((warning) => `${item.name}: ${warning}`));
  if (pending.some((p) => !p.projected)) warnings.unshift('Some positions follow the photo composition because reliable floor depth was unavailable. Check them in the planner.');
  return { room, items, added, warnings: [...new Set(warnings)], projectedCount: pending.filter((p) => p.projected).length };
}
