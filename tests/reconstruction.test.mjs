import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeLayout,
  applyRoomReconstruction,
  bounds,
  createDocument,
  evidence,
  mapFloorPoint,
  migrateLegacyProject,
  newPhysicalItem,
  projectDocumentSchema,
  roomReconstructionProposalSchema,
  toLegacyProject,
} from '../packages/scene-domain/src/index.ts';
import { makeProject } from '../src/domain/catalog.ts';
import { validatePhoto, validateRoom } from '../src/domain/validation.ts';

const proposal = (changes = {}) => ({
  status: 'estimated', source: 'model-estimated', method: 'depth-floor-plane',
  partial: true, confidence: 'low',
  floorCornersPx: [[0, 0], [1000, 0], [1000, 800], [0, 800]],
  floorPolygonXZ: [[0, 0], [5, 0], [5, 4], [0, 4]],
  widthM: 5, depthM: 4, heightM: 2.6,
  imageToFloor: [0.005, 0, 0, 0, 0.005, 0, 0, 0, 1],
  camera: { fx: 900, fy: 900, cx: 500, cy: 400, source: 'fov-assumption' },
  boundaryEdges: ['observed-wall', 'view-limit', 'view-limit', 'observed-wall'],
  warnings: ['Only the visible floor extent is estimated.'], ...changes,
});
const captureId = 'capture-reconstruction';
const fixture = (changes = {}) => {
  const document = createDocument('Reconstruction', 6, 5, 3);
  document.scene.openings = [];
  document.scene.captures.push({
    id: captureId, originalAssetId: 'source-image', name: 'Room photo',
    width: 1000, height: 800, createdAt: document.createdAt, qualityWarnings: [],
    mapping: { scaleX: 0.5, scaleY: 0.5, offsetX: 0, offsetY: 0 }, status: 'review',
    roomProposal: proposal(changes),
  });
  return document;
};
const anchor = { pointsPx: [[100, 200], [300, 200]], lengthM: 2 };
const openingCandidate = {
  id: 'candidate-a', kind: 'unclassified', boxPx: [100, 20, 100, 300],
  wallIndex: 0, offsetM: 0.5, widthM: 0.8, heightM: 2, sillHeightM: 0,
  requiresReview: true,
};

test('unanchored reconstruction accepts source pixels and preserves a pure input document', () => {
  const document = fixture(), before = structuredClone(document), result = applyRoomReconstruction(document, captureId);
  assert.equal(result.ok, true);
  assert.deepEqual(document, before);
  assert.equal(result.value.scene.revision, document.scene.revision + 1);
  assert.deepEqual(bounds(result.value.scene), { minX: 0, minZ: 0, width: 5, depth: 4 });
  assert.equal(result.value.scene.dimensionEvidence.width.source, 'model-estimated');
  assert.equal(result.value.scene.height.source, 'model-estimated');
  assert.deepEqual(result.value.scene.captures[0].roomProposal, before.scene.captures[0].roomProposal);
  assert.deepEqual(result.value.scene.captures[0].floorReview.cornersPx, proposal().floorCornersPx);
  assert.deepEqual(mapFloorPoint(result.value.scene.captures[0].floorReview.homography, [1000, 800]), [5, 4]);
});

test('a known source-image floor distance calibrates all proposed world dimensions and H', () => {
  const result = applyRoomReconstruction(fixture(), captureId, { scaleAnchor: anchor });
  assert.equal(result.ok, true);
  assert.equal(bounds(result.value.scene).width, 10);
  assert.equal(bounds(result.value.scene).depth, 8);
  assert.equal(result.value.scene.height.meters, 5.2);
  for (const dimension of [result.value.scene.dimensionEvidence.width, result.value.scene.dimensionEvidence.depth, result.value.scene.height])
    assert.equal(dimension.source, 'calibrated-estimate');
  const review = result.value.scene.captures[0].floorReview;
  assert.deepEqual(mapFloorPoint(review.homography, [1000, 800]), [10, 8]);
  assert.equal(review.widthM, undefined);
});

