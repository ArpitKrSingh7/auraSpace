import { Queue } from 'bullmq';
import Redis from 'ioredis';
export const QUEUE_NAME = 'auraspace-processing-v2';
export const redisConnection = (url: string) =>
  new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 5000,
  });
export function createQueue(url: string) {
  return new Queue(QUEUE_NAME, {
    connection: redisConnection(url),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400, count: 500 },
      removeOnFail: { age: 604800, count: 500 },
    },
  });
}
