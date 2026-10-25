import {
  jobResponseSchema,
  type AnalysisProposal,
  type JobRecord,
} from '@auraspace/contracts';
import {
  observationSchema,
  type Capture,
  type Observation,
} from '@auraspace/scene-domain';
import { newId } from '@auraspace/scene-domain/legacy/catalog';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { downloadArtifact, request } from '../../services/api';
import { useStudio } from '../../state/studio';
import { localDatabase, projectMedia } from '../../storage/database';
import {
  deleteMedia,
  persistMedia,
  persistRemoteMedia,
  resolveMedia,
} from '../../storage/media';
export async function importCapture(
  projectId: string,
  asset: {
    uri: string;
    width: number;
    height: number;
    fileName?: string | null;
    mimeType?: string | null;
  },
) {
  const doc = useStudio.getState().projects.find((p) => p.id === projectId);
  if (!doc) throw new Error('Open a room first.');
  if (doc.scene.captures.length >= 30)
    throw new Error(
      'This room already has 30 photos. Remove an unused photo first.',
    );
  if (asset.width * asset.height > 20_000_000)
    throw new Error('Choose a photo below 20 megapixels.');
  await useStudio.getState().flush();
  const id = newId('capture'),
    originalAssetId = newId('asset'),
    analysisAssetId = newId('asset');
  const source = await persistMedia(
    projectId,
    originalAssetId,
    asset.uri,
    asset.mimeType === 'image/png'
      ? 'image/png'
      : asset.mimeType === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg',
  );
  const existing = (await projectMedia(projectId)).find(
    (m) => m.id !== originalAssetId && m.sha256 === source.sha256,
  );
  if (existing) {
    await deleteMedia(originalAssetId);
    throw new Error(
      'This photograph is already in the room. Choose another viewpoint.',
    );
  }
  try {
    const context = ImageManipulator.manipulate(asset.uri),
      ref = await context.renderAsync();
    const width = ref.width,
      height = ref.height;
    const analysisContext = ImageManipulator.manipulate(asset.uri);
    if (Math.max(width, height) > 1280)
      analysisContext.resize(
        width >= height ? { width: 1280 } : { height: 1280 },
      );
    const result = await (
      await analysisContext.renderAsync()
    ).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    await persistMedia(projectId, analysisAssetId, result.uri, 'image/jpeg');
    const capture: Capture = {
      id,
      originalAssetId,
      analysisAssetId,
      name: (asset.fileName ?? 'Room photograph').slice(0, 180),
      width,
      height,
      createdAt: new Date().toISOString(),
      contentHash: source.sha256,
      qualityWarnings:
        Math.min(width, height) < 400
          ? ['A larger image may reveal more furniture detail.']
          : [],
      mapping: {
        scaleX: result.width / width,
        scaleY: result.height / height,
        offsetX: 0,
        offsetY: 0,
      },
      status: 'idle',
    };
    if (
      !useStudio.getState().execute(projectId, { type: 'add-capture', capture })
    )
      throw new Error('This photo could not be added. Your room is unchanged.');
    await useStudio.getState().flush();
    return capture.id;
  } catch (error) {
    const current = useStudio
      .getState()
      .projects.find((p) => p.id === projectId);
    if (!current?.scene.captures.some((c) => c.id === id)) {
      await deleteMedia(originalAssetId).catch(() => undefined);
      await deleteMedia(analysisAssetId).catch(() => undefined);
    }
    throw error;
  }
}
export function manualObservation(
  capture: Capture,
  name = 'Custom furniture',
): Observation {
  const x = Math.round(capture.width * 0.25),
    y = Math.round(capture.height * 0.35),
    w = Math.round(capture.width * 0.5),
    h = Math.round(capture.height * 0.5);
  return observationSchema.parse({
    id: newId('observation'),
    captureImageId: capture.id,
    originalLabel: name,
    category: 'custom',
    source: 'manual',
    coordinateSpace: 'oriented-source-image',
    boxPx: [x, y, w, h],
    mask: {
      revision: 0,
      polygons: [
        [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ],
      ],
      strokes: [],
      expansionPx: 0,
    },
    ignored: false,
    fixed: false,
    reviewed: false,
  });
}
export {
  queueProcessing as startProcessing,
  uploadCapture,
} from '../../services/job-operations';

