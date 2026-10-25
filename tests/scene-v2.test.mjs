import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument,
  newPhysicalItem,
  applyCommand,
  activeLayout,
  evidence,
  roomSceneSchema,
  migrateLegacyProject,
  toLegacyProject,
  placementWarnings,
  walkPathClear,
  undoScene,
  redoScene,
  footprintContained,
  bresenham,
  referencedAssets,
} from '../packages/scene-domain/src/index.ts';
import { createSampleProjects } from '../packages/scene-domain/src/legacy/catalog.ts';
const apply = (s, c) => {
  const result = applyCommand(s, c);
  assert.equal(result.ok, true, result.message);
  return result.value;
};
const fixture = () => {
  let s = createDocument('Test', 6, 5, 2.8).scene;
  const i = newPhysicalItem('chair');
  s = apply(s, { type: 'add-item', item: i });
  return { s, i };
};
const pose = (id, x = 3, z = 2) => ({
  physicalItemId: id,
  floorCenterXM: x,
  floorCenterZM: z,
  yawRad: 0,
  locked: false,
});
test('v2 documents separate physical inventory from placements', () => {
  const { s, i } = fixture();
  assert.equal(s.items.length, 1);
  assert.equal(activeLayout(s).placements.length, 0);
  const placed = apply(s, { type: 'place', placement: pose(i.id) });
  const returned = apply(placed, { type: 'unplace', id: i.id });
  assert.equal(returned.items[0].id, i.id);
  assert.equal(activeLayout(returned).placements.length, 0);
});
test('dimensions have independent sources and stay shared across alternatives', () => {
  let { s, i } = fixture();
  s = apply(s, { type: 'place', placement: pose(i.id) });
  s = apply(s, { type: 'save-layout', name: 'Alternative' });
  s = apply(s, {
    type: 'edit-item',
    id: i.id,
    changes: { width: evidence(0.9, 'user-measured', true) },
  });
  assert.equal(s.items[0].depth.source, 'category-prior');
  s = apply(s, { type: 'load-layout', id: s.layouts[1].id });
  assert.equal(s.items[0].width.meters, 0.9);
  assert.equal(s.items[0].width.source, 'user-measured');
});
test('fixed fixtures have identical locked poses in every layout', () => {
  let { s, i } = fixture();
  s = apply(s, { type: 'place', placement: pose(i.id) });
  s = apply(s, { type: 'fixed', id: i.id, fixed: true });
  s = apply(s, { type: 'save-layout', name: 'Other' });
  assert.deepEqual(s.layouts[0].placements, s.layouts[1].placements);
  assert.equal(applyCommand(s, { type: 'unplace', id: i.id }).ok, false);
  assert.equal(
    applyCommand(s, { type: 'place', placement: pose(i.id, 4, 4) }).ok,
    false,
  );
  assert.equal(
    applyCommand(s, { type: 'lock', id: i.id, locked: false }).ok,
    false,
  );
});
test('fixed fixture invariants reject inconsistent imports', () => {
  let { s, i } = fixture();
  s = apply(s, { type: 'place', placement: pose(i.id) });
  s = apply(s, { type: 'fixed', id: i.id, fixed: true });
  s = apply(s, { type: 'save-layout', name: 'Other' });
  s.layouts[1].placements[0].floorCenterXM++;
  assert.equal(roomSceneSchema.safeParse(s).success, false);
});
test('a locked placement cannot move, resize or return to the tray', () => {
  let { s, i } = fixture();
  s = apply(s, { type: 'place', placement: pose(i.id) });
  s = apply(s, { type: 'lock', id: i.id, locked: true });
  for (const command of [
    { type: 'place', placement: pose(i.id, 4, 4) },
    { type: 'edit-item', id: i.id, changes: { width: evidence(2) } },
    { type: 'unplace', id: i.id },
  ])
    assert.equal(applyCommand(s, command).ok, false);
});
test('shrinking a shell flags a measured piece without silently resizing it', () => {
  let { s, i } = fixture();
  s = apply(s, { type: 'place', placement: pose(i.id, 5, 2) });
  s = apply(s, {
    type: 'room',
    changes: {
      floorPolygonXZ: [
        [0, 0],
        [3, 0],
        [3, 5],
        [0, 5],
      ],
      openings: [],
    },
  });
  assert.equal(s.items[0].width.meters, i.width.meters);
  assert.ok(
    placementWarnings(s, activeLayout(s).placements[0]).some((m) =>
      m.includes('boundary'),
    ),
  );
});
test('concave containment checks edges and not only furniture corners', () => {
  const boundary = [
    [0, 0],
    [5, 0],
    [5, 5],
    [3, 5],
    [3, 2],
    [2, 2],
    [2, 5],
    [0, 5],
  ];
  assert.equal(
    footprintContained(
      [
        [1, 1],
        [4, 1],
        [4, 4],
        [1, 4],
      ],
      boundary,
    ),
    false,
  );
});
test('invalid, repeated and self-intersecting boundaries are rejected', () => {
  for (const floor of [
    [
      [0, 0],
      [0, 0],
      [4, 4],
    ],
    [
      [0, 0],
      [4, 4],
      [4, 0],
      [0, 4],
    ],
  ]) {
    const s = createDocument().scene;
    s.floorPolygonXZ = floor;
    assert.equal(roomSceneSchema.safeParse(s).success, false);
  }
});
test('openings cannot escape their wall or ceiling', () => {
  const s = createDocument().scene;
  s.openings[0].offsetM = 99;
  assert.equal(roomSceneSchema.safeParse(s).success, false);
  s.openings[0].offsetM = 0;
  s.openings[0].heightM = 99;
  assert.equal(roomSceneSchema.safeParse(s).success, false);
});
test('walking rejects a path that crosses furniture', () => {
  let { s, i } = fixture();
  s = apply(s, { type: 'place', placement: pose(i.id, 3, 2.5) });
  assert.equal(walkPathClear(s, [1, 2.5], [5, 2.5]), false);
  assert.equal(walkPathClear(s, [1, 4], [5, 4]), true);
});
test('undo/redo preserve data while scene revisions always advance', () => {
  const { s, i } = fixture(),
    h = { past: [createDocument('Old', 6, 5, 2.8).scene], future: [] };
  const undo = undoScene(s, h);
  assert.equal(undo.ok, true);
  assert.ok(undo.value.scene.revision > s.revision);
  const redo = redoScene(undo.value.scene, undo.value.history);
  assert.equal(redo.ok, true);
  assert.equal(redo.value.scene.items[0].id, i.id);
  assert.ok(redo.value.scene.revision > undo.value.scene.revision);
});
test('legacy migration retains poses and independent shared dimensions', () => {
  const legacy = createSampleProjects()[0],
    doc = migrateLegacyProject(legacy),
    restored = toLegacyProject(doc);
  assert.equal(doc.scene.schemaVersion, 2);
  assert.equal(restored.items.length, legacy.items.length);
  for (const i of legacy.items) {
    const r = restored.items.find((r) => r.id === i.id);
    assert.equal(r.x, i.x);
    assert.equal(r.z, i.z);
    assert.ok(Math.abs((((r.rotation - i.rotation) % 360) + 360) % 360) < 1e-8);
  }
});
const withObservation = () => {
  let { s, i } = fixture();
  s = apply(s, {
    type: 'add-capture',
    capture: {
      id: 'capture-test',
      originalAssetId: 'asset-test',
      name: 'Test',
      width: 100,
      height: 100,
      createdAt: new Date().toISOString(),
      qualityWarnings: [],
      mapping: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      status: 'idle',
    },
  });
  const o = {
    id: 'obs-test',
    captureImageId: 'capture-test',
    originalLabel: 'chair',
    category: 'chair',
    source: 'manual',
    coordinateSpace: 'oriented-source-image',
    boxPx: [10, 10, 20, 20],
    mask: { revision: 0, polygons: [], strokes: [], expansionPx: 0 },
    ignored: false,
    fixed: false,
    reviewed: false,
  };
  s = apply(s, { type: 'observation', observation: o });
  return { s, i, o };
};
test('the same observation is linked to exactly one physical piece', () => {
  let { s, i, o } = withObservation();
  s = apply(s, { type: 'link-observation', itemId: i.id, observationId: o.id });
  assert.equal(
    applyCommand(s, { type: 'extract', observationId: o.id }).ok,
    false,
  );
  assert.equal(s.items.length, 1);
});
test('identity review merges observations without replacing kept measurements', () => {
  let { s, i, o } = withObservation();
  s = apply(s, {
    type: 'edit-item',
    id: i.id,
    changes: { width: evidence(1.2, 'user-measured', true) },
  });
  s = apply(s, { type: 'extract', observationId: o.id });
  const duplicate = s.items.find((item) => item.id !== i.id);
  s = apply(s, { type: 'merge', keepId: i.id, removeIds: [duplicate.id] });
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].width.meters, 1.2);
  assert.deepEqual(s.items[0].observationIds, [o.id]);
});
test('removing source evidence detaches observation IDs without deleting furniture', () => {
  let { s, i, o } = withObservation();
  s = apply(s, { type: 'link-observation', itemId: i.id, observationId: o.id });
  s = apply(s, { type: 'remove-capture', id: o.captureImageId });
  assert.equal(s.items.length, 1);
  assert.deepEqual(s.items[0].observationIds, []);
  assert.equal(s.observations.length, 0);
});
test('mask strokes must use finite source-image pixel coordinates', () => {
  let { s, o } = withObservation();
  o.mask.strokes = [{ tool: 'paint', radius: 10, points: [[500, 500]] }];
  assert.equal(
    applyCommand(s, { type: 'observation', observation: o }).ok,
    false,
  );
});
test('duplication creates a distinct item without claiming original photo identity', () => {
  let { s, i, o } = withObservation();
  s = apply(s, { type: 'link-observation', itemId: i.id, observationId: o.id });
  s = apply(s, { type: 'duplicate', id: i.id, newId: 'distinct' });
  assert.equal(s.items[1].id, 'distinct');
  assert.deepEqual(s.items[1].observationIds, []);
});
test('referenced assets include originals and omit expiring access URLs', () => {
  const { s } = withObservation();
  const doc = { ...createDocument(), scene: s };
  assert.deepEqual(referencedAssets(doc), ['asset-test']);
});
test('Bresenham covers both endpoints with bounded integer steps', () => {
  const points = bresenham(2, 8, 12, 1);
  assert.deepEqual(points[0], [2, 8]);
  assert.deepEqual(points.at(-1), [12, 1]);
  assert.equal(points.length, 11);
});

