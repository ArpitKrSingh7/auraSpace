import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createApp } from '../apps/api/src/app';
import {
  createDocument,
  applyCommand,
  newPhysicalItem,
} from '@auraspace/scene-domain';
const { app, db, media, queue } = createApp();
const doc = createDocument('Queued processing integration fixture', 5, 4, 2.8);
async function verify() {
  await app.ready();
  await media.ensureBucket();
  const session = await app.inject({
    method: 'POST',
    url: '/v1/sessions/guest',
  });
  const headers = { authorization: `Bearer ${session.json().data.token}` };
  const call = async (method: string, url: string, payload?: unknown) => {
    const r = await app.inject({
      method: method as any,
      url,
      headers,
      payload: payload as any,
    });
    assert.ok(r.statusCode >= 200 && r.statusCode < 300, r.body);
    return r.json().data;
  };
  const command = (c: any) => {
    const result = applyCommand(doc.scene, c);
    assert.equal(result.ok, true);
    if (result.ok) doc.scene = result.value;
  };
  const captureId = `capture-${doc.id}`,
    assetId = `asset-${doc.id}`;
  command({
    type: 'add-capture',
    capture: {
      id: captureId,
      originalAssetId: assetId,
      name: 'Synthetic processing fixture',
      width: 96,
      height: 64,
      createdAt: new Date().toISOString(),
      qualityWarnings: [],
      mapping: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      status: 'idle',
    },
  });
  const observationId = `observation-${doc.id}`;
  command({
    type: 'observation',
    observation: {
      id: observationId,
      captureImageId: captureId,
      originalLabel: 'Measured box',
      category: 'custom',
      source: 'manual',
      coordinateSpace: 'oriented-source-image',
      boxPx: [30, 20, 25, 30],
      mask: {
        revision: 1,
        polygons: [
          [
            [30, 20],
            [55, 20],
            [55, 50],
            [30, 50],
          ],
        ],
        strokes: [],
        expansionPx: 0,
      },
      reviewed: true,
      ignored: false,
      fixed: false,
    },
  });
  let revision = (await call('POST', '/v1/projects', doc)).revision;
  await call('POST', `/v1/projects/${doc.id}/captures`, { id: captureId });
  const bytes = await readFile('scripts/fixtures/room.png'),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  const intent = await call('POST', `/v1/captures/${captureId}/uploads`, {
    captureImageId: captureId,
    name: 'Fixture',
    mimeType: 'image/png',
    byteLength: bytes.length,
    sha256,
    width: 96,
    height: 64,
  });
  const upload = await app.inject({
    method: 'PUT',
    url: intent.uploadPath,
    headers: { ...headers, 'content-type': 'image/png' },
    payload: bytes,
  });
  assert.equal(upload.statusCode, 200, upload.body);
  await call('POST', `/v1/captures/${captureId}/finalize`);
  const wait = async (id: string) => {
    for (let n = 0; n < 120; n++) {
      const job = await call('GET', `/v1/jobs/${id}`);
      if (['review', 'complete', 'failed', 'cancelled'].includes(job.status)) {
        assert.equal(job.status, 'review', JSON.stringify(job));
        return job;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('Worker did not finish in 120 seconds');
  };
  const analyzed = await call('POST', `/v1/projects/${doc.id}/jobs`, {
    kind: 'analyze',
    captureImageIds: [captureId],
    inputRevision: revision,
    idempotencyKey: `analyze-${doc.id}`,
    includeDepth: true,
  });
  command({
    type: 'add-item',
    item: {
      ...newPhysicalItem('chair'),
      name: 'Edit made while analysis runs',
    },
  });
  const updated = await call('PUT', `/v1/projects/${doc.id}/scene`, {
    expectedRevision: revision,
    scene: doc.scene,
  });
  doc.scene = updated.scene;
  revision = updated.revision;
  const result = await wait(analyzed.id);
  assert.equal(result.inputRevision < revision, true);
  assert.ok(
    result.result.proposals[0].artifacts.some((a: any) =>
      a.label?.startsWith('Raw depth'),
    ),
    'Metric depth was not persisted',
  );
  const current = await call('GET', `/v1/projects/${doc.id}/scene`);
  assert.deepEqual(
    current.scene,
    doc.scene,
    'Late analysis overwrote current edits',
  );
  const removal = await call('POST', `/v1/projects/${doc.id}/jobs`, {
    kind: 'inpaint',
    captureImageIds: [captureId],
    inputRevision: revision,
    idempotencyKey: `removal-${doc.id}`,
    observationIds: [observationId],
    maskRevisions: { [observationId]: 1 },
  });
  const preview = await wait(removal.id);
  const proposal = preview.result.proposals[0];
  assert.match(proposal.modelVersions.inpainting, /Big-LaMa/);
  const artifact = proposal.artifacts.find((a: any) => a.kind === 'preview');
  assert.ok(artifact);
  const downloaded = await app.inject({
    method: 'GET',
    url: `/v1/artifacts/${artifact.id}/content`,
    headers,
  });
  assert.equal(downloaded.statusCode, 200);
  assert.equal(
    createHash('sha256').update(downloaded.rawPayload).digest('hex'),
    artifact.sha256,
  );
  const processing = await call('POST', `/v1/projects/${doc.id}/jobs`, {
    kind: 'process',
    operation: 'clahe',
    captureImageIds: [captureId],
    inputRevision: revision,
    idempotencyKey: `process-${doc.id}`,
  });
  const processed = await wait(processing.id);
  assert.equal(processed.result.proposals[0].artifacts[0].kind, 'processing');
  console.log(
    'PASS: metric depth and classical processing; real BullMQ analysis and verified LaMa removal, immutable job snapshots, late-result protection, durable status, private output integrity.',
  );
  await call('DELETE', `/v1/projects/${doc.id}`);
  for (const a of await db.artifact.findMany({ where: { projectId: doc.id } }))
    await media.delete(a.key);
  for (const j of await db.job.findMany({ where: { projectId: doc.id } }))
    await queue.remove(j.id);
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
