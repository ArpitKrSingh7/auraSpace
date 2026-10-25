import { AppError, conflict, notFound } from '@auraspace/backend';
import {
  applyCommand,
  observationSchema,
  roomSceneSchema,
} from '@auraspace/scene-domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { asId, asIdSchema, json, type RouteContext } from '../route-context';
export function registerInventory(app: FastifyInstance, context: RouteContext) {
  const { config, db, media, queue, owned, data, jobDto } = context;
  app.patch('/v1/projects/:id/observations/:observationId', async (req) => {
    const p = await owned(asId((req.params as any).id), req.ownerId),
      scene = roomSceneSchema.parse(p.scene),
      o = scene.observations.find(
        (o) => o.id === asId((req.params as any).observationId),
      );
    if (!o) throw notFound();
    const body = z
      .object({
        expectedRevision: z.number().int(),
        observation: observationSchema,
      })
      .parse(req.body);
    if (body.expectedRevision !== p.revision || body.observation.id !== o.id)
      throw conflict();
    const result = applyCommand(scene, {
      type: 'observation',
      observation: body.observation,
    });
    if (!result.ok) throw new AppError('invalid-observation', result.message);
    const updated = await db.project.updateMany({
      where: { id: p.id, revision: p.revision },
      data: { scene: json(result.value), revision: result.value.revision },
    });
    if (!updated.count) throw conflict();
    return data({ revision: result.value.revision, scene: result.value });
  });
  app.post('/v1/projects/:id/items/merge', async (req) => {
    const p = await owned(asId((req.params as any).id), req.ownerId),
      body = z
        .object({
          expectedRevision: z.number().int(),
          keepId: asIdSchema(),
          removeIds: z.array(asIdSchema()).min(1).max(100),
        })
        .parse(req.body);
    if (p.revision !== body.expectedRevision) throw conflict();
    const result = applyCommand(roomSceneSchema.parse(p.scene), {
      type: 'merge',
      keepId: body.keepId,
      removeIds: body.removeIds,
    });
    if (!result.ok) throw new AppError('invalid-merge', result.message);
    const updated = await db.project.updateMany({
      where: { id: p.id, revision: p.revision },
      data: { scene: json(result.value), revision: result.value.revision },
    });
    if (!updated.count) throw conflict();
    return data({ scene: result.value, revision: result.value.revision });
  });
}