test('forked projects remap globally unique capture and media identities', async () => {
  const { forkDocument } = await import('../packages/scene-domain/src/fork.ts');
  let { s, i, o } = withObservation();
  s = apply(s, { type: 'link-observation', itemId: i.id, observationId: o.id });
  s = apply(s, {
    type: 'edit-item',
    id: i.id,
    changes: {
      width: evidence(1.5, 'user-measured', true, [o.captureImageId]),
    },
  });
  const doc = { ...createDocument(), scene: s },
    copy = forkDocument(doc);
  assert.notEqual(copy.document.id, doc.id);
  assert.notEqual(copy.document.scene.captures[0].id, s.captures[0].id);
  assert.equal(
    copy.document.scene.observations[0].captureImageId,
    copy.document.scene.captures[0].id,
  );
  assert.equal(copy.document.scene.items[0].width.meters, 1.5);
  assert.equal(
    copy.document.scene.items[0].width.evidenceIds[0],
    copy.document.scene.captures[0].id,
  );
  assert.notEqual(
    copy.document.scene.captures[0].originalAssetId,
    s.captures[0].originalAssetId,
  );
  assert.equal(roomSceneSchema.safeParse(copy.document.scene).success, true);
  assert.equal(doc.scene.captures[0].id, o.captureImageId);
});
test('floor calibration rejects crossed and concave corner order', async () => {
  const { floorHomography, mapFloorPoint } =
    await import('../packages/scene-domain/src/calibration.ts');
  for (const corners of [
    [
      [0, 0],
      [100, 100],
      [100, 0],
      [0, 100],
    ],
    [
      [0, 0],
      [100, 0],
      [30, 20],
      [0, 100],
    ],
  ])
    assert.equal(floorHomography(corners, 5, 4).ok, false);
  const result = floorHomography(
    [
      [10, 10],
      [90, 10],
      [100, 100],
      [0, 100],
    ],
    5,
    4,
  );
  assert.equal(result.ok, true);
  assert.ok(Math.abs(mapFloorPoint(result.value, [90, 10])[0] - 5) < 1e-8);
});

test('scene comparison survives PostgreSQL JSONB record key ordering',async()=>{const{canonicalJson}=await import('../packages/scene-domain/src/serialization.ts');const scene=createDocument().scene,reordered=JSON.parse(JSON.stringify(scene));reordered.dimensionEvidence={depth:scene.dimensionEvidence.depth,width:scene.dimensionEvidence.width};assert.equal(canonicalJson(scene),canonicalJson(reordered));reordered.height.meters+=.1;assert.notEqual(canonicalJson(scene),canonicalJson(reordered));});
