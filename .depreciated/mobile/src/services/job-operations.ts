import {
  jobResponseSchema,
  type CreateJob,
  type JobRecord,
} from '@auraspace/contracts';
import { newId } from '@auraspace/scene-domain/legacy/catalog';
import { useStudio } from '../state/studio';
import { localDatabase } from '../storage/database';
import { readMedia } from '../storage/media';
import { ApiFailure, permanentOperationError, request } from './api';
import { syncRoom } from './project-sync';
export interface PendingProcessing {
  endpoint?: string;
  projectId: string;
  captureIds: string[];
  kind: 'analyze' | 'inpaint' | 'process';
  operation?: CreateJob['operation'];
  observationIds: string[];
  includeDepth: boolean;
  idempotencyKey: string;
  maskRevisions: Record<string, number>;
  submittedInput?: CreateJob;
}
const inFlight = new Map<string, Promise<JobRecord>>();
export async function uploadCapture(
  projectId: string,
  captureId: string,
  endpoint = useStudio.getState().endpoint,
) {
  const doc = useStudio.getState().projects.find((p) => p.id === projectId),
    capture = doc?.scene.captures.find((c) => c.id === captureId);
  if (!doc || !capture)
    throw new ApiFailure(
      'This photograph was removed. Choose a current photo.',
      'capture-removed',
    );
  await request(
    `/v1/projects/${projectId}/captures`,
    { method: 'POST', body: JSON.stringify({ id: captureId }) },
    30000,
    endpoint,
  );
  const { record, bytes } = await readMedia(capture.originalAssetId);
  const intent = await request<{
    artifactId: string;
    uploadPath?: string;
    ready: boolean;
  }>(
    `/v1/captures/${captureId}/uploads`,
    {
      method: 'POST',
      body: JSON.stringify({
        captureImageId: captureId,
        name: capture.name,
        mimeType: record.mime_type,
        byteLength: record.bytes,
        sha256: record.sha256,
        width: capture.width,
        height: capture.height,
      }),
    },
    30000,
    endpoint,
  );
  if (!intent.ready && intent.uploadPath)
    await request(
      intent.uploadPath,
      {
        method: 'PUT',
        body: bytes as any,
        headers: { 'Content-Type': record.mime_type },
      },
      60000,
      endpoint,
    );
  await request(
    `/v1/captures/${captureId}/finalize`,
    { method: 'POST' },
    30000,
    endpoint,
  );
}
export async function processPendingJob(
  operationId: string,
): Promise<JobRecord> {
  if (inFlight.has(operationId)) return inFlight.get(operationId)!;
  const task = (async () => {
    const db = await localDatabase(),
      row = await db.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM outbox WHERE id=?',
        operationId,
      );
    if (!row)
      throw new ApiFailure('This queued operation was cancelled.', 'cancelled');
    const op = JSON.parse(row.payload) as PendingProcessing;
    if (op.endpoint && op.endpoint !== useStudio.getState().endpoint)
      throw new ApiFailure(
        'This upload belongs to a different server. Restore its connection in Settings, or cancel it and start again.',
        'server-changed',
      );
    if (!op.endpoint) {
      op.endpoint = useStudio.getState().endpoint;
      await db.runAsync(
        'UPDATE outbox SET payload=? WHERE id=?',
        JSON.stringify(op),
        operationId,
      );
    }
    const doc = useStudio
      .getState()
      .projects.find((p) => p.id === op.projectId);
    if (!doc) throw new ApiFailure('This room was removed.', 'project-removed');
    if (!op.submittedInput) {
      if (
        op.kind === 'inpaint' &&
        op.observationIds.some(
          (id) =>
            doc.scene.observations.find((o) => o.id === id)?.mask.revision !==
            op.maskRevisions[id],
        )
      )
        throw new ApiFailure(
          'The removal mask changed while queued. Review it and start a new preview.',
          'mask-changed',
        );
      const revision = await syncRoom(op.projectId, op.endpoint);
      op.submittedInput = {
        kind: op.kind,
        captureImageIds: op.captureIds,
        inputRevision: revision,
        idempotencyKey: op.idempotencyKey,
        observationIds: op.observationIds,
        includeDepth: op.includeDepth,
        operation: op.operation,
        maskRevisions: op.maskRevisions,
      };
      await db.runAsync(
        'UPDATE outbox SET payload=? WHERE id=?',
        JSON.stringify(op),
        operationId,
      );
    }
    for (const id of op.captureIds) {
      if (
        !(await db.getFirstAsync(
          'SELECT id FROM outbox WHERE id=?',
          operationId,
        ))
      )
        throw new ApiFailure(
          'This queued operation was cancelled.',
          'cancelled',
        );
      await uploadCapture(op.projectId, id, op.endpoint);
    }
    if (
      !(await db.getFirstAsync('SELECT id FROM outbox WHERE id=?', operationId))
    )
      throw new ApiFailure('This queued operation was cancelled.', 'cancelled');
    const job = jobResponseSchema.parse(
      await request(
        `/v1/projects/${op.projectId}/jobs`,
        { method: 'POST', body: JSON.stringify(op.submittedInput) },
        30000,
        op.endpoint,
      ),
    );
    if (
      !(await db.getFirstAsync('SELECT id FROM outbox WHERE id=?', operationId))
    ) {
      await request(
        `/v1/jobs/${job.id}/cancel`,
        { method: 'POST' },
        30000,
        op.endpoint,
      );
      return job;
    }
    await db.runAsync(
      'INSERT OR REPLACE INTO jobs(id,project_id,capture_id,record,handled) VALUES(?,?,?,?,0)',
      job.id,
      op.projectId,
      op.captureIds[0],
      JSON.stringify(job),
    );
    for (const id of op.captureIds)
      useStudio.getState().execute(op.projectId, {
        type: 'edit-capture',
        id,
        changes: { jobId: job.id, status: 'queued', error: undefined },
      });
    await useStudio.getState().flush();
    await db.runAsync('DELETE FROM outbox WHERE id=?', operationId);
    return job;
  })();
  inFlight.set(operationId, task);
  try {
    return await task;
  } finally {
    inFlight.delete(operationId);
  }
}
export async function queueProcessing(
  projectId: string,
  captureIds: string[],
  kind: 'analyze' | 'inpaint' | 'process',
  observationIds: string[] = [],
  includeDepth = false,
  processingOperation?: CreateJob['operation'],
) {
  await useStudio.getState().flush();
  const doc = useStudio.getState().projects.find((p) => p.id === projectId);
  if (!doc) throw new Error('This room is no longer available.');
  const id = newId('operation'),
    operation: PendingProcessing = {
      endpoint: useStudio.getState().endpoint || undefined,
      projectId,
      captureIds,
      kind,
      operation: processingOperation,
      observationIds,
      includeDepth,
      idempotencyKey: newId('request'),
      maskRevisions: Object.fromEntries(
        doc.scene.observations
          .filter((o) => observationIds.includes(o.id))
          .map((o) => [o.id, o.mask.revision]),
      ),
    };
  const db = await localDatabase();
  await db.runAsync(
    'INSERT INTO outbox(id,project_id,kind,payload) VALUES(?,?,?,?)',
    id,
    projectId,
    'processing',
    JSON.stringify(operation),
  );
  for (const captureId of captureIds)
    useStudio.getState().execute(projectId, {
      type: 'edit-capture',
      id: captureId,
      changes: { status: 'queued', jobId: undefined, error: undefined },
    });
  await useStudio.getState().flush();
  if (!useStudio.getState().endpoint) {
    useStudio
      .getState()
      .notify(
        'Saved for analysis. Connect a room server in Settings when ready; your photos stay on this device.',
      );
    return null;
  }
  try {
    return await processPendingJob(id);
  } catch (error) {
    if (permanentOperationError(error)) {
      await db.runAsync(
        'UPDATE outbox SET next_attempt=?,error=? WHERE id=?',
        Number.MAX_SAFE_INTEGER,
        (error as Error).message,
        id,
      );
      for (const captureId of captureIds)
        useStudio.getState().execute(projectId, {
          type: 'edit-capture',
          id: captureId,
          changes: { status: 'failed', error: (error as Error).message },
        });
    } else
      useStudio
        .getState()
        .notify(
          'The upload is queued and will retry when connected. You can keep planning.',
        );
    return null;
  }
}
export async function cancelPendingCapture(
  projectId: string,
  captureId: string,
) {
  const db = await localDatabase(),
    rows = await db.getAllAsync<{ id: string; payload: string }>(
      'SELECT id,payload FROM outbox WHERE project_id=? AND kind=?',
      projectId,
      'processing',
    );
  for (const row of rows) {
    const op = JSON.parse(row.payload) as PendingProcessing;
    if (op.captureIds.includes(captureId))
      await db.runAsync('DELETE FROM outbox WHERE id=?', row.id);
  }
  useStudio.getState().execute(projectId, {
    type: 'edit-capture',
    id: captureId,
    changes: { status: 'idle', error: undefined },
  });
}
