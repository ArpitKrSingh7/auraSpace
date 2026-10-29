import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRoomProposalToSource, reviewedRoomForWeb, roomReviewSignature } from '../src/services/reconstruction-core.ts';
import { mapFloorPoint } from '../packages/scene-domain/src/calibration.ts';
import { makeItem, makeProject } from '../src/domain/catalog.ts';
import { parseProjectJson, exportProjectJson } from '../src/domain/validation.ts';

const draft = () => ({
  status: 'estimated', source: 'model-estimated', method: 'test-pinhole', partial: true,
  confidence: 'low', floorCornersPx: [[10, 40], [180, 40], [180, 90], [10, 90]],
  floorPolygonXZ: [[0, 0], [8, 0], [8, 6], [0, 6]], widthM: 8, depthM: 6,
  imageToFloor: [.02, .001, -.2, .002, .03, -.3, .0001, .0002, 1],
  camera: { fx: 180, fy: 182, cx: 100, cy: 50, source: 'provided' },
  boundaryEdges: ['view-limit', 'observed-wall', 'observed-wall', 'view-limit'], warnings: [],
  openings: [{ id: 'rect-1', kind: 'unclassified', requiresReview: true,
    boxPx: [30, 10, 40, 20], wallIndex: 1, offsetM: 1, widthM: 1, heightM: 2, sillHeightM: 0 }],
});

test('analysis resize maps pixels, camera and projective H consistently to original photo', () => {
  const before = draft(), original = structuredClone(before);
  // Deliberately non-uniform scaling catches x/y column mixups and rounding effects.
  const mapped = mapRoomProposalToSource(before, { width: 200, height: 100 }, { width: 1000, height: 300 });
  assert.deepEqual(before, original);
  assert.deepEqual(mapped.floorCornersPx[0], [50, 120]);
  assert.deepEqual(mapped.openings[0].boxPx, [150, 30, 200, 60]);
  assert.deepEqual(mapped.camera, { fx: 900, fy: 546, cx: 500, cy: 150, source: 'provided' });
  for (const [u, v] of [[50, 80], [100, 60], [30, 90]]) {
    const expected = mapFloorPoint(before.imageToFloor, [u, v]);
    const actual = mapFloorPoint(mapped.imageToFloor, [u * 5, v * 3]);
    assert.ok(actual.every((n, i) => Math.abs(n - expected[i]) < 1e-10));
  }
  assert.deepEqual(mapped.floorPolygonXZ, before.floorPolygonXZ);
  assert.equal(mapped.widthM, 8);
});

test('invalid service image coordinates or mapping dimensions cannot become a saved draft', () => {
  for (const dimensions of [{ width: 0, height: 100 }, { width: NaN, height: 100 }])
    assert.throws(() => mapRoomProposalToSource(draft(), dimensions, { width: 1000, height: 500 }));
  const outside = draft(); outside.openings[0].boxPx = [190, 0, 40, 20];
  assert.throws(() => mapRoomProposalToSource(outside, { width: 200, height: 100 }, { width: 1000, height: 500 }), /outside/);
});

test('explicit web room adaptation preserves photos, items and existing measurements', () => {
  const project = makeProject('Web room', 6, 5, 3);
  project.room.dimensionSources = { width: 'user-measured', depth: 'category-prior', height: 'user-measured' };
  project.items = [makeItem('chair', { placed: true, x: 2, z: 2 })];
  project.photos = [{ id: 'source', uri: 'data:image/png;base64,YQ==', name: 'Room',
    width: 1000, height: 300, detections: [], analysisStatus: 'complete',
    roomProposal: mapRoomProposalToSource(draft(), { width: 200, height: 100 }, { width: 1000, height: 300 }),
  }];
  const before = structuredClone(project), result = reviewedRoomForWeb(project, 'source');
  assert.deepEqual(project, before);
  assert.equal(result.room.width, 6);
  assert.equal(result.room.depth, 6);
  assert.equal(result.room.height, 3);
  assert.equal(result.room.dimensionSources.depth, 'model-estimated');
  const persisted = parseProjectJson(exportProjectJson({ ...project, room: result.room }));
  assert.deepEqual(persisted.photos, project.photos);
  assert.deepEqual(persisted.items, project.items);
  assert.equal(persisted.room.dimensionSources.width, 'user-measured');
  assert.throws(() => reviewedRoomForWeb(project, 'missing'), /no longer/);
});

test('photo metadata changes do not invalidate review but room and furniture edits do', () => {
  const project = makeProject('Staleness'), signature = roomReviewSignature(project);
  project.updatedAt = new Date().toISOString();
  project.photos = [{ id: 'photo' }];
  assert.equal(roomReviewSignature(project), signature);
  project.room.width += .2;
  assert.notEqual(roomReviewSignature(project), signature);
  project.room.width -= .2;
  project.items = [makeItem('chair')];
  assert.notEqual(roomReviewSignature(project), signature);
});
