import type { Project, Settings } from '../domain/types';
import { recoverStudio } from './studio-recovery';

export interface StudioSnapshot { projects: Project[]; settings: Settings }
let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is unavailable.')); return; }
    const request = indexedDB.open('auraspace-studio', 1);
    let finished = false;
    const fail = () => { if (!finished) { finished = true; reject(new Error('Device storage could not be opened.')); } };
    request.onupgradeneeded = () => {
      for (const name of ['projects', 'meta', 'originals']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
    };
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      if (finished) { request.result.close(); return; }
      finished = true;
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
  }).catch((error) => { connection = undefined; throw error; });
  return connection;
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('Device storage could not save changes.'));
  });
}

let previous = new Map<string, Project>();
let revision = 0;
export async function readStudio(): Promise<unknown | undefined> {
  const db = await database();
  const tx = db.transaction(['projects', 'meta'], 'readonly');
  const done = completed(tx);
  const meta = tx.objectStore('meta').get('studio');
  const projects = tx.objectStore('projects').getAll();
  const keys = tx.objectStore('projects').getAllKeys();
  await done;
  revision = meta.result?.revision ?? 0;
  if (!meta.result) return undefined;
  const byId = new Map(keys.result.map((id, i) => [id, projects.result[i]]));
  const ordered = (meta.result.projectIds as string[]).map((id) => byId.get(id));
  previous = new Map((recoverStudio({ projects: ordered }).projects ?? []).map((p) => [p.id, p]));
  return { projects: ordered, settings: meta.result.settings };
}

let tail: Promise<void> = Promise.resolve();
/** Writes are serialized; only changed projects are cloned into IndexedDB.
 * The metadata and changed/deleted projects commit in one transaction.
 */
export function writeStudio(snapshot: StudioSnapshot): Promise<void> {
  const task = tail.catch(() => undefined).then(async () => {
    const db = await database();
    const tx = db.transaction(['projects', 'meta', 'originals'], 'readwrite');
    const done = completed(tx), store = tx.objectStore('projects');
    const next = new Map(snapshot.projects.map((p) => [p.id, p]));
    let failure: unknown;
    const current = tx.objectStore('meta').get('studio');
    current.onsuccess = () => { try {
      if ((current.result?.revision ?? 0) !== revision) {
        const conflict = new Error('This studio changed in another tab. Export your changes before reloading.');
        conflict.name = 'StudioConflictError';
        throw conflict;
      }
      for (const [id, project] of next) if (previous.get(id) !== project) store.put(project, id);
      for (const id of previous.keys()) if (!next.has(id)) store.delete(id);
      const originals = new Set(snapshot.projects.flatMap((p) => p.photos.map((photo) => photo.originalAssetId).filter(Boolean)));
      for (const project of previous.values()) for (const photo of project.photos) {
        if (photo.originalAssetId && !originals.has(photo.originalAssetId)) tx.objectStore('originals').delete(photo.originalAssetId);
      }
      tx.objectStore('meta').put({ projectIds: [...next.keys()], settings: snapshot.settings, revision: revision + 1 }, 'studio');
    } catch (error) {
      // Synchronous clone/quota errors must abort writes already queued above.
      failure = error; tx.abort();
    } };
    await done.catch((error) => { throw failure ?? error; });
    revision++;
    previous = next;
  });
  tail = task;
  return task;
}

/** Original bytes are separate from the normalized image used for coordinates. */
export async function storeOriginal(id: string, file: Blob): Promise<void> {
  const db = await database(), tx = db.transaction('originals', 'readwrite');
  const done = completed(tx);
  tx.objectStore('originals').put(file, id);
  await done;
}

export async function readOriginal(id: string): Promise<Blob | undefined> {
  const db = await database(), tx = db.transaction('originals', 'readonly');
  const done = completed(tx), request = tx.objectStore('originals').get(id);
  await done;
  return request.result;
}