export async function pollJob(id: string) {
  const job = jobResponseSchema.parse(await request(`/v1/jobs/${id}`));
  await (
    await localDatabase()
  ).runAsync('UPDATE jobs SET record=? WHERE id=?', JSON.stringify(job), id);
  return job;
}
export async function cancelProcessing(id: string) {
  return request(`/v1/jobs/${id}/cancel`, { method: 'POST' });
}
export async function acceptJob(projectId: string, job: JobRecord) {
  const proposals = (job.result as { proposals?: AnalysisProposal[] } | null)
    ?.proposals;
  if (!Array.isArray(proposals))
    throw new Error(
      'This result is not ready. Retry status or continue manually.',
    );
  for (const proposal of proposals) {
    const latest = useStudio
      .getState()
      .projects.find((p) => p.id === projectId);
    if (!latest?.scene.captures.some((c) => c.id === proposal.captureImageId))
      continue;
    for (const artifact of proposal.artifacts ?? []) {
      if (await resolveMedia(artifact.id)) continue;
      const remote = await downloadArtifact(artifact.id);
      const saved = await persistRemoteMedia(
        projectId,
        artifact.id,
        remote.bytes,
        remote.mimeType,
      );
      if (saved.sha256 !== artifact.sha256)
        throw new Error(
          'An analysis image did not download intact. Retry downloading this result.',
        );
    }
    for (const raw of proposal.observations ?? []) {
      const observation = observationSchema.parse(raw);
      if (
        latest.scene.observations.some(
          (o) => o.id === observation.id && o.reviewed,
        )
      )
        continue;
      useStudio
        .getState()
        .execute(projectId, { type: 'observation', observation });
    }
    const preview = proposal.artifacts?.find((a) => a.kind === 'preview');
    useStudio.getState().execute(projectId, {
      type: 'edit-capture',
      id: proposal.captureImageId,
      changes: {
        status: 'review',
        error: undefined,
        processingEvidence: {
          models: proposal.modelVersions ?? {},
          timingsMs: proposal.timings ?? {},
        },
        processingAssets: [
          ...(latest.scene.captures.find(
            (c) => c.id === proposal.captureImageId,
          )?.processingAssets ?? []),
          ...(proposal.artifacts ?? [])
            .filter((a) => a.kind === 'depth' || a.kind === 'processing')
            .map((a) => ({
              assetId: a.id,
              label:
                a.label ??
                (a.kind === 'depth'
                  ? 'Depth visualization'
                  : 'Processed image'),
              kind: a.kind as 'depth' | 'processing',
            })),
        ]
          .filter(
            (a, i, all) => all.findIndex((b) => b.assetId === a.assetId) === i,
          )
          .slice(-30),
        ...(preview ? { previewAssetId: preview.id } : {}),
        ...(proposal.roomEstimate
          ? {
              roomProposal: {
                floorCornersPx: proposal.roomEstimate.floorCornersPx ?? [],
                source: proposal.roomEstimate.source,
                warnings: proposal.roomEstimate.warnings,
              },
            }
          : {}),
        qualityWarnings: [
          ...new Set([
            ...(latest.scene.captures.find(
              (c) => c.id === proposal.captureImageId,
            )?.qualityWarnings ?? []),
            ...(proposal.warnings ?? []),
          ]),
        ].slice(0, 20),
      },
    });
  }
  await useStudio.getState().flush();
  await (
    await localDatabase()
  ).runAsync('UPDATE jobs SET handled=1 WHERE id=?', job.id);
}
