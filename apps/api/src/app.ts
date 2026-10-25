import type { PrismaClient } from '@auraspace/backend';
import {
  AppError,
  MediaStore,
  configuration,
  createAuthenticator,
  createQueue,
  database,
  notFound,
  publicError,
  type Config,
} from '@auraspace/backend';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { registerArtifacts } from './routes/artifacts';
import { registerCaptures } from './routes/captures';
import { registerInventory } from './routes/inventory';
import { registerJobs } from './routes/jobs';
import { registerProjects } from './routes/projects';
import { registerSessions } from './routes/sessions';

declare module 'fastify' {
  interface FastifyRequest {
    ownerId: string;
  }
}
export function createApp(
  options: {
    config?: Config;
    db?: PrismaClient;
    media?: MediaStore;
    queue?: ReturnType<typeof createQueue>;
  } = {},
) {
  const config = options.config ?? configuration(),
    db = options.db ?? database,
    media = options.media ?? new MediaStore(config),
    queue = options.queue ?? createQueue(config.REDIS_URL);
  const app = Fastify({
    logger: {
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body',
        'res.headers.location',
      ],
    },
    bodyLimit: 24 * 1024 * 1024,
    requestIdHeader: false,
  });
  app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((v) => v.trim()),
    credentials: false,
  });
  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );
  const authenticate = createAuthenticator(db, config);
  app.decorateRequest('ownerId', '');
  app.addHook('preHandler', async (req) => {
    if (
      req.routeOptions.url === '/health' ||
      req.routeOptions.url === '/v1/sessions/guest'
    )
      return;
    req.ownerId = await authenticate(req.headers.authorization);
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        ok: false,
        error: {
          code: 'invalid-input',
          message: error.issues[0]?.message ?? 'Please check your input.',
          retryable: false,
          requestId: req.id,
        },
      });
      return;
    }
    if ((error as any).statusCode === 413) {
      reply.status(413).send({
        ok: false,
        error: {
          code: 'payload-too-large',
          message: 'Choose a smaller image or project file.',
          retryable: false,
          requestId: req.id,
        },
      });
      return;
    }
    const status = (error as any).statusCode;
    if (status >= 400 && status < 500) {
      reply.status(status).send({
        ok: false,
        error: {
          code: status === 429 ? 'rate-limited' : 'invalid-request',
          message:
            status === 429
              ? 'Too many requests. Wait a moment and retry.'
              : 'This request could not be read. Check the file or form and retry.',
          retryable: status === 429,
          requestId: req.id,
        },
      });
      return;
    }
    const safe = publicError(error);
    if (!(error instanceof AppError))
      req.log.error({ err: error, requestId: req.id }, 'Request failed');
    reply.status(safe.status).send({
      ok: false,
      error: {
        code: safe.code,
        message: safe.message,
        retryable: safe.retryable,
        requestId: req.id,
      },
    });
  });
  const owned = async (id: string, ownerId: string) => {
    const project = await db.project.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
    if (!project) throw notFound();
    return project;
  };
  const data = (v: unknown) => ({ ok: true, data: v });
  const jobDto = (job: any) => ({
    ...job,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    error: job.error ?? null,
    result: job.result ?? null,
    input: undefined,
    inputHash: undefined,
    idempotencyKey: undefined,
    cancelRequested: undefined,
  });
  app.get('/health', async () => {
    const databaseReady = await db.$queryRaw`SELECT 1`.then(
        () => true,
        () => false,
      ),
      queueReady = await Promise.race([
        queue.waitUntilReady().then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 2000),
        ),
      ]);
    return {
      ok: databaseReady && queueReady,
      services: { database: databaseReady, queue: queueReady },
      version: 2,
    };
  });
  registerSessions(app, { config, db, media, queue, owned, data, jobDto });
  registerProjects(app, { config, db, media, queue, owned, data, jobDto });
  registerCaptures(app, { config, db, media, queue, owned, data, jobDto });
  registerJobs(app, { config, db, media, queue, owned, data, jobDto });
  registerInventory(app, { config, db, media, queue, owned, data, jobDto });
  registerArtifacts(app, { config, db, media, queue, owned, data, jobDto });
  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({
      ok: false,
      error: {
        code: 'not-found',
        message: 'This address is not available.',
        retryable: false,
        requestId: req.id,
      },
    }),
  );
  app.addHook('onClose', async () => {
    if (!options.queue) await queue.close();
  });
  return { app, db, media, queue, config };
}
