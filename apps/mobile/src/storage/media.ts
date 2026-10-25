import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { localDatabase, mediaRecord, type LocalMedia } from './database';
const mediaDirectory = () => {
  const dir = new Directory(Paths.document, 'auraspace-media');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
};
export function uriFor(record: Pick<LocalMedia, 'path'>) {
  return new File(mediaDirectory(), record.path).uri;
}
export async function resolveMedia(id?: string) {
  if (!id) return undefined;
  const record = await mediaRecord(id);
  if (!record) return undefined;
  const uri = uriFor(record);
  return new File(uri).exists ? uri : undefined;
}
export async function persistMedia(
  projectId: string,
  id: string,
  sourceUri: string,
  mimeType = 'image/jpeg',
) {
  if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(id))
    throw new Error('Invalid media identifier');
  const source = new File(sourceUri);
  if (!source.exists)
    throw new Error('The photo is no longer available. Choose it again.');
  const bytes = await source.bytes();
  if (bytes.byteLength > 12_000_000)
    throw new Error('Choose an image smaller than 12 MB.');
  const digest = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      bytes,
    ),
    sha256 = Array.from(new Uint8Array(digest))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  const extension =
      mimeType === 'image/png'
        ? 'png'
        : mimeType === 'image/webp'
          ? 'webp'
          : 'jpg',
    path = `${id}.${extension}`,
    destination = new File(mediaDirectory(), path);
  if (destination.exists) {
    const previous = await mediaRecord(id);
    if (!previous || previous.sha256 !== sha256)
      throw new Error(
        'An existing photograph has a different checksum. Import it as a new photo.',
      );
  } else source.copy(destination);
  await (
    await localDatabase()
  ).runAsync(
    'INSERT OR REPLACE INTO media(id,project_id,path,mime_type,bytes,sha256) VALUES(?,?,?,?,?,?)',
    id,
    projectId,
    path,
    mimeType,
    bytes.byteLength,
    sha256,
  );
  return {
    id,
    uri: destination.uri,
    sha256,
    byteLength: bytes.byteLength,
    mimeType,
  };
}
export async function persistRemoteMedia(
  projectId: string,
  id: string,
  bytes: Uint8Array,
  mimeType: string,
) {
  const file = new File(Paths.cache, `download-${id}`);
  file.write(bytes);
  try {
    return await persistMedia(projectId, id, file.uri, mimeType);
  } finally {
    file.delete();
  }
}
export async function readMedia(id: string) {
  const record = await mediaRecord(id);
  if (!record)
    throw new Error('Download or re-import this photo before continuing.');
  return { record, bytes: await new File(uriFor(record)).bytes() };
}
export function deleteMediaFile(record: Pick<LocalMedia, 'path'>) {
  const file = new File(uriFor(record));
  if (file.exists) file.delete();
}
export async function deleteMedia(id: string) {
  const record = await mediaRecord(id);
  if (record) {
    deleteMediaFile(record);
    await (await localDatabase()).runAsync('DELETE FROM media WHERE id=?', id);
  }
}
