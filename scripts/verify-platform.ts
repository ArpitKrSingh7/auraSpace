import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createApp } from '../apps/api/src/app';
import { createDocument, applyCommand } from '@auraspace/scene-domain';
import { makeProcessor } from '../apps/worker/src/processor';
const { app, db, media, queue, config } = createApp();
async function verify() {
  await media.ensureBucket();
  await app.ready();
  const guest = async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/sessions/guest',
    });
    assert.equal(response.statusCode, 200, response.body);
    return { authorization: `Bearer ${response.json().data.token}` };
  };
  const alice = await guest(),
    bob = await guest(),
    doc = createDocument('Platform integration test', 5, 4, 2.8);
  const capture = {
    id: `capture-${doc.id}`,
    originalAssetId: `asset-${doc.id}`,
    name: 'Synthetic fixture',
    width: 96,
    height: 64,
    createdAt: new Date().toISOString(),
    qualityWarnings: [],
    mapping: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
    status: 'idle',
  } as const;
  const added = applyCommand(doc.scene, {
    type: 'add-capture',
    capture: { ...capture, qualityWarnings: [] },
  });
  assert.equal(added.ok, true);
  if (!added.ok) throw new Error(added.message);
  doc.scene = added.value;
  const create = await app.inject({
    method: 'POST',
    url: '/v1/projects',
    headers: alice,
    payload: doc,
  });
  assert.equal(create.statusCode, 201, create.body);
  let revision = create.json().data.revision;
  for (const url of [`/v1/projects/${doc.id}/scene`])
    assert.equal(
      (await app.inject({ method: 'GET', url, headers: bob })).statusCode,
      404,
    );
  assert.equal(
    (await app.inject({ method: 'GET', url: `/v1/projects/${doc.id}/scene` }))
      .statusCode,
    401,
  );
  const stale = await app.inject({
    method: 'PUT',
    url: `/v1/projects/${doc.id}/scene`,
    headers: alice,
    payload: { expectedRevision: revision + 10, scene: doc.scene },
  });
  assert.equal(stale.statusCode, 409, stale.body);
  const save = await app.inject({
    method: 'PUT',
    url: `/v1/projects/${doc.id}/scene`,
    headers: alice,
    payload: { expectedRevision: revision, scene: doc.scene },
  });
  assert.equal(save.statusCode, 200, save.body);
  revision = save.json().data.revision;
  const cap = await app.inject({
    method: 'POST',
    url: `/v1/projects/${doc.id}/captures`,
    headers: alice,
    payload: { id: capture.id },
  });
  assert.equal(cap.statusCode, 200, cap.body);
  const bytes = await readFile('scripts/fixtures/room.png'),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  const intent = await app.inject({
    method: 'POST',
    url: `/v1/captures/${capture.id}/uploads`,
    headers: alice,
    payload: {
      captureImageId: capture.id,
      name: 'Fixture',
      mimeType: 'image/png',
      byteLength: bytes.length,
      sha256,
      width: 96,
      height: 64,
    },
  });
  assert.equal(intent.statusCode, 200, intent.body);
  assert.equal(
    (
      await app.inject({
        method: 'PUT',
        url: intent.json().data.uploadPath,
        headers: { ...bob, 'content-type': 'image/png' },
        payload: bytes,
      })
    ).statusCode,
    404,
  );
  const upload = await app.inject({
    method: 'PUT',
    url: intent.json().data.uploadPath,
    headers: { ...alice, 'content-type': 'image/png' },
    payload: bytes,
  });
  assert.equal(upload.statusCode, 200, upload.body);
  const finalize = await app.inject({
    method: 'POST',
    url: `/v1/captures/${capture.id}/finalize`,
    headers: alice,
  });
  assert.equal(finalize.statusCode, 200, finalize.body);
  const artifact = await app.inject({
    method: 'GET',
    url: `/v1/artifacts/${capture.originalAssetId}/content`,
    headers: alice,
  });
  assert.equal(artifact.statusCode, 200, artifact.body);
  assert.equal(
    createHash('sha256').update(artifact.rawPayload).digest('hex'),
    sha256,
  );
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: `/v1/artifacts/${capture.originalAssetId}/access`,
        headers: bob,
      })
    ).statusCode,
    404,
  );
  const input = {
    kind: 'analyze',
    captureImageIds: [capture.id],
    inputRevision: revision,
    idempotencyKey: `test-${doc.id}`,
    includeDepth: false,
  };
  const started = await app.inject({
    method: 'POST',
    url: `/v1/projects/${doc.id}/jobs`,
    headers: alice,
    payload: input,
  });
  assert.equal(started.statusCode, 202, started.body);
  const jobId = started.json().data.id;
  const again = await app.inject({
    method: 'POST',
    url: `/v1/projects/${doc.id}/jobs`,
    headers: alice,
    payload: input,
  });
  assert.equal(again.statusCode, 200, again.body);
  assert.equal(again.json().data.id, jobId);
  const changed = await app.inject({
    method: 'POST',
    url: `/v1/projects/${doc.id}/jobs`,
    headers: alice,
    payload: { ...input, includeDepth: true },
  });
  assert.equal(changed.statusCode, 409, changed.body);
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: `/v1/jobs/${jobId}`,
        headers: bob,
      })
    ).statusCode,
    404,
  );
  const cancel = await app.inject({
    method: 'POST',
    url: `/v1/jobs/${jobId}/cancel`,
    headers: alice,
  });
  assert.equal(cancel.statusCode, 200, cancel.body);
  assert.ok(
    ['cancelled', 'running'].includes(cancel.json().data.status),
    cancel.body,
  );
  assert.equal(
    (await db.job.findUniqueOrThrow({ where: { id: jobId } })).cancelRequested,
    true,
  );
  const deleted = await app.inject({
    method: 'DELETE',
    url: `/v1/projects/${doc.id}`,
    headers: alice,
  });
  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: `/v1/artifacts/${capture.originalAssetId}/content`,
        headers: alice,
      })
    ).statusCode,
    404,
  );
  console.log(
    'PASS: project ownership, absent auth, optimistic revisions, private storage upload/download integrity, upload authorization, finalized captures, job idempotency, stale-key rejection, cancellation and deletion access.',
  );
  await queue.remove(jobId);
  await media.delete(`projects/${doc.id}/sources/${capture.originalAssetId}`);
  await db.project.delete({ where: { id: doc.id } });
}
verify()
  .then(() => app.close())
  .then(() => queue.close())
  .then(() => db.$disconnect())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    await app.close().catch(() => undefined);
    await queue.close().catch(() => undefined);
    await db.$disconnect();
    process.exit(1);
  });
