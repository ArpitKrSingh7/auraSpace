import { AppError, notFound } from '@auraspace/backend';
import { uploadSchema } from '@auraspace/contracts';
import { roomSceneSchema } from '@auraspace/scene-domain';
import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { asId, asIdSchema, type RouteContext } from '../route-context';
export function registerCaptures(app: FastifyInstance, context: RouteContext) {
  const { config, db, media, queue, owned, data, jobDto } = context;
  app.post('/v1/projects/:id/captures', async (req) => {
    const p = await owned(asId((req.params as any).id), req.ownerId);
    const { id } = z.object({ id: asIdSchema() }).parse(req.body);
    const scene = roomSceneSchema.parse(p.scene);
    if (!scene.captures.some((c) => c.id === id))
      throw new AppError(
        'capture-not-in-scene',
        'Save this photo in the room before uploading.',
      );
    const existing = await db.capture.findUnique({ where: { id } });
    if (existing && existing.projectId !== p.id) throw notFound();
    const created = await db.capture.upsert({
      where: { id },
      create: { id, projectId: p.id },
      update: {},
    });
    if (created.projectId !== p.id) throw notFound();
    return data(created);
  });
  app.post('/v1/captures/:id/uploads', async (req) => {
    const captureId = asId((req.params as any).id),
      body = uploadSchema.parse(req.body),
      capture = await db.capture.findUnique({ where: { id: captureId } });
    if (!capture) throw notFound();
    const p = await owned(capture.projectId, req.ownerId),
      scene = roomSceneSchema.parse(p.scene),
      source = scene.captures.find((c) => c.id === body.captureImageId);
    if (!source || source.id !== captureId) throw notFound();
    const artifactId = source.originalAssetId;
    const existing = await db.artifact.findUnique({
      where: { id: artifactId },
    });
    if (existing && existing.projectId !== p.id) throw notFound();
    if (existing?.ready) {
      if (existing.sha256 !== body.sha256)
        throw new AppError(
          'immutable-source',
          'Source photos are immutable. Add a new capture for a changed photograph.',
          409,
        );
      return data({ artifactId, ready: true });
    }
    if (
      existing &&
      (existing.sha256 !== body.sha256 ||
        existing.byteLength !== body.byteLength ||
        existing.mimeType !== body.mimeType)
    )
      throw new AppError(
        'immutable-source',
        'Add a new capture for a changed photograph.',
        409,
      );
    const uploadId = randomUUID(),
      expiresAt = new Date(Date.now() + 15 * 60000),
      key = `projects/${p.id}/sources/${artifactId}`;
    await db.$transaction(async (tx) => {
      await tx.artifact.upsert({
        where: { id: artifactId },
        create: {
          id: artifactId,
          projectId: p.id,
          kind: 'source',
          key,
          mimeType: body.mimeType,
          byteLength: body.byteLength,
          sha256: body.sha256,
        },
        update: {},
      });
      const artifact = await tx.artifact.findUniqueOrThrow({
        where: { id: artifactId },
      });
      if (
        artifact.projectId !== p.id ||
        artifact.sha256 !== body.sha256 ||
        artifact.byteLength !== body.byteLength ||
        artifact.mimeType !== body.mimeType
      )
        throw new AppError(
          'immutable-source',
          'Add a new capture for a changed photograph.',
          409,
        );
      await tx.upload.create({
        data: {
          id: uploadId,
          captureId,
          artifactId,
          expectedSha256: body.sha256,
          expectedBytes: body.byteLength,
          expiresAt,
        },
      });
    });
    return data({
      artifactId,
      uploadId,
      uploadPath: `/v1/uploads/${uploadId}`,
      expiresAt: expiresAt.toISOString(),
      ready: false,
    });
  });
  app.put('/v1/uploads/:id', { bodyLimit: 12_000_000 }, async (req) => {
    const upload = await db.upload.findUnique({
      where: { id: asId((req.params as any).id) },
      include: { artifact: true },
    });
    if (!upload) throw notFound();
    await owned(upload.artifact.projectId, req.ownerId);
    if (upload.completedAt)
      return data({ artifactId: upload.artifactId, ready: true });
    if (upload.expiresAt.getTime() < Date.now())
      throw new AppError(
        'upload-expired',
        'Request a fresh upload link and retry.',
        410,
        true,
      );
    const bytes = req.body;
    if (
      !Buffer.isBuffer(bytes) ||
      bytes.byteLength !== upload.expectedBytes ||
      createHash('sha256').update(bytes).digest('hex') !== upload.expectedSha256
    )
      throw new AppError(
        'upload-integrity',
        'This image did not arrive intact. Retry the upload.',
        400,
        true,
      );
    const mime = upload.artifact.mimeType,
      valid =
        mime === 'image/png'
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : mime === 'image/jpeg'
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : bytes.subarray(0, 4).toString() === 'RIFF' &&
              bytes.subarray(8, 12).toString() === 'WEBP';
    if (!valid)
      throw new AppError(
        'invalid-image',
        'This file does not contain the selected image type.',
      );
    await media.put(upload.artifact.key, bytes, mime);
    await db.$transaction([
      db.artifact.update({
        where: { id: upload.artifactId },
        data: { ready: true },
      }),
      db.upload.update({
        where: { id: upload.id },
        data: { completedAt: new Date() },
      }),
    ]);
    return data({ artifactId: upload.artifactId, ready: true });
  });
  app.post('/v1/captures/:id/finalize', async (req) => {
    const id = asId((req.params as any).id),
      c = await db.capture.findUnique({
        where: { id },
        include: { uploads: { include: { artifact: true } } },
      });
    if (!c) throw notFound();
    const p = await owned(c.projectId, req.ownerId),
      scene = roomSceneSchema.parse(p.scene),
      capture = scene.captures.find((c) => c.id === id);
    const source =
      capture &&
      (await db.artifact.findFirst({
        where: {
          id: capture.originalAssetId,
          projectId: p.id,
          ready: true,
          deletedAt: null,
        },
      }));
    if (!source)
      throw new AppError(
        'upload-incomplete',
        'Finish uploading the original photo before analysis.',
        409,
        true,
      );
    await db.capture.update({
      where: { id },
      data: { status: 'ready', finalizedAt: new Date() },
    });
    return data({ captureImageId: id, status: 'ready' });
  });
}
