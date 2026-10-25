import { useStudio } from '../state/studio';
import { localDatabase } from '../storage/database';
import { ApiFailure, permanentOperationError, request } from './api';
import { processPendingJob } from './job-operations';
import { syncRoom } from './project-sync';
export { syncRoom } from './project-sync';
let active = false;

export async function enqueueSync(id: string) {
  const db = await localDatabase();
  await db.runAsync(
    'INSERT INTO outbox(id,project_id,kind,payload,next_attempt) VALUES(?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,next_attempt=0',
    `sync-${id}`,
    id,
    'sync',
    JSON.stringify({
      id,
      endpoint: useStudio.getState().endpoint || undefined,
    }),
  );
  void drainOutbox();
}
export async function drainOutbox() {
  if (active || !useStudio.getState().ready || !useStudio.getState().endpoint)
    return;
  active = true;
  try {
    const db = await localDatabase(),
      rows = await db.getAllAsync<{
        id: string;
        project_id: string;
        kind: string;
        payload: string;
        attempts: number;
      }>(
        'SELECT id,project_id,kind,payload,attempts FROM outbox WHERE next_attempt<=? ORDER BY next_attempt LIMIT 5',
        Date.now(),
      );
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload);
        if (
          row.kind === 'sync' &&
          payload.endpoint &&
          payload.endpoint !== useStudio.getState().endpoint
        )
          throw new ApiFailure(
            'This sync belongs to another server. Restore its connection or queue a new sync.',
            'server-changed',
          );
        if (row.kind === 'processing') await processPendingJob(row.id);
        else if (row.kind === 'delete')
          await request(
            `/v1/projects/${row.project_id}`,
            { method: 'DELETE' },
            30000,
            payload.endpoint,
          );
        else await syncRoom(row.project_id);
        await db.runAsync('DELETE FROM outbox WHERE id=?', row.id);
      } catch (error) {
        if (permanentOperationError(error)) {
          await db.runAsync(
            'UPDATE projects SET sync_state=? WHERE id=?',
            'conflict',
            row.project_id,
          );
          await db.runAsync(
            'UPDATE outbox SET next_attempt=?,error=? WHERE id=?',
            Number.MAX_SAFE_INTEGER,
            (error as Error).message,
            row.id,
          );
          if(row.kind==='processing'){const op=JSON.parse(row.payload);for(const captureId of op.captureIds??[])useStudio.getState().execute(row.project_id,{type:'edit-capture',id:captureId,changes:{status:'failed',error:(error as Error).message}});}
          useStudio.getState().notify((error as Error).message);
        } else {
          await db.runAsync(
            'UPDATE outbox SET attempts=attempts+1,next_attempt=?,error=? WHERE id=?',
            Date.now() +
              Math.min(300000, 2000 * 2 ** Math.min(row.attempts, 7)),
            error instanceof Error ? error.message : 'Sync will retry.',
            row.id,
          );
        }
      }
    }
  } catch {
    /* A later foreground pass retries; local drafts remain authoritative. */
  } finally {
    active = false;
  }
}
