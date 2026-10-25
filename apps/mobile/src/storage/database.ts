import {
  projectDocumentSchema,
  type ProjectDocument,
} from '@auraspace/scene-domain';
import * as SQLite from 'expo-sqlite';
let connection: Promise<SQLite.SQLiteDatabase> | null = null;
export function localDatabase() {
  return (connection ??= (async () => {
    const db = await SQLite.openDatabaseAsync('auraspace-v2.db');
    await db.execAsync(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL, remote_revision INTEGER, sync_state TEXT NOT NULL DEFAULT 'local');
CREATE TABLE IF NOT EXISTS project_links(project_id TEXT NOT NULL,endpoint TEXT NOT NULL,remote_revision INTEGER NOT NULL,PRIMARY KEY(project_id,endpoint),FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL, mime_type TEXT NOT NULL, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, capture_id TEXT NOT NULL, record TEXT NOT NULL, handled INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
PRAGMA user_version=3;`);
    return db;
  })().catch((error) => {
    connection = null;
    throw error;
  }));
}
export async function listDocuments() {
  const db = await localDatabase();
  const rows = await db.getAllAsync<{ document: string }>(
    'SELECT document FROM projects ORDER BY updated_at DESC',
  );
  const projects: ProjectDocument[] = [],
    failures: string[] = [];
  for (const row of rows) {
    try {
      projects.push(projectDocumentSchema.parse(JSON.parse(row.document)));
    } catch {
      failures.push(row.document);
    }
  }
  return { projects, hasUnreadable: failures.length > 0 };
}
export async function saveDocument(doc: ProjectDocument) {
  const valid = projectDocumentSchema.parse(doc),
    db = await localDatabase();
  await db.runAsync(
    "INSERT INTO projects(id,document,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,updated_at=excluded.updated_at,sync_state=CASE WHEN projects.remote_revision IS NULL THEN 'local' ELSE 'pending' END",
    valid.id,
    JSON.stringify(valid),
    valid.updatedAt,
  );
}
export async function removeDocument(id: string) {
  const db = await localDatabase();
  await db.withTransactionAsync(async () => {
    const links = await db.getAllAsync<{ endpoint: string }>(
      'SELECT endpoint FROM project_links WHERE project_id=?',
      id,
    );
    for (const [index, link] of links.entries())
      await db.runAsync(
        'INSERT OR REPLACE INTO outbox(id,project_id,kind,payload) VALUES(?,?,?,?)',
        `delete-${id}-${index}`,
        id,
        'delete',
        JSON.stringify({ id, endpoint: link.endpoint }),
      );
    await db.runAsync(
      'DELETE FROM outbox WHERE project_id=? AND kind<>?',
      id,
      'delete',
    );
    await db.runAsync('DELETE FROM projects WHERE id=?', id);
  });
}
export async function preference(key: string) {
  return (
    await (
      await localDatabase()
    ).getFirstAsync<{ value: string }>(
      'SELECT value FROM preferences WHERE key=?',
      key,
    )
  )?.value;
}
export async function setPreference(key: string, value: string) {
  await (
    await localDatabase()
  ).runAsync(
    'INSERT OR REPLACE INTO preferences(key,value) VALUES(?,?)',
    key,
    value,
  );
}
export interface LocalMedia {
  id: string;
  project_id: string;
  path: string;
  mime_type: string;
  bytes: number;
  sha256: string;
}
export async function mediaRecord(id: string) {
  return (await localDatabase()).getFirstAsync<LocalMedia>(
    'SELECT * FROM media WHERE id=?',
    id,
  );
}
export async function projectMedia(projectId: string) {
  return (await localDatabase()).getAllAsync<LocalMedia>(
    'SELECT * FROM media WHERE project_id=?',
    projectId,
  );
}
