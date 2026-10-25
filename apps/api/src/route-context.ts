import type {
  Config,
  MediaStore,
  PrismaClient,
  createQueue,
} from '@auraspace/backend';
import { z } from 'zod';
export const asIdSchema = () =>
  z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_.:-]+$/);
export const asId = (value: unknown) => asIdSchema().parse(value);
export const json = (value: unknown) => JSON.parse(JSON.stringify(value));
export interface RouteContext {
  config: Config;
  db: PrismaClient;
  media: MediaStore;
  queue: ReturnType<typeof createQueue>;
  owned: (
    id: string,
    ownerId: string,
  ) => Promise<
    Awaited<ReturnType<PrismaClient['project']['findFirstOrThrow']>>
  >;
  data: (value: unknown) => { ok: boolean; data: unknown };
  jobDto: (job: any) => any;
}
