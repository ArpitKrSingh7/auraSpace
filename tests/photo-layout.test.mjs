import test from 'node:test';
import assert from 'node:assert/strict';
import { makeItem, makeProject } from '../src/domain/catalog.ts';
import { buildPhotoLayout, distinctPhotoDetections } from '../src/services/photo-layout.ts';
import { isInsideRoom, overlaps } from '../src/domain/geometry.ts';
import { parseProjectJson, exportProjectJson } from '../src/domain/validation.ts';
import { useAppStore } from '../src/store/useAppStore.ts';

function fixture(withDepth = true) {
  const project = makeProject('Photo layout', 3.05, 3.05, 2.8);
  project.room.openings = [];
  const detections = [
    { id: 'det-0', type: 'bed', label: 'bed', score: .99, box: [20, 240, 350, 260], color: '#b8a1bb' },
    { id: 'det-1', type: 'bed', label: 'bed', score: .86, box: [0, 400, 360, 320], color: '#e3d2a3' },
    { id: 'det-2', type: 'table', label: 'dining table', score: .26, box: [500, 380, 460, 230] },
    { id: 'det-3', type: 'chair', label: 'chair', score: .99, box: [520, 600, 320, 350] },
  ].map((d) => ({ ...d, source: 'model' }));
  project.photos = [{ id: 'room-photo', name: 'Room view', uri: 'data:image/png;base64,AAAA', width: 960, height: 1280, detections, analysisStatus: 'complete',
    ...(withDepth ? { roomProposal: { status: 'estimated', source: 'model-estimated', method: 'test-depth', partial: true, confidence: 'low', floorCornersPx: [], widthM: 6, depthM: 6,
      floorPolygonXZ: [[0, 0], [6, 0], [6, 6], [0, 6]], warnings: [], furniture: [
        { detectionIndex: 0, centerXZ: [1.7, 4.6], widthM: 1.6, depthM: 3.8, heightM: .9, rotationDeg: 270, method: 'depth-projected' },
        { detectionIndex: 1, centerXZ: [1.7, 2.3], widthM: 1.6, depthM: 3.8, heightM: .9, rotationDeg: 270, method: 'depth-projected' },
        { detectionIndex: 2, centerXZ: [5.2, 3.8], widthM: 1.8, depthM: 1.2, heightM: 1.4, rotationDeg: 0, method: 'depth-projected' },
        { detectionIndex: 3, centerXZ: [4.7, 1.9], widthM: 1, depthM: 1, heightM: 1.8, rotationDeg: 0, method: 'depth-projected' },
      ] } } : {}),
  }];
  return project;
}

test('a photo builds a furnished room with two distinct beds, a desk and a chair', () => {
  const project = fixture(), before = structuredClone(project);
  const result = buildPhotoLayout(project, 'room-photo', { widthM: 3.048, depthM: 3.048 });
  assert.deepEqual(project, before);
  assert.equal(result.added.length, 4);
  assert.equal(result.projectedCount, 4);
  assert.equal(result.room.width, 3.048);
  assert.equal(result.room.dimensionSources.width, 'user-measured');
  assert.equal(result.items.filter((i) => i.type === 'bed').length, 2);
  for (const item of result.items) {
    assert.equal(item.placed, true);
    assert.equal(isInsideRoom(item, result.room), true, item.name);
    assert.equal(result.items.some((other) => overlaps(item, other)), false, item.name);
  }
  assert.equal(result.items.find((i) => i.detectionId === 'det-0').color, '#b8a1bb');
});

test('missing floor evidence still produces a labelled image-composition starting layout', () => {
  const result = buildPhotoLayout(fixture(false), 'room-photo');
  assert.equal(result.added.length, 4);
  assert.equal(result.projectedCount, 0);
  assert.equal(result.room.width, 3.05);
  assert.equal(result.room.dimensionSources.width, 'category-prior');
  assert.ok(result.warnings.some((w) => w.includes('photo composition')));
  assert.ok(result.added.every((i) => i.placed));
});

test('one known room axis calibrates the other estimate without marking it as measured', () => {
  const result = buildPhotoLayout(fixture(), 'room-photo', { widthM: 3.048 });
  assert.equal(result.room.width, 3.048);
  assert.equal(result.room.depth, 3.048);
  assert.equal(result.room.dimensionSources.width, 'user-measured');
  assert.equal(result.room.dimensionSources.depth, 'calibrated-estimate');
});