test('calibration rejects zero distances, nonfinite values, and outside-image or outside-floor points', () => {
  for (const scaleAnchor of [
    { ...anchor, lengthM: 0 }, { ...anchor, lengthM: Infinity },
    { ...anchor, pointsPx: [[100, 200], [100, 200]] },
    { ...anchor, pointsPx: [[-1, 200], [300, 200]] },
    { ...anchor, pointsPx: [[100, 200], [1001, 200]] },
    { ...anchor, pointsPx: [[NaN, 200], [300, 200]] },
  ]) assert.equal(applyRoomReconstruction(fixture(), captureId, { scaleAnchor }).ok, false);
  const smallFloor = fixture({ floorPolygonXZ: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  assert.match(applyRoomReconstruction(smallFloor, captureId, { scaleAnchor: anchor }).message, /floor/);
  const missingH = fixture(); delete missingH.scene.captures[0].roomProposal.imageToFloor;
  assert.match(applyRoomReconstruction(missingH, captureId, { scaleAnchor: anchor }).message, /mapping/);
  const horizon = fixture({ imageToFloor: [1, 0, 0, 0, 1, 0, 0, 0, 0] });
  assert.equal(applyRoomReconstruction(horizon, captureId, { scaleAnchor: anchor }).ok, false);
});

test('measured dimensions survive estimates and anchors until replacement is explicitly requested', () => {
  const document = fixture();
  document.scene.dimensionEvidence.width = evidence(6, 'user-measured', true);
  document.scene.height = evidence(3, 'user-measured', true);
  const result = applyRoomReconstruction(document, captureId, { scaleAnchor: anchor });
  assert.equal(result.ok, true);
  assert.equal(bounds(result.value.scene).width, 6);
  assert.equal(bounds(result.value.scene).depth, 8);
  assert.deepEqual(result.value.scene.dimensionEvidence.width, document.scene.dimensionEvidence.width);
  assert.deepEqual(result.value.scene.height, document.scene.height);
  assert.equal(applyRoomReconstruction(document, captureId, { widthM: 7 }).ok, false);
  const replaced = applyRoomReconstruction(document, captureId, { widthM: 7, heightM: 3.2, overwriteMeasured: true });
  assert.equal(replaced.ok, true);
  assert.equal(bounds(replaced.value.scene).width, 7);
  assert.equal(replaced.value.scene.height.meters, 3.2);
  assert.equal(replaced.value.scene.height.source, 'user-measured');
});

test('explicit dimensions alone receive measurement provenance and an intact measured boundary is protected', () => {
  const result = applyRoomReconstruction(fixture(), captureId, { widthM: 7, heightM: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.value.scene.dimensionEvidence.width.source, 'user-measured');
  assert.equal(result.value.scene.dimensionEvidence.depth.source, 'model-estimated');
  const document = fixture();
  document.scene.boundarySource = 'user-measured';
  const preserved = applyRoomReconstruction(document, captureId);
  assert.equal(preserved.ok, true);
  assert.deepEqual(preserved.value.scene.floorPolygonXZ, document.scene.floorPolygonXZ);
  assert.equal(preserved.value.scene.boundarySource, 'user-measured');
  assert.equal(preserved.value.scene.dimensionEvidence.width.source, 'user-measured');
  const specified = fixture();
  specified.scene.height = evidence(3, 'product-specification', true);
  assert.deepEqual(applyRoomReconstruction(specified, captureId).value.scene.height, specified.scene.height);
});

test('stale reviews, missing estimates and old placeholder suggestions return actionable failures', () => {
  assert.match(applyRoomReconstruction(fixture(), captureId, { expectedRevision: 42 }).message, /changed/);
  const document = fixture(); delete document.scene.captures[0].roomProposal;
  assert.match(applyRoomReconstruction(document, captureId).message, /no usable room estimate/);
  document.scene.captures[0].roomProposal = { source: 'placeholder', floorCornersPx: [], warnings: [] };
  assert.equal(applyRoomReconstruction(document, captureId).ok, false);
  const unavailable = fixture({ status: 'insufficient-evidence', source: 'unavailable' });
  assert.equal(applyRoomReconstruction(unavailable, captureId).ok, false);
});

test('furniture dimensions, all placements and layouts remain intact when the new boundary conflicts', () => {
  const document = fixture(), item = newPhysicalItem('bed');
  document.scene.items.push(item);
  activeLayout(document.scene).placements.push({ physicalItemId: item.id, floorCenterXM: 5.5, floorCenterZM: 4.5, yawRad: 0.2, locked: true });
  document.scene.layouts.push({ ...structuredClone(activeLayout(document.scene)), id: 'saved-layout' });
  const result = applyRoomReconstruction(document, captureId);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.scene.items, document.scene.items);
  assert.deepEqual(result.value.scene.layouts, document.scene.layouts);
  assert.ok(result.warnings.some((w) => w.includes('boundary')));
});

test('existing openings remain exact and shrinking beyond their bounds fails without deleting them', () => {
  const document = fixture(), opening = {
    id: 'measured-door', kind: 'door', wallIndex: 0, offsetM: 4.7, widthM: 1,
    heightM: 2, sillHeightM: 0, source: 'user-measured', openAngleDeg: 45,
  };
  document.scene.openings = [opening];
  const result = applyRoomReconstruction(document, captureId);
  assert.equal(result.ok, false);
  assert.match(result.message, /opening.*beyond/i);
  assert.deepEqual(document.scene.openings, [opening]);
  const fits = applyRoomReconstruction(document, captureId, { widthM: 6 });
  assert.equal(fits.ok, true);
  assert.deepEqual(fits.value.scene.openings, [opening]);
  const replaced = applyRoomReconstruction(document, captureId, { replaceOpenings: true });
  assert.equal(replaced.ok, true);
  assert.deepEqual(replaced.value.scene.openings, []);
});

test('unclassified image candidates require both explicit selection and a door/window label', () => {
  const document = fixture({ openings: [openingCandidate] });
  assert.deepEqual(applyRoomReconstruction(document, captureId).value.scene.openings, []);
  assert.deepEqual(applyRoomReconstruction(document, captureId, { openingKinds: { 'candidate-a': 'door' } }).value.scene.openings, []);
  assert.equal(applyRoomReconstruction(document, captureId, { selectedOpeningIds: ['candidate-a'] }).ok, false);
  const applied = applyRoomReconstruction(document, captureId, {
    scaleAnchor: anchor, selectedOpeningIds: ['candidate-a'], openingKinds: { 'candidate-a': 'door' },
  });
  assert.equal(applied.ok, true);
  const opening = applied.value.scene.openings[0];
  assert.equal(opening.kind, 'door');
  assert.equal(opening.widthM, 1.6);
  assert.equal(opening.heightM, 4);
  assert.equal(opening.offsetM, 1);
  assert.equal(opening.source, 'calibrated-estimate');
});

test('full proposal metadata and room dimension sources survive legacy validation and migration', () => {
  const project = makeProject('Portable reconstruction', 6, 5, 3);
  project.room.dimensionSources = { width: 'user-measured', depth: 'calibrated-estimate', height: 'model-estimated' };
  project.photos = [{
    id: captureId, uri: 'data:image/jpeg;base64,YQ==', width: 1000, height: 800,
    name: 'Room', detections: [], analysisStatus: 'complete', roomProposal: proposal({ openings: [openingCandidate] }),
  }];
  assert.deepEqual(validatePhoto(project.photos[0]).roomProposal, project.photos[0].roomProposal);
  assert.deepEqual(validateRoom(project.room).dimensionSources, project.room.dimensionSources);
  const document = migrateLegacyProject(project);
  assert.deepEqual(document.scene.captures[0].roomProposal, project.photos[0].roomProposal);
  assert.deepEqual(toLegacyProject(document).room.dimensionSources, project.room.dimensionSources);
  assert.equal(projectDocumentSchema.safeParse(document).success, true);
});

test('proposal schema rejects malformed numeric fields and capture-bound coordinates', () => {
  for (const invalid of [
    proposal({ widthM: 0 }), proposal({ depthM: NaN }), proposal({ imageToFloor: [1, 2] }),
    proposal({ heightM: Infinity }), proposal({ boundaryEdges: ['observed-wall'] }),
    proposal({ openings: [{ ...openingCandidate, kind: 'door' }] }),
    proposal({ floorPolygonXZ: [[0, 0], [1, Infinity], [1, 1]] }),
    proposal({ floorPolygonXZ: [[0, 0], [2, 2], [0, 2], [2, 0]] }),
    proposal({ imageToFloor: [0, 0, 0, 0, 0, 0, 0, 0, 1] }),
  ]) assert.equal(roomReconstructionProposalSchema.safeParse(invalid).success, false);
  const document = fixture({ floorCornersPx: [[1001, 0]] });
  assert.equal(projectDocumentSchema.safeParse(document).success, false);
  assert.throws(() => validatePhoto({
    id: 'photo', name: 'Room', uri: 'data:image/jpeg;base64,YQ==', width: 1000, height: 800,
    detections: [], analysisStatus: 'complete', roomProposal: proposal({ openings: [{ ...openingCandidate, boxPx: [950, 0, 100, 10] }] }),
  }), /outside/);
  assert.equal(roomReconstructionProposalSchema.parse({ floorCornersPx: [], source: 'placeholder', warnings: [] }).status, 'insufficient-evidence');
});
