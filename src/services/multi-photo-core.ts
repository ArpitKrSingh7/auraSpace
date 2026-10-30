import type { Detection, Photo } from '../domain/types';
import { mapRoomProposalToSource } from './reconstruction-core';
import { parseDetections } from './vision-core';

/** Each observation keeps its own image coordinates; only world poses are fused. */
export function parseRoomViewsResponse(raw: Record<string, unknown>, photos: Photo[]) {
  const anchor = photos.find((p) => p.id === raw.anchor_photo_id);
  if (!anchor || !Array.isArray(raw.views)) throw new Error('The room draft has no source photo.');
  const updates = photos.map((photo) => {
    const view = (raw.views as Record<string, unknown>[]).find((v) => v.photo_id === photo.id);
    const size = view?.image_dimensions as { width: number; height: number } | undefined;
    if (!view || !size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || Math.min(size.width, size.height) <= 0)
      return { photoId: photo.id, detections: photo.detections, analyzed: false, size: { width: photo.width, height: photo.height } };
    const detections = parseDetections(view.detections, size.width, size.height).map((d): Detection => ({
      ...d, box: [d.box[0] * photo.width / size.width, d.box[1] * photo.height / size.height,
        d.box[2] * photo.width / size.width, d.box[3] * photo.height / size.height],
    }));
    return { photoId: photo.id, detections, analyzed: view.analyzed === true, size };
  });
  const roomProposal = mapRoomProposalToSource(raw.room_proposal, updates.find((u) => u.photoId === anchor.id)!.size, anchor);
  const group = roomProposal.multiView;
  if (!group || group.anchorPhotoId !== anchor.id || group.views.length !== photos.length ||
    new Set(group.views.map((v) => v.photoId)).size !== photos.length ||
    group.views.filter((v) => v.status === 'anchor').length !== 1 ||
    group.views.some((v) => !photos.some((p) => p.id === v.photoId) || (v.status === 'anchor' && v.photoId !== anchor.id)))
    throw new Error('The room draft has inconsistent photo references.');
  for (const pose of roomProposal.furniture ?? []) {
    const owner = pose.photoId ?? anchor.id;
    if (!group.views.some((v) => v.photoId === owner && v.status !== 'reference') ||
      !updates.find((u) => u.photoId === owner)?.detections.some((d) => d.id === `det-${pose.detectionIndex}`))
      throw new Error('A furniture position refers to a missing observation.');
  }
  return { anchorPhotoId: anchor.id, roomProposal, updates };
}
