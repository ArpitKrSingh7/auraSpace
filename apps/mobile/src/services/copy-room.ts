import { forkDocument } from '@auraspace/scene-domain';
import { useStudio } from '../state/studio';
import { removeDocument, saveDocument } from '../storage/database';
import { deleteMedia, persistRemoteMedia, readMedia } from '../storage/media';
import { enqueueSync } from './sync';
export async function saveSeparateCloudCopy(id: string) {
  await useStudio.getState().flush();
  const source = useStudio.getState().projects.find((p) => p.id === id);
  if (!source) throw new Error('Open the current room first.');
  const { document, assets } = forkDocument(source);
  await saveDocument(document);
  try {
    for (const [previous, next] of assets) {
      const { bytes, record } = await readMedia(previous);
      await persistRemoteMedia(document.id, next, bytes, record.mime_type);
    }
    if (!(await useStudio.getState().put(document)))
      throw new Error('The separate room copy could not be saved.');
    await enqueueSync(document.id).catch(() =>
      useStudio
        .getState()
        .notify(
          'Your separate copy is saved locally. Retry syncing it when storage and the server are available.',
        ),
    );
    return document.id;
  } catch (error) {
    for (const asset of assets.values())
      await deleteMedia(asset).catch(() => undefined);
    await removeDocument(document.id);
    throw error;
  }
}
