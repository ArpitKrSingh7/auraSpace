import { newId } from '../domain/catalog';
import type { Detection, FurnitureItem, Photo } from '../domain/types';

function overlap(a: Detection, b: Detection) {
  const [x, y, w, h] = a.box, [u, v, s, t] = b.box;
  const intersection = Math.max(0, Math.min(x + w, u + s) - Math.max(x, u)) *
    Math.max(0, Math.min(y + h, v + t) - Math.max(y, v));
  return intersection / (w * h + s * t - intersection);
}

/** Conservative same-image association. Ambiguous matches receive fresh IDs;
 * model ordering is never evidence of physical identity. Manual corrections win.
 */
export function reconcileDetections(previous: Detection[], incoming: Detection[]): Detection[] {
  const fresh = incoming.filter((d) => d.source === 'model');
  const scores = fresh.map((d) => previous.map((p) => {
    const iou = overlap(d, p);
    return (p.source === 'manual' ? iou >= .8 : p.type === d.type && iou >= .6) ? iou : 0;
  }));
  const used = new Set<number>();
  const result: Detection[] = [];
  fresh.forEach((d, i) => {
    const row = scores[i];
    const best = Math.max(0, ...row), j = row.indexOf(best);
    const unambiguous = best > 0 && !used.has(j) &&
      row.every((score, k) => k === j || best - score >= .15) &&
      scores.every((other, k) => k === i || best - other[j] >= .15);
    if (unambiguous) {
      used.add(j);
      if (previous[j].source === 'manual') return;
      result.push({ ...d, id: previous[j].id });
    } else result.push({ ...d, id: previous.length ? newId('observation') : d.id });
  });
  const manual = previous.filter((d) => d.source === 'manual');
  // Always retain reviewed observations, within the editor's 100-item limit.
  return [...result.slice(0, Math.max(0, 100 - manual.length)), ...manual];
}

/** A missed observation must not invalidate exports, saved layouts or undo. */
export function repairObservationReferences(items: FurnitureItem[], photo: Photo): FurnitureItem[] {
  const ids = new Set(photo.detections.map((d) => d.id));
  return items.map((item) => item.photoId === photo.id && item.detectionId && !ids.has(item.detectionId)
    ? { ...item, detectionId: undefined, edited: true } : item);
}
