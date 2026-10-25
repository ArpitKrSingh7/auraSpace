import {
  configuration,
  createQueue,
  database,
  MediaStore,
  QUEUE_NAME,
  redisConnection,
  Worker,
} from '@auraspace/backend';
import { Cancelled, makeProcessor } from './processor';
const config = configuration(),
  media = new MediaStore(config),
  queue = createQueue(config.REDIS_URL),
  processor = makeProcessor(config, database, media);
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    try {
      await processor(job.data.jobId, job.attemptsMade + 1);
    } catch (error) {
      if (error instanceof Cancelled) {
        await database.job.updateMany({
          where: { id: job.data.jobId },
          data: { status: 'cancelled', error: null },
        });
        return;
      }
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await database.job.updateMany({
        where: { id: job.data.jobId, cancelRequested: false },
        data: {
          status: final ? 'failed' : 'queued',
          error:
            'Processing could not finish. Your source photos and room edits are safe. Retry or continue manually.',
        },
      });
      throw error;
    }
  },
  {
    connection: redisConnection(config.REDIS_URL) as any,
    concurrency: config.WORKER_CONCURRENCY,
    lockDuration: 300000,
    maxStalledCount: 2,
  },
);
worker.on('error', (error) =>
  console.error('Worker connection error:', error.message),
);
worker.on('failed', (job, error) =>
  console.warn('Processing attempt failed', {
    jobId: job?.data.jobId,
    message: error.name,
  }),
);
let recovering = false;
async function recover() {
  if (recovering) return;
  recovering = true;
  try {
    const pending = await database.job.findMany({
      where: {
        status: 'queued',
        cancelRequested: false,
        updatedAt: { lt: new Date(Date.now() - 5000) },
      },
      take: 100,
    });
    for (const job of pending) {
      const existing = await queue.getJob(job.id);
      if (!existing)
        await queue.add(job.kind, { jobId: job.id }, { jobId: job.id });
      else if (await existing.isFailed()) await existing.retry();
    }
    await database.artifact.updateMany({
      where: { deletedAt: null, project: { deletedAt: { not: null } } },
      data: { deletedAt: new Date() },
    });
    const removed = await database.artifact.findMany({
      where: { deletedAt: { not: null } },
      take: 50,
    });
    for (const artifact of removed) {
      await media.delete(artifact.key);
      await database.artifact.delete({ where: { id: artifact.id } });
    }
  } catch (error) {
    console.warn(
      'Recovery will retry:',
      error instanceof Error ? error.name : 'unavailable',
    );
  } finally {
    recovering = false;
  }
}
const timer = setInterval(() => void recover(), 10000);
timer.unref();
void recover();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    clearInterval(timer);
    void worker
      .close()
      .then(() => queue.close())
      .then(() => database.$disconnect())
      .then(() => process.exit(0));
  });
