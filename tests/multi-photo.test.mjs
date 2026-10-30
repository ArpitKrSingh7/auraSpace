import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject } from '../src/domain/catalog.ts';
import { buildPhotoLayout, photoLayoutObservations } from '../src/services/photo-layout.ts';
import { parseRoomViewsResponse } from '../src/services/multi-photo-core.ts';
import { exportProjectJson, parseProjectJson } from '../src/domain/validation.ts';
import { forkDocument, migrateLegacyProject } from '../packages/scene-domain/src/index.ts';
import { useAppStore } from '../src/store/useAppStore.ts';

function fixture() {
  const project = makeProject('Multiple photos', 6, 6, 2.8);
  project.room.openings = [];
  const bed = (id, box = [10, 20, 200, 300]) => ({ id, label: 'bed', type: 'bed', source: 'model', score: .95, box });
  const photo = (id, detections) => ({ id, uri: 'data:image/png;base64,AAAA', name: `${id}.png`, width: 640, height: 480, analysisStatus: 'complete', detections });
  project.photos = [photo('a', [bed('det-0'), bed('det-1', [300, 50, 200, 300])]), photo('b', [bed('det-0')]), photo('c', [{ ...bed('det-0'), type: 'table', label: 'dining table' }])];
  project.photos[0].roomProposal = { status: 'estimated', source: 'model-estimated', method: 'test-common-floor', partial: true, confidence: 'low', floorCornersPx: [], widthM: 6, depthM: 6, warnings: [],
    multiView: { anchorPhotoId: 'a', views: [{ photoId: 'a', status: 'anchor', message: 'Starting view' }, { photoId: 'b', status: 'aligned', message: 'Aligned' }, { photoId: 'c', status: 'reference', message: 'Reference' }] },
    furniture: [{ photoId: 'a', detectionIndex: 1, centerXZ: [4.5, 4], widthM: 1, depthM: 2, heightM: .6, rotationDeg: 21, method: 'depth-projected' },
      { photoId: 'b', detectionIndex: 0, centerXZ: [1.5, 2], widthM: 1, depthM: 2, heightM: .6, rotationDeg: 21, method: 'depth-projected' }] };
  return project;
}

test('multi-photo drafts select physical representatives and leave reference detections optional', () => {
  const project = fixture();
  const obs = photoLayoutObservations(project, 'a');
  assert.deepEqual(obs.filter((o) => o.defaultSelected).map((o) => o.key), ['a:det-1', 'b:det-0']);
  const result = buildPhotoLayout(project, 'a');
  assert.equal(result.added.length, 2);
  assert.equal(result.projectedCount, 2);
  assert.equal(result.added.filter((i) => i.photoId === 'b').length, 1);
  const item = result.added.find((i) => i.photoId === 'b');
  assert.equal(item.x, 1.5); assert.equal(item.z, 2); assert.equal(item.rotation, 21);
  const all = buildPhotoLayout(project, 'a', { selectedIds: ['a:det-1', 'b:det-0', 'c:det-0'] });
  assert.equal(all.added.length, 3);
  assert.equal(all.projectedCount, 2);
  assert.ok(all.warnings.some((w) => w.includes('photo composition')));
});

test('overlapping observed poses stay visible for correction instead of being silently packed', () => {
  const project = fixture();
  project.photos[0].roomProposal.furniture[1].centerXZ = [4.5, 4];
  const result = buildPhotoLayout(project, 'a');
  assert.equal(result.added[0].x, result.added[1].x);
  assert.equal(result.added[0].z, result.added[1].z);
  assert.ok(result.warnings.some((w) => /overlap/i.test(w)));
});

test('unaligned photos use the best-view selection without pulling in duplicates', () => {
  const project = fixture();
  const proposal = project.photos[0].roomProposal;
  proposal.multiView.views[1].status = 'reference';
  proposal.furniture = proposal.furniture.filter((p) => p.photoId === 'a');
  assert.deepEqual(photoLayoutObservations(project, 'a').filter((o) => o.defaultSelected).map((o) => o.key), ['a:det-0', 'a:det-1']);
  assert.equal(buildPhotoLayout(project, 'a').added.length, 2);
});

