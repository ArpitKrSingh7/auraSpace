import {
  AppError,
  configuration,
  database,
  MediaStore,
  type Config,
} from '@auraspace/backend';
import type { AnalysisProposal, CreateJob } from '@auraspace/contracts';
import {
  roomSceneSchema,
  roomReconstructionImageIssues,
  roomReconstructionProposalSchema,
  type Observation,
  type RoomReconstructionProposal,
  type RoomScene,
} from '@auraspace/scene-domain';
import { createHash } from 'node:crypto';

export class Cancelled extends Error {}
/** Malformed geometry must never turn into an accepted room or lose source-image coordinates. */
export function validatedRoomProposal(raw: unknown, width: number, height: number): RoomReconstructionProposal {
  const parsed = roomReconstructionProposalSchema.safeParse(raw);
  if (parsed.success && raw && typeof raw === 'object' && 'status' in raw &&
    parsed.data.source !== 'placeholder' && !roomReconstructionImageIssues(parsed.data, width, height).length)
    return parsed.data;
  return {
    status: 'insufficient-evidence', source: 'unavailable', method: 'invalid-or-missing-room-proposal',
    partial: true, confidence: 'low', floorCornersPx: [],
    warnings: ['Room geometry could not be validated. Analyze another view or enter measured room dimensions.'],
  };
}
export function makeProcessor(
  config: Config = configuration(),
  db = database,
  media = new MediaStore(config),
) {
  const check = async (id: string) => {
    const current = await db.job.findUnique({
      where: { id },
      include: { project: true },
    });
    if (!current || current.cancelRequested || current.project.deletedAt)
      throw new Cancelled();
    return current;
  };
  const stage = async (id: string, name: string, completed: string[]) => {
    await check(id);
    await db.job.update({
      where: { id },
      data: { status: 'running', stage: name, completedStages: completed },
    });
  };
  const artifact = async (
    projectId: string,
    jobId: string,
    kind: string,
    uri: string,
    index: string,
  ) => {
    await check(jobId);
    const match = uri.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/,
    );
    if (!match) throw new Error('Invalid image artifact');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 20_000_000)
      throw new Error('Image artifact is too large');
    const sha256 = createHash('sha256').update(bytes).digest('hex'),
      id = `artifact-${createHash('sha256').update(`${jobId}:${kind}:${index}:${sha256}`).digest('hex').slice(0, 40)}`,
      key = `projects/${projectId}/jobs/${jobId}/${id}`;
    await media.put(key, bytes, match[1]);
    return db.artifact.upsert({
      where: { id },
      create: {
        id,
        projectId,
        kind,
        key,
        mimeType: match[1],
        byteLength: bytes.length,
        sha256,
        ready: true,
      },
      update: { ready: true },
    });
  };
  const call = async (operation: string, body: unknown, requestId: string) => {
    const response = await fetch(
      new URL(
        operation,
        config.VISION_SERVICE_URL.endsWith('/')
          ? config.VISION_SERVICE_URL
          : `${config.VISION_SERVICE_URL}/`,
      ),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.VISION_TIMEOUT_MS),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload)
      throw new AppError(
        'vision-unavailable',
        response.status === 400
          ? 'This photo or selection could not be processed. Review it and retry.'
          : 'Analysis is temporarily unavailable. Retry or continue manually.',
        503,
        true,
      );
    return payload;
  };
  return async (jobId: string, attempt: number) => {
    const job = await check(jobId);
    if (['complete', 'review', 'cancelled'].includes(job.status)) return;
    const input = job.input as unknown as CreateJob & { scene: RoomScene };
    const scene = roomSceneSchema.parse(input.scene),
      completed: string[] = [],
      results: AnalysisProposal[] = [];
    await db.job.update({
      where: { id: job.id },
      data: { attempt, status: 'running', error: null },
    });
    await stage(job.id, 'validation', completed);
    for (const captureId of input.captureImageIds) {
      await check(job.id);
      const capture = scene.captures.find((c) => c.id === captureId);
      if (!capture) throw new Error('Capture is missing');
      const source = await db.artifact.findFirst({
        where: {
          id: capture.originalAssetId,
          projectId: job.projectId,
          ready: true,
          deletedAt: null,
        },
      });
      if (!source)
        throw new AppError(
          'missing-source',
          'Upload the original photo again before retrying.',
          409,
        );
      const bytes = await media.get(source.key);
      if (
        bytes.length !== source.byteLength ||
        createHash('sha256').update(bytes).digest('hex') !== source.sha256
      )
        throw new Error('Stored image integrity failed');
      const image = `data:${source.mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
      const validation = await call('validate', { image }, job.id);
      if (
        validation.image_dimensions.width !== capture.width ||
        validation.image_dimensions.height !== capture.height
      )
        throw new AppError(
          'image-coordinates',
          'Photo orientation or dimensions changed. Import this image again before processing.',
          400,
        );
      if (input.kind === 'process') {
        await stage(job.id, 'image-processing', ['validation']);
        const response = await call(
            'process',
            { image, operation: input.operation },
            job.id,
          ),
          a = await artifact(
            job.projectId,
            job.id,
            'processing',
            response.uri,
            `${captureId}:${input.operation}`,
          );
        results.push({
          captureImageId: captureId,
          inputRevision: job.inputRevision,
          observations: [],
          artifacts: [
            {
              id: a.id,
              mimeType: a.mimeType,
              byteLength: a.byteLength,
              sha256: a.sha256,
              kind: 'processing',
              label: input.operation,
            },
          ],
          warnings: [
            'Processed image is an inspection aid. Your original photograph remains unchanged.',
          ],
          modelVersions: { processing: `OpenCV ${input.operation}` },
          timings: {},
        });
      } else if (input.kind === 'analyze') {
        await stage(job.id, 'furniture-observations', ['validation']);
        const response = await call(
            'analyze',
            { image, include_depth: input.includeDepth, include_room: true },
            job.id,
          ),
          observations: Observation[] = [],
          artifacts = [];
        for (
          let index = 0;
          index < (response.detections?.length ?? 0);
          index++
        ) {
          const raw = response.detections[index],
            box = Array.isArray(raw.box)
              ? raw.box
              : [
                  raw.box.x1,
                  raw.box.y1,
                  raw.box.x2 - raw.box.x1,
                  raw.box.y2 - raw.box.y1,
                ];
          const category =
            (
              {
                couch: 'sofa',
                sofa: 'sofa',
                chair: 'chair',
                bed: 'bed',
                'dining table': 'table',
                'potted plant': 'plant',
                refrigerator: 'fridge',
              } as Record<string, Observation['category']>
            )[raw.label] ?? 'custom';
          const oid = `obs-${createHash('sha256').update(`${job.id}:${captureId}:${index}`).digest('hex').slice(0, 36)}`;
          let rawMaskId: string | undefined;
          if (raw.raw_mask_uri) {
            const a = await artifact(
              job.projectId,
              job.id,
              'mask',
              raw.raw_mask_uri,
              `${oid}:raw`,
            );
            rawMaskId = a.id;
            artifacts.push(a);
          }
          let maskId: string | undefined, thumbnailId: string | undefined;
          if (raw.mask_uri) {
            const a = await artifact(
              job.projectId,
              job.id,
              'mask',
              raw.mask_uri,
              oid,
            );
            maskId = a.id;
            artifacts.push(a);
          }
          if (raw.thumbnail_uri) {
            const a = await artifact(
              job.projectId,
              job.id,
              'thumbnail',
              raw.thumbnail_uri,
              oid,
            );
            thumbnailId = a.id;
            artifacts.push(a);
          }
          observations.push({
            id: oid,
            captureImageId: captureId,
            originalLabel: raw.label,
            category,
            score: raw.score,
            modelVersion:
              response.model_versions?.detection ??
              'torchvision-maskrcnn-resnet50-fpn-v2',
            source: 'model',
            coordinateSpace: 'oriented-source-image',
            boxPx: box,
            mask: {
              revision: 0,
              artifactId: maskId,
              polygons: raw.mask_polygon?.length >= 3 ? [raw.mask_polygon] : [],
              strokes: [],
              expansionPx: 0,
            },
            thumbnailAssetId: thumbnailId,
            rawMaskAssetId: rawMaskId,
            color: raw.color,
            ignored: false,
            fixed: false,
            reviewed: false,
          });
        }
        if (response.depth_map) {
          artifacts.push({
            ...(await artifact(
              job.projectId,
              job.id,
              'depth',
              response.depth_map,
              captureId,
            )),
            label: 'Depth visualization',
          });
        }
        if (response.depth_raw) {
          artifacts.push({
            ...(await artifact(
              job.projectId,
              job.id,
              'depth',
              response.depth_raw,
              `${captureId}:raw`,
            )),
            label: 'Raw depth · 16-bit millimeters',
          });
        }
        await stage(job.id, 'room-draft', [
          'validation',
          'furniture-observations',
        ]);
        results.push({
          captureImageId: captureId,
          inputRevision: job.inputRevision,
          observations,
          roomEstimate: validatedRoomProposal(response.room_proposal, capture.width, capture.height),
          artifacts: artifacts.map((a) => ({
            id: a.id,
            mimeType: a.mimeType,
            byteLength: a.byteLength,
            sha256: a.sha256,
            kind: a.kind as any,
            label: ('label' in a ? a.label : undefined) as string | undefined,
          })),
          warnings: [
            ...(validation.quality_warnings ?? []),
            ...(response.warnings ?? []),
          ],
          modelVersions: response.model_versions ?? {},
          timings: { processingMs: response.processing_time_ms ?? 0 },
        });
      } else {
        await stage(job.id, 'removal', ['validation']);
        const selected = scene.observations.filter(
          (o) =>
            o.captureImageId === captureId &&
            input.observationIds?.includes(o.id) &&
            !o.fixed &&
            !o.ignored,
        );
        if (!selected.length) continue;
        for (const observation of selected)
          if (
            input.maskRevisions?.[observation.id] !== observation.mask.revision
          )
            throw new AppError(
              'stale-mask',
              'Review the latest mask before generating a preview.',
              409,
            );
        const response = await call(
          'inpaint',
          {
            image,
            boxes: [],
            masks: selected.map((o) => ({ ...o.mask, box: o.boxPx })),
            method: 'auto',
            prefer_lama: true,
          },
          job.id,
        );
        const a = await artifact(
          job.projectId,
          job.id,
          'preview',
          response.uri,
          captureId,
        );
        results.push({
          captureImageId: captureId,
          inputRevision: job.inputRevision,
          observations: [],
          artifacts: [
            {
              id: a.id,
              mimeType: a.mimeType,
              byteLength: a.byteLength,
              sha256: a.sha256,
              kind: 'preview',
            },
          ],
          warnings: response.warnings ?? [],
          modelVersions: { inpainting: response.method },
          timings: {},
        });
      }
    }
    await check(job.id);
    await db.job.update({
      where: { id: job.id },
      data: {
        status: 'review',
        stage: 'complete',
        completedStages:
          input.kind === 'analyze'
            ? ['validation', 'furniture-observations', 'room-draft']
            : input.kind === 'process'
              ? ['validation', 'image-processing']
              : ['validation', 'removal'],
        result: JSON.parse(
          JSON.stringify({
            proposals: results,
            inputRevision: job.inputRevision,
          }),
        ),
        error: null,
      },
    });
  };
}
