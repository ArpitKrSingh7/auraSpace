import { referencedAssets } from './export';
import { newId } from './legacy/catalog';
import { clone } from './scene';
import { projectDocumentSchema, type ProjectDocument } from './schema';
/** A portable import or conflict copy must not reuse server-global capture/media IDs. */
export function forkDocument(
  input: ProjectDocument,
  name = `${input.name.slice(0, 85)} (copy)`,
) {
  const document = clone(input),
    assets = new Map(referencedAssets(input).map((id) => [id, newId('asset')])),
    captures = new Map(
      input.scene.captures.map((c) => [c.id, newId('capture')]),
    );
  document.id = newId('room');
  document.name = name;
  document.sample = false;
  document.createdAt = document.updatedAt = new Date().toISOString();
  for (const c of document.scene.captures) {
    c.id = captures.get(c.id)!;
    if (c.roomProposal?.multiView) {
      c.roomProposal.multiView.anchorPhotoId = captures.get(c.roomProposal.multiView.anchorPhotoId)!;
      for (const view of c.roomProposal.multiView.views) view.photoId = captures.get(view.photoId)!;
      for (const pose of c.roomProposal.furniture ?? [])
        if (pose.photoId) pose.photoId = captures.get(pose.photoId)!;
    }
    c.originalAssetId = assets.get(c.originalAssetId)!;
    c.analysisAssetId = c.analysisAssetId
      ? assets.get(c.analysisAssetId)
      : undefined;
    c.previewAssetId = c.previewAssetId
      ? assets.get(c.previewAssetId)
      : undefined;
    c.processingAssets = c.processingAssets?.map((a) => ({
      ...a,
      assetId: assets.get(a.assetId)!,
    }));
    c.jobId = undefined;
    c.error = undefined;
    if (['running', 'queued'].includes(c.status)) c.status = 'idle';
  }
  for (const o of document.scene.observations) {
    o.captureImageId = captures.get(o.captureImageId)!;
    o.thumbnailAssetId = o.thumbnailAssetId
      ? assets.get(o.thumbnailAssetId)
      : undefined;
    o.rawMaskAssetId = o.rawMaskAssetId
      ? assets.get(o.rawMaskAssetId)
      : undefined;
    o.mask.artifactId = o.mask.artifactId
      ? assets.get(o.mask.artifactId)
      : undefined;
  }
  for (const d of [
    document.scene.height,
    ...Object.values(document.scene.dimensionEvidence),
    ...document.scene.items.flatMap((i) => [i.width, i.depth, i.height]),
  ])
    d.evidenceIds = d.evidenceIds.map((id) => captures.get(id) ?? id);
  return { document: projectDocumentSchema.parse(document), assets, captures };
}
