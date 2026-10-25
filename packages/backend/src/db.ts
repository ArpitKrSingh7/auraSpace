import { PrismaClient } from '@prisma/client';
export const database = new PrismaClient({ log: ['warn', 'error'] });
export type { PrismaClient } from '@prisma/client';
