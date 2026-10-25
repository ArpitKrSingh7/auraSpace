import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { configuration } from '../packages/backend/src/config';
import { MediaStore } from '../packages/backend/src/media';

async function verify() {
  const config = configuration();
  const media = new MediaStore(config);
  await media.ensureBucket();
  const key = `auraspace-checks/${randomUUID()}/room.png`;
  const bytes = await readFile('scripts/fixtures/room.png');
  try {
    await media.put(key, bytes, 'image/png');
    assert.equal((await media.head(key)).ContentLength, bytes.byteLength);
    assert.deepEqual(Buffer.from(await media.get(key)), bytes, 'Downloaded image differs from upload.');
    const signedUrl = await media.access(key);
    const signed = await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) });
    assert.equal(signed.status, 200, 'Temporary download link failed.');
    assert.deepEqual(Buffer.from(await signed.arrayBuffer()), bytes, 'Signed download differs from upload.');
    const publicUrl = `${config.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${encodeURIComponent(config.SUPABASE_STORAGE_BUCKET)}/${key}`;
    const anonymous = await fetch(publicUrl, { signal: AbortSignal.timeout(30_000) });
    assert.ok(!anonymous.ok, 'The file should not be publicly accessible.');
  } finally {
    await media.delete(key);
  }
  // Check origin metadata, not a previously fetched CDN response.
  await assert.rejects(media.head(key), 'Deleted test image should be absent from storage.');
  console.log('PASS: private Supabase bucket, upload/download integrity, signed download, anonymous-access denial and test-file cleanup.');
}
verify().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Storage verification failed.');
  process.exitCode = 1;
});
