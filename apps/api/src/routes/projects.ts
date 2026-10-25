import { AppError, conflict } from '@auraspace/backend';
import { sceneWriteSchema } from '@auraspace/contracts';
import { projectDocumentSchema } from '@auraspace/scene-domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asId, json, type RouteContext } from '../route-context';
export function registerProjects(app: FastifyInstance, context: RouteContext) {
  const { config, db, media, queue, owned, data, jobDto } = context;
  app.get('/v1/projects', async (req) =>
    data(
      await db.project.findMany({
        where: { ownerId: req.ownerId, deletedAt: null },
        select: {
          id: true,
          name: true,
          revision: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    ),
  );
  app.post('/v1/projects', async (req, reply) => {
    const doc = projectDocumentSchema.parse(req.body);
    const existing = await db.project.findUnique({ where: { id: doc.id } });
    if (existing) {
      if (existing.ownerId !== req.ownerId || existing.deletedAt)
        throw new AppError(
          'id-conflict',
          'Import this room as a new copy before syncing.',
          409,
        );
      return data({ id: existing.id, revision: existing.revision });
    }
    const p = await db.project.upsert({
      where: { id: doc.id },
      create: {
        id: doc.id,
        ownerId: req.ownerId,
        name: doc.name,
        scene: json(doc.scene),
        revision: doc.scene.revision,
      },
      update: {},
    });
    if (p.ownerId !== req.ownerId || p.deletedAt)
      throw new AppError(
        'id-conflict',
        'Import this room as a new copy before syncing.',
        409,
      );
    reply.code(201);
    return data({ id: p.id, revision: p.revision });
  });
  app.get('/v1/projects/:id/scene', async (req) => {
    const p = await owned(asId((req.params as any).id), req.ownerId);
    return data({
      id: p.id,
      name: p.name,
      revision: p.revision,
      scene: p.scene,
    });
  });
  app.put('/v1/projects/:id/scene', async (req) => {
    const id = asId((req.params as any).id),
      body = sceneWriteSchema
        .extend({ name: z.string().trim().min(1).max(100).optional() })
        .parse(req.body),
      p = await owned(id, req.ownerId);
    if (p.revision !== body.expectedRevision) throw conflict();
    const scene = {
      ...body.scene,
      revision: Math.max(p.revision + 1, body.scene.revision),
    };
    const result = await db.project.updateMany({
      where: {
        id,
        ownerId: req.ownerId,
        revision: body.expectedRevision,
        deletedAt: null,
      },
      data: {
        scene: json(scene),
        revision: scene.revision,
        ...(body.name ? { name: body.name } : {}),
      },
    });
    if (result.count !== 1) throw conflict();
    return data({ revision: scene.revision, scene });
  });
  app.delete('/v1/projects/:id', async (req) => {
    const p = await owned(asId((req.params as any).id), req.ownerId);
    await db.$transaction([
      db.project.update({
        where: { id: p.id },
        data: { deletedAt: new Date() },
      }),
      db.job.updateMany({
        where: { projectId: p.id, status: { in: ['queued', 'running'] } },
        data: { cancelRequested: true },
      }),
      db.artifact.updateMany({
        where: { projectId: p.id },
        data: { deletedAt: new Date() },
      }),
    ]);
    return data({ deleted: true });
  });
}