test('multi-view transport scales each photo box independently and only scales the anchor homography', () => {
  const project = fixture();
  const proposal = project.photos[0].roomProposal;
  const raw = { anchor_photo_id: 'a', room_proposal: { ...proposal, imageToFloor: [1,0,0,0,1,0,0,0,1] }, views: project.photos.map((p, i) => ({
    photo_id: p.id, image_dimensions: { width: i === 1 ? 160 : 320, height: i === 1 ? 120 : 240 }, analyzed: true,
    detections: p.detections.map((d) => ({ ...d, box: [10, 10, 50, 60] })),
  })) };
  const result = parseRoomViewsResponse(raw, project.photos);
  assert.deepEqual(result.updates[0].detections[0].box, [20,20,100,120]);
  assert.deepEqual(result.updates[1].detections[0].box, [40,40,200,240]);
  assert.equal(result.roomProposal.imageToFloor[0], .5);
  assert.deepEqual(result.roomProposal.furniture[1].centerXZ, [1.5,2]);
  const bad = structuredClone(raw); bad.room_proposal.furniture[1].photoId = 'c';
  assert.throws(() => parseRoomViewsResponse(bad, project.photos));
  const missing = structuredClone(raw); missing.room_proposal.multiView.views.pop();
  assert.throws(() => parseRoomViewsResponse(missing, project.photos));
});

test('source-photo links survive JSON export, project fork, build undo and photo removal', () => {
  const project = fixture();
  const draft = buildPhotoLayout(project, 'a');
  project.items = draft.items;
  const restored = parseProjectJson(exportProjectJson(project));
  assert.equal(restored.items.find((i) => i.photoId === 'b').detectionId, 'det-0');
  const document = migrateLegacyProject(restored);
  const forked = forkDocument(document).document;
  const anchor = forked.scene.captures.find((c) => c.roomProposal?.multiView);
  assert.ok(anchor.roomProposal.multiView.views.every((v) => forked.scene.captures.some((c) => c.id === v.photoId)));
  assert.equal(anchor.roomProposal.multiView.anchorPhotoId, anchor.id);
  assert.ok(anchor.roomProposal.furniture.every((p) => forked.scene.captures.some((c) => c.id === p.photoId)));
  useAppStore.setState({ projects: [fixture()], activeProjectId: project.id, history: [], historyIndex: -1 });
  // makeProject creates a different project ID; select the actual fixture.
  useAppStore.setState({ activeProjectId: useAppStore.getState().projects[0].id });
  useAppStore.getState().buildRoomFromPhoto('a');
  assert.equal(useAppStore.getState().activeProject().items.length, 2);
  useAppStore.getState().undo();
  assert.equal(useAppStore.getState().activeProject().items.length, 0);
  useAppStore.getState().redo();
  assert.equal(useAppStore.getState().activeProject().items.length, 2);
  useAppStore.getState().removePhoto('b');
  const remaining = useAppStore.getState().activeProject();
  assert.equal(remaining.photos[0].roomProposal.multiView.views.some((v) => v.photoId === 'b'), false);
  assert.doesNotThrow(() => parseProjectJson(exportProjectJson(remaining)));
});

test('an empty room can still open with supported geometry when no furniture is recognized', () => {
  const project = fixture();
  project.photos = [project.photos[0]];
  project.photos[0].detections = [];
  const proposal = project.photos[0].roomProposal;
  delete proposal.multiView;
  proposal.furniture = [];
  proposal.widthM = 4;
  proposal.depthM = 3;
  const result = buildPhotoLayout(project, 'a');
  assert.equal(result.added.length, 0);
  assert.equal(result.room.width, 4);
  assert.equal(result.room.depth, 3);
  assert.equal(result.room.dimensionSources.width, 'model-estimated');
});
