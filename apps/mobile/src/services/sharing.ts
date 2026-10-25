import {
  dimensionedPlan,
  forkDocument,
  projectDocumentSchema,
  referencedAssets,
  type ProjectDocument,
} from '@auraspace/scene-domain';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Zip, ZipPassThrough, strFromU8, strToU8, unzipSync } from 'fflate';
import { useStudio } from '../state/studio';
import { removeDocument, saveDocument } from '../storage/database';
import { deleteMedia, persistRemoteMedia, readMedia } from '../storage/media';
const exportDir = () => {
  const dir = new Directory(Paths.document, 'exports');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};
export async function shareFile(uri: string, mimeType: string) {
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Share your room' });
  else
    useStudio
      .getState()
      .notify(
        'Sharing is unavailable. Your export is saved in the app’s exports folder.',
      );
}
export async function exportPlan(doc: ProjectDocument) {
  const file = new File(exportDir(), `${doc.id}-plan.svg`);
  file.write(dimensionedPlan(doc));
  await shareFile(file.uri, 'image/svg+xml');
}
export async function exportPortable(doc: ProjectDocument) {
  await useStudio.getState().flush();
  const entries = [];
  for (const id of referencedAssets(doc)) {
    const { record } = await readMedia(id);
    entries.push({
      id,
      mimeType: record.mime_type,
      byteLength: record.bytes,
      sha256: record.sha256,
      path: `media/${id}`,
    });
  }
  const total = entries.reduce((n, e) => n + e.byteLength, 0);
  if (total > 256_000_000 || Paths.availableDiskSpace < total * 2 + 10_000_000)
    throw new Error(
      'This project needs more free space to export its photos. Export the floor plan first or free device storage.',
    );
  const file = new File(exportDir(), `${doc.id}-${Date.now()}.auraspace.zip`);
  file.create({ overwrite: true });
  const handle = file.open();
  let failed: Error | null = null;
  const zip = new Zip((error, data, final) => {
    if (error) {
      failed = error;
      return;
    }
    handle.writeBytes(data);
  });
  try {
    const manifest = new ZipPassThrough('manifest.json');
    zip.add(manifest);
    manifest.push(
      strToU8(
        JSON.stringify({
          format: 'auraspace-project',
          version: 2,
          project: doc,
          media: entries,
        }),
      ),
      true,
    );
    for (const entry of entries) {
      const part = new ZipPassThrough(entry.path);
      zip.add(part);
      part.push((await readMedia(entry.id)).bytes, true);
      if (failed) throw failed;
    }
    zip.end();
    if (failed) throw failed;
  } finally {
    handle.close();
  }
  await shareFile(file.uri, 'application/zip');
}
export async function importPortable() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/octet-stream', 'application/json'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return;
  const file = new File(result.assets[0].uri);
  if (file.size > 256_000_000)
    throw new Error('Choose a project package below 256 MB.');
  const bytes = await file.bytes();
  const first = unzipSync(bytes, {
    filter: (entry) => {
      if (entry.name !== 'manifest.json') return false;
      if (entry.originalSize > 2_000_000)
        throw new Error('Project manifest is too large.');
      return true;
    },
  });
  if (!first['manifest.json'])
    throw new Error('This is not an AuraSpace project package.');
  const manifest = JSON.parse(strFromU8(first['manifest.json']));
  if (
    manifest.format !== 'auraspace-project' ||
    manifest.version !== 2 ||
    !Array.isArray(manifest.media) ||
    manifest.media.length > 300
  )
    throw new Error('This project format is unsupported.');
  const doc = projectDocumentSchema.parse(manifest.project),
    expected = new Map<
      string,
      { id: string; mimeType: string; byteLength: number; sha256: string }
    >(
      manifest.media.map((m: any) => {
        if (
          !/^[a-zA-Z0-9_.:-]{1,128}$/.test(m.id) ||
          m.path !== `media/${m.id}` ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(m.mimeType) ||
          !Number.isInteger(m.byteLength) ||
          m.byteLength < 1 ||
          m.byteLength > 20_000_000 ||
          !/^[a-f0-9]{64}$/.test(m.sha256)
        )
          throw new Error('The media manifest is invalid.');
        return [m.path, m];
      }),
    );
  if (
    expected.size !== manifest.media.length ||
    new Set(manifest.media.map((m: any) => m.id)).size !== manifest.media.length
  )
    throw new Error('The package contains duplicate media records.');
  for (const assetId of referencedAssets(doc))
    if (!expected.has(`media/${assetId}`))
      throw new Error('The package is missing required photo records.');
  let total = 0;
  const archive = unzipSync(bytes, {
    filter: (entry) => {
      const m = expected.get(entry.name);
      if (!m) return false;
      total += entry.originalSize;
      if (entry.originalSize !== m.byteLength || total > 256_000_000)
        throw new Error('The package exceeds its declared media limits.');
      return true;
    },
  });
  const fork = forkDocument(doc, `${doc.name.slice(0, 85)} (imported)`),
    oldToNew = fork.assets;
  Object.assign(doc, fork.document);
  await saveDocument(doc);
  try {
    for (const [path, m] of expected) {
      const content = archive[path];
      if (!content)
        throw new Error('A required photograph is missing from the package.');
      const saved = await persistRemoteMedia(
        doc.id,
        oldToNew.get(m.id)!,
        content,
        m.mimeType,
      );
      if (saved.sha256 !== m.sha256)
        throw new Error('A photograph failed the integrity check.');
    }
    if (!(await useStudio.getState().put(doc)))
      throw new Error('This project could not be saved.');
    return doc.id;
  } catch (error) {
    for (const assetId of oldToNew.values())
      await deleteMedia(assetId).catch(() => undefined);
    await removeDocument(doc.id);
    throw error;
  }
}
