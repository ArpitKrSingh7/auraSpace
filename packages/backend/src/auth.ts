import type { PrismaClient } from '@prisma/client';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Config } from './config';
import { AppError } from './errors';
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export function createAuthenticator(db: PrismaClient, config: Config) {
  const jwks = config.OIDC_JWKS_URL
    ? createRemoteJWKSet(new URL(config.OIDC_JWKS_URL))
    : null;
  return async (header?: string) => {
    const token = header?.match(/^Bearer ([^\s]+)$/)?.[1];
    if (!token)
      throw new AppError(
        'unauthorized',
        'Sign in or reconnect your guest workspace to continue.',
        401,
      );
    if (token.startsWith('guest_')) {
      const session = await db.session.findUnique({
        where: { tokenHash: tokenHash(token) },
      });
      if (!session || session.expiresAt.getTime() < Date.now())
        throw new AppError(
          'session-expired',
          'Your workspace session expired. Your offline rooms are safe.',
          401,
        );
      return `guest:${session.id}`;
    }
    if (!jwks || !config.OIDC_ISSUER || !config.OIDC_AUDIENCE)
      throw new AppError(
        'unauthorized',
        'This session is not accepted by this server.',
        401,
      );
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.OIDC_ISSUER,
        audience: config.OIDC_AUDIENCE,
        algorithms: ['RS256', 'ES256'],
      });
      if (!payload.sub) throw new Error('No subject');
      return `oidc:${payload.sub}`;
    } catch {
      throw new AppError(
        'unauthorized',
        'Your sign-in expired. Please sign in again.',
        401,
      );
    }
  };
}
export async function guestSession(db: PrismaClient, config: Config) {
  if (!config.ALLOW_GUEST_SESSIONS)
    throw new AppError(
      'guest-disabled',
      'Connect an account to sync. You can keep planning offline.',
      403,
    );
  const token = `guest_${randomBytes(32).toString('base64url')}`,
    expiresAt = new Date(Date.now() + 30 * 86400000);
  const session = await db.session.create({
    data: { id: randomUUID(), tokenHash: tokenHash(token), expiresAt },
  });
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    subject: `guest:${session.id}`,
  };
}
