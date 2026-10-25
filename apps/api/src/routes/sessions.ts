import { AppError, guestSession, tokenHash } from '@auraspace/backend';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type RouteContext } from '../route-context';
export function registerSessions(app: FastifyInstance, context: RouteContext) {
  const { config, db, media, queue, owned, data, jobDto } = context;
  app.post(
    '/v1/sessions/guest',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async () => data(await guestSession(db, config)),
  );
  app.post('/v1/sessions/link', async (req) => {
    if (!req.ownerId.startsWith('oidc:'))
      throw new AppError(
        'account-required',
        'Sign in to an account before linking a guest workspace.',
        403,
      );
    const { guestToken } = z
      .object({ guestToken: z.string().min(30).max(200) })
      .parse(req.body);
    const session = await db.session.findUnique({
      where: { tokenHash: tokenHash(guestToken) },
    });
    if (!session || session.expiresAt.getTime() < Date.now())
      throw new AppError(
        'session-expired',
        'The guest session is no longer available. Import your local rooms as new account projects.',
        401,
      );
    const transferred = await db.$transaction(async (tx) => {
      const result = await tx.project.updateMany({
        where: { ownerId: `guest:${session.id}`, deletedAt: null },
        data: { ownerId: req.ownerId },
      });
      await tx.session.delete({ where: { id: session.id } });
      return result.count;
    });
    return data({ linkedProjects: transferred });
  });
}
