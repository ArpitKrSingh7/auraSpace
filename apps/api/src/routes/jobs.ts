import { AppError, conflict, notFound } from '@auraspace/backend';
import { createJobSchema } from '@auraspace/contracts';
import { canonicalJson,roomSceneSchema } from '@auraspace/scene-domain';
import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { asId, json, type RouteContext } from '../route-context';
export function registerJobs(app: FastifyInstance, context: RouteContext) {
  const { config, db, media, queue, owned, data, jobDto } = context;
  app.post('/v1/projects/:id/jobs', async (req, reply) => {
    const p = await owned(asId((req.params as any).id), req.ownerId),
      input = createJobSchema.parse(req.body),
      scene = roomSceneSchema.parse(p.scene);
    const hash = createHash('sha256')
        .update(canonicalJson(input))
        .digest('hex'),
      existing = await db.job.findUnique({
        where: {
          projectId_idempotencyKey: {
            projectId: p.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
    if (existing) {
      if (existing.inputHash !== hash)
        throw new AppError(
          'idempotency-conflict',
          'Use a new request key for different analysis inputs.',
          409,
        );
      return data(jobDto(existing));
    }
    if (p.revision !== input.inputRevision) throw conflict();
    const captures = await db.capture.findMany({
      where: {
        id: { in: input.captureImageIds },
        projectId: p.id,
        status: 'ready',
      },
    });
    if (captures.length !== input.captureImageIds.length)
      throw new AppError(
        'capture-not-ready',
        'Upload and finalize each selected photo first.',
        409,
        true,
      );
    if (input.kind === 'inpaint') {
      const selected = scene.observations.filter((o) =>
        input.observationIds?.includes(o.id),
      );
      if (
        !selected.length ||
        selected.length !== new Set(input.observationIds).size ||
        selected.some(
          (o) =>
            o.fixed ||
            o.ignored ||
            !o.reviewed ||
            !input.captureImageIds.includes(o.captureImageId),
        )
      )
        throw new AppError(
          'invalid-removal-selection',
          'Select reviewed movable furniture for removal.',
        );
      for (const o of selected)
        if (input.maskRevisions?.[o.id] !== o.mask.revision)
          throw new AppError(
            'mask-revision-conflict',
            'The removal mask changed. Review it and retry.',
            409,
          );
    }
    const job = await db.job.upsert({
      where: {
        projectId_idempotencyKey: {
          projectId: p.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        id: randomUUID(),
        projectId: p.id,
        kind: input.kind,
        inputRevision: p.revision,
        input: json({ ...input, scene }),
        inputHash: hash,
        idempotencyKey: input.idempotencyKey,
      },
      update: {},
    });
    if (job.inputHash !== hash)
      throw new AppError(
        'idempotency-conflict',
        'Use a new request key for different inputs.',
        409,
      );
    try {
      await Promise.race([
        queue.add(input.kind, { jobId: job.id }, { jobId: job.id }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Queue connection timed out')),
            2000,
          ),
        ),
      ]);
    } catch {
      req.log.warn(
        { jobId: job.id },
        'Queue temporarily unavailable; persisted outbox will recover',
      );
    }
    reply.code(202);
    return data(jobDto(job));
  });
  app.get('/v1/jobs/:id', async (req) => {
    const job = await db.job.findUnique({
      where: { id: asId((req.params as any).id) },
    });
    if (!job) throw notFound();
    await owned(job.projectId, req.ownerId);
    return data(jobDto(job));
  });
  app.post('/v1/jobs/:id/cancel', async (req) => {
    const job = await db.job.findUnique({
      where: { id: asId((req.params as any).id) },
    });
    if (!job) throw notFound();
    await owned(job.projectId, req.ownerId);
    if (['complete', 'review', 'failed', 'cancelled'].includes(job.status))
      return data(jobDto(job));
    return data(
      jobDto(
        await db.job.update({
          where: { id: job.id },
          data: {
            cancelRequested: true,
            ...(job.status === 'queued' ? { status: 'cancelled' } : {}),
          },
        }),
      ),
    );
  });
}
