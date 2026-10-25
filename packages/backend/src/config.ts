import { z } from 'zod';
const boolean = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/).default('AuraSpace'),
  VISION_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  ALLOW_GUEST_SESSIONS: boolean,
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_AUDIENCE: z.string().optional(),
  OIDC_JWKS_URL: z.string().url().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  VISION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(600000)
    .default(180000),
});
export type Config = z.infer<typeof envSchema>;
export function configuration() {
  const result = envSchema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Server configuration is incomplete: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  return result.data;
}