test('review removes a conflicting table label without merging two separate beds', () => {
  const detections = fixture().photos[0].detections;
  const duplicate = { ...detections[1], id: 'wrong-table', type: 'table', label: 'dining table', score: .55 };
  const selected = distinctPhotoDetections([...detections, duplicate]);
  assert.equal(selected.length, 4);
  assert.equal(selected.filter((d) => d.type === 'bed').length, 2);
  assert.equal(selected.some((d) => d.id === 'wrong-table'), false);
  assert.equal(distinctPhotoDetections([...detections, { ...duplicate, source: 'manual' }]).length, 5);
});

test('unchecked observations are excluded and reapplying does not duplicate photo furniture', () => {
  const p = fixture(), options = { selectedIds: ['det-0', 'det-1', 'det-3'], widthM: 3.05, depthM: 3.05 };
  const first = buildPhotoLayout(p, 'room-photo', options);
  const second = buildPhotoLayout({ ...p, room: first.room, items: first.items }, 'room-photo', options);
  assert.equal(second.items.length, 3);
  assert.deepEqual(second.items.map((i) => i.id), first.items.map((i) => i.id));
  assert.ok(!second.items.some((i) => i.type === 'table'));
});

test('switching to a different view replaces photo suggestions instead of duplicating the room', () => {
  const p = fixture();
  const first = buildPhotoLayout(p, 'room-photo', { widthM: 3.05, depthM: 3.05 });
  const next = { ...p, room: first.room, items: first.items,
    photos: [...p.photos, { ...structuredClone(p.photos[0]), id: 'second-view' }] };
  const result = buildPhotoLayout(next, 'second-view');
  assert.equal(result.items.length, 4);
  assert.ok(result.items.every((item) => item.photoId === 'second-view'));
  assert.equal(result.items.filter((item) => item.type === 'bed').length, 2);
});

test('unrelated items, locked edits and individually measured dimensions are preserved', () => {
  const p = fixture();
  p.room.dimensionSources = { depth: 'user-measured' };
  const chair = makeItem('chair', { id: 'my-chair', photoId: 'room-photo', detectionId: 'det-3', placed: true, locked: true, x: 2.7, z: .4 });
  const unrelated = makeItem('plant', { id: 'my-plant', placed: true, x: .2, z: .2 });
  p.items = [chair, unrelated];
  const result = buildPhotoLayout(p, 'room-photo');
  assert.deepEqual(result.items.find((i) => i.id === chair.id), chair);
  assert.deepEqual(result.items.find((i) => i.id === unrelated.id), unrelated);
  assert.equal(result.items.filter((i) => i.detectionId === 'det-3').length, 1);
  assert.equal(result.room.depth, 3.05);
});

test('project exports retain furniture poses and detection colors', () => {
  const p = fixture(), result = buildPhotoLayout(p, 'room-photo', { widthM: 3.05, depthM: 3.05 });
  const imported = parseProjectJson(exportProjectJson({ ...p, room: result.room, items: result.items }));
  assert.equal(imported.items.length, 4);
  assert.equal(imported.photos[0].roomProposal.furniture.length, 4);
  assert.equal(imported.photos[0].detections[0].color, '#b8a1bb');
});

test('invalid sizes and an empty selection do not produce a misleading draft', () => {
  for (const options of [{ widthM: NaN }, { widthM: .5 }, { selectedIds: [] }])
    assert.throws(() => buildPhotoLayout(fixture(), 'room-photo', options));
});

test('applying a furnished photo draft is one undoable room-and-items operation', () => {
  const store = () => useAppStore.getState();
  store().createProject('Atomic draft', 3.05, 3.05, 2.8);
  store().updateRoom({ openings: [] });
  store().addPhoto(fixture().photos[0]);
  const before = structuredClone(store().activeProject());
  store().buildRoomFromPhoto('room-photo', { widthM: 3.048, depthM: 3.048 });
  assert.equal(store().activeProject().items.length, 4);
  assert.equal(store().viewMode, 'overview');
  store().undo();
  assert.deepEqual(store().activeProject().items, before.items);
  assert.deepEqual(store().activeProject().room, before.room);
  store().redo();
  assert.equal(store().activeProject().items.length, 4);
});
