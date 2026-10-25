import { AppError, notFound } from '@auraspace/backend';
import type { FastifyInstance } from 'fastify';
import { asId, type RouteContext } from '../route-context';
export function registerArtifacts(app: FastifyInstance, context: RouteContext) {
  const { config, db, media, queue, owned, data, jobDto } = context;
  app.get('/v1/artifacts/:id/access', async (req) => {
    const artifact = await db.artifact.findFirst({
      where: { id: asId((req.params as any).id), ready: true, deletedAt: null },
    });
    if (!artifact) throw notFound();
    await owned(artifact.projectId, req.ownerId);
    return data({
      id: artifact.id,
      url: await media.access(artifact.key),
      expiresIn: 300,
      mimeType: artifact.mimeType,
      sha256: artifact.sha256,
      byteLength: artifact.byteLength,
    });
  });
  app.get('/v1/artifacts/:id/content', async (req, reply) => {
    const a = await db.artifact.findFirst({
      where: { id: asId((req.params as any).id), ready: true, deletedAt: null },
    });
    if (!a) throw notFound();
    await owned(a.projectId, req.ownerId);
    reply.header('Cache-Control', 'private, no-store').type(a.mimeType);
    return Buffer.from(await media.get(a.key));
  });
  app.delete('/v1/artifacts/:id', async (req) => {
    const a = await db.artifact.findFirst({
      where: { id: asId((req.params as any).id), deletedAt: null },
    });
    if (!a) throw notFound();
    await owned(a.projectId, req.ownerId);
    if (a.kind === 'source')
      throw new AppError(
        'source-in-use',
        'Remove the capture or project before deleting its original photo.',
        409,
      );
    await db.artifact.update({
      where: { id: a.id },
      data: { deletedAt: new Date() },
    });
    await media.delete(a.key);
    return data({ deleted: true });
  });
}
