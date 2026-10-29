import { canonicalJson, roomSceneSchema, type RoomScene } from '@auraspace/scene-domain';
import { useStudio } from '../state/studio';
import { localDatabase } from '../storage/database';
import { ApiFailure, request } from './api';

async function performSyncRoom(
  id: string,
  endpoint = useStudio.getState().endpoint,
) {
  await useStudio.getState().flush();
  const doc = useStudio.getState().projects.find((p) => p.id === id);
  if (!doc)
    throw new ApiFailure('This room is no longer available.', 'not-found');
  if (!endpoint)
    throw new ApiFailure(
      'Connect a room server in Settings to sync.',
      'offline',
      true,
    );
  const send = <T>(path: string, options: RequestInit = {}) =>
    request<T>(path, options, 30000, endpoint);
  const db = await localDatabase(),
    row = await db.getFirstAsync<{ remote_revision: number }>(
      'SELECT remote_revision FROM project_links WHERE project_id=? AND endpoint=?',
      id,
      endpoint,
    );
  if (!row) {
    await send('/v1/projects', { method: 'POST', body: JSON.stringify(doc) });
    const current = await send<{ scene: RoomScene; revision: number }>(
      `/v1/projects/${id}/scene`,
    );
    if (
      current.revision !== doc.scene.revision ||
      canonicalJson(roomSceneSchema.parse(current.scene)) !==
        canonicalJson(roomSceneSchema.parse(doc.scene))
    )
      throw new ApiFailure(
        'A different server copy exists. Your local room is safe. Use “Save a separate cloud copy” to preserve both versions.',
        'revision-conflict',
        false,
        409,
      );
    await db.runAsync(
      'INSERT INTO project_links(project_id,endpoint,remote_revision) VALUES(?,?,?)',
      id,
      endpoint,
      current.revision,
    );
    await db.runAsync(
      'UPDATE projects SET remote_revision=?,sync_state=? WHERE id=?',
      current.revision,
      'synced',
      id,
    );
    return current.revision;
  }
  const response = await send<{ revision: number; scene: RoomScene }>(
    `/v1/projects/${id}/scene`,
    {
      method: 'PUT',
      body: JSON.stringify({
        expectedRevision: row.remote_revision,
        scene: doc.scene,
        name: doc.name,
      }),
    },
  );
  await db.runAsync(
    'UPDATE project_links SET remote_revision=? WHERE project_id=? AND endpoint=?',
    response.revision,
    id,
    endpoint,
  );
  await db.runAsync(
    'UPDATE projects SET remote_revision=?,sync_state=? WHERE id=?',
    response.revision,
    'synced',
    id,
  );
  const latest = useStudio.getState().projects.find((p) => p.id === id);
  if (
    latest &&
    latest.scene.revision === doc.scene.revision &&
    response.scene.revision > doc.scene.revision
  )
    await useStudio.getState().put({ ...latest, scene: response.scene });
  return response.revision;
}

const pending = new Map<string, Promise<number>>();
export async function syncRoom(
  id: string,
  endpoint = useStudio.getState().endpoint,
) {
  const key = `${endpoint}:${id}`,
    previous = pending.get(key) ?? Promise.resolve(0),
    task = previous.catch(() => 0).then(() => performSyncRoom(id, endpoint));
  pending.set(key, task);
  try {
    return await task;
  } finally {
    if (pending.get(key) === task) pending.delete(key);
  }
}
