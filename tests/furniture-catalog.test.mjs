import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeLayout, applyCommand, canStand, createDocument, evidence, getItemElevation,
  legacyItem, migrateLegacyProject, newPhysicalItem, observationSchema,
  physicalItemSchema, placementWarnings, projectDocumentSchema, roomFeedback,
  toLegacyProject, walkPathClear,
} from '../packages/scene-domain/src/index.ts';
import { CATALOG, createSampleProjects, makeItem, makeProject, makeRoom } from '../packages/scene-domain/src/legacy/catalog.ts';
import { FURNITURE_TYPES } from '../packages/scene-domain/src/legacy/types.ts';
import { getProjectWarnings, getRoomMetrics, overlaps, validatePlacement } from '../packages/scene-domain/src/legacy/geometry.ts';
import { exportProjectJson, parseProjectJson, validateDetection, validateItem } from '../src/domain/validation.ts';
import { furnitureType } from '../src/services/vision-core.ts';

const newNames = {
  wardrobe: 'Wardrobe / almirah', 'dressing-table': 'Dressing table',
  mirror: 'Wall mirror', 'air-conditioner': 'Split AC', 'ceiling-fan': 'Ceiling fan',
  desk: 'Study desk', 'bedside-table': 'Bedside table', bookshelf: 'Bookshelf',
  'shoe-rack': 'Shoe rack', 'tv-unit': 'TV unit', fridge: 'Refrigerator',
};
const pose = (id, x = 2, z = 2) => ({
  physicalItemId: id, floorCenterXM: x, floorCenterZM: z, yawRad: 0, locked: false,
});
const sceneWith = (...items) => {
  const scene = createDocument('Furniture', 6, 5, 2.8).scene;
  scene.openings = [];
  scene.items = items;
  activeLayout(scene).placements = items.map((i) => pose(i.id));
  return scene;
};
const placed = (type, overrides = {}) => makeItem(type, { x: 2, z: 2, placed: true, ...overrides });

test('every furniture category has one editable catalog prior and accepts manual correction', () => {
  assert.equal(FURNITURE_TYPES.length, 19);
  assert.deepEqual(new Set(CATALOG.map((entry) => entry.type)), new Set(FURNITURE_TYPES));
  assert.equal(CATALOG.length, FURNITURE_TYPES.length);
  for (const type of FURNITURE_TYPES) {
    const item = makeItem(type), physical = newPhysicalItem(type);
    assert.equal(item.type, type);
    assert.equal(validateItem(item).type, type);
    assert.equal(physicalItemSchema.parse(physical).category, type);
    assert.equal(observationSchema.shape.category.parse(type), type);
    assert.equal(validateDetection({ id: 'manual', label: item.name, type, score: 1, box: [0, 0, 10, 10], source: 'manual' }, 100, 100).type, type);
    for (const dimension of ['width', 'depth', 'height']) {
      assert.ok(item[dimension] > 0 && item[dimension] <= 12);
      assert.equal(physical[dimension].source, 'category-prior');
      assert.equal(physical[dimension].reviewed, false);
    }
    if (newNames[type]) assert.equal(item.name, newNames[type]);
  }
});

test('wall and ceiling defaults use bottom elevations and the actual room height', () => {
  for (const [type, mounting, expected] of [
    ['desk', 'floor', 0], ['mirror', 'wall', 1],
    ['air-conditioner', 'wall', 2.1], ['ceiling-fan', 'ceiling', 2.35],
  ]) {
    const item = makeItem(type);
    assert.equal(item.mounting, mounting);
    assert.ok(Math.abs(getItemElevation(item, 2.8) - expected) < 1e-9);
    assert.ok(Math.abs(getItemElevation(legacyItem(newPhysicalItem(type)), 2.8) - expected) < 1e-9);
  }
  const fan = makeItem('ceiling-fan', { elevationM: 0.7 });
  assert.equal(getItemElevation(fan), 0.7);
  assert.equal(getItemElevation(fan, 3.45), 3);
  assert.equal(getItemElevation(fan, 0.2), 0);
});

test('legacy items without mount fields and old canonical documents retain floor placement', () => {
  const project = makeProject('Old furniture');
  const old = placed('chair');
  delete old.mounting;
  delete old.elevationM;
  project.items = [old];
  const imported = parseProjectJson(exportProjectJson(project));
  assert.equal(getItemElevation(imported.items[0], project.room.height), 0);
  const doc = migrateLegacyProject(imported);
  delete doc.scene.items[0].mounting;
  delete doc.scene.items[0].elevationM;
  const restored = toLegacyProject(projectDocumentSchema.parse(doc));
  assert.equal(restored.items[0].mounting, 'floor');
  assert.equal(restored.items[0].elevationM, 0);
  assert.equal(getItemElevation(restored.items[0], restored.room.height), 0);
});

test('mounting and elevation survive portable JSON, migration and saved layouts', () => {
  const project = makeProject('Mounted furniture');
  project.items = [placed('air-conditioner', { elevationM: 2.25 }), placed('ceiling-fan')];
  project.layouts = [{ id: 'saved', name: 'Saved', createdAt: project.createdAt, items: structuredClone(project.items) }];
  const portable = parseProjectJson(exportProjectJson(project));
  const doc = projectDocumentSchema.parse(JSON.parse(JSON.stringify(migrateLegacyProject(portable))));
  const restored = toLegacyProject(doc);
  for (const source of [restored.items, restored.layouts.find((l) => l.id === 'saved').items])
    for (const expected of project.items) {
      const actual = source.find((i) => i.id === expected.id);
      assert.equal(actual.mounting, expected.mounting);
      assert.equal(actual.elevationM, expected.elevationM);
    }
});

test('both formats reject unsupported mountings and non-finite or out-of-range elevations', () => {
  for (const changes of [
    { mounting: 'floating' }, { elevationM: -0.01 }, { elevationM: 12.01 },
    { elevationM: NaN }, { elevationM: Infinity },
  ]) {
    assert.throws(() => validateItem({ ...makeItem('desk'), ...changes }));
    assert.equal(physicalItemSchema.safeParse({ ...newPhysicalItem('desk'), ...changes }).success, false);
  }
  for (const elevationM of [0, 12]) {
    assert.equal(validateItem(makeItem('mirror', { elevationM })).elevationM, elevationM);
    assert.equal(physicalItemSchema.parse({ ...newPhysicalItem('mirror'), elevationM }).elevationM, elevationM);
  }
});

test('vertical intervals allow ground furniture below AC and fans but catch tall furniture', () => {
  for (const [type, shortHeight, tallHeight] of [
    ['air-conditioner', 2.1, 2.2], ['ceiling-fan', 2.35, 2.5],
  ]) {
    const fixture = placed(type), low = placed('wardrobe', { height: shortHeight }),
      tall = placed('wardrobe', { height: tallHeight });
    assert.equal(overlaps(fixture, low, 2.8), false);
    assert.equal(overlaps(fixture, tall, 2.8), true);
    const room = makeRoom(6, 5, 2.8);
    room.openings = [];
    assert.equal(validatePlacement(fixture, room, [fixture, low]).some((w) => w.includes('Overlaps')), false);
    assert.equal(validatePlacement(fixture, room, [fixture, tall]).some((w) => w.includes('Overlaps')), true);
    const physical = newPhysicalItem(type), cupboard = newPhysicalItem('wardrobe');
    cupboard.height = evidence(shortHeight, 'user-measured', true);
    const scene = sceneWith(physical, cupboard);
    assert.equal(placementWarnings(scene, pose(physical.id)).some((w) => w.includes('Overlaps')), false);
    cupboard.height.meters = tallHeight;
    assert.equal(placementWarnings(scene, pose(physical.id)).some((w) => w.includes('Overlaps')), true);
  }
});

test('door clearance and open leaves only warn when their vertical volumes intersect', () => {
  const project = makeProject('Door heights', 6, 5, 2.8);
  project.room.openings = [{ id: 'back-door', kind: 'door', wall: 'back', offset: 2, width: 1, height: 2.1, sillHeight: 0, hingeSide: 'start', swingDirection: 'inward', openAngleDeg: 90 }];
  for (const [type, elevationM, expected] of [
    ['air-conditioner', 2.1, false], ['air-conditioner', 2, true],
    ['mirror', 1, true], ['ceiling-fan', 0, false],
  ]) {
    const item = placed(type, { x: 2, z: 0.5, elevationM });
    project.items = [item];
    const legacyWarnings = validatePlacement(item, project.room, [item]);
    const scene = migrateLegacyProject(project).scene;
    const canonicalWarnings = placementWarnings(scene, activeLayout(scene).placements[0]);
    for (const warnings of [legacyWarnings, canonicalWarnings]) {
      assert.equal(warnings.some((w) => w.includes('doorway clearance')), expected, `${type}: clearance ${warnings}`);
      assert.equal(warnings.some((w) => w.includes('open door')), expected, `${type}: leaf ${warnings}`);
    }
  }
});

test('window leaves distinguish furniture below, through and above the opening', () => {
  const project = makeProject('Window heights', 6, 5, 2.8);
  project.room.openings = [{ id: 'window', kind: 'window', wall: 'back', offset: 2, width: 1, height: 1, sillHeight: 0.9, hingeSide: 'start', swingDirection: 'inward', openAngleDeg: 90 }];
  for (const [type, expected] of [['desk', false], ['mirror', true], ['air-conditioner', false]]) {
    const item = placed(type, { x: 2, z: 0.5 });
    project.items = [item];
    const scene = migrateLegacyProject(project).scene;
    for (const warnings of [validatePlacement(item, project.room, [item]), placementWarnings(scene, activeLayout(scene).placements[0])])
      assert.equal(warnings.some((w) => w.includes('open window')), expected, `${type}: ${warnings}`);
  }
});

test('elevated furniture checks its top against the ceiling and fans follow room edits', () => {
  const room = makeRoom(6, 5, 2.2), ac = placed('air-conditioner');
  room.openings = [];
  assert.ok(validatePlacement(ac, room, [ac]).some((w) => w.includes('ceiling')));
  const physical = newPhysicalItem('air-conditioner'), scene = sceneWith(physical);
  scene.height.meters = 2.2;
  assert.ok(placementWarnings(scene, pose(physical.id)).some((w) => w.includes('ceiling')));
  const fan = newPhysicalItem('ceiling-fan'), fanScene = sceneWith(fan);
  assert.equal(canStand(fanScene, 2, 2), true);
  fanScene.height.meters = 2.2;
  assert.equal(canStand(fanScene, 2, 2), false);
  assert.equal(placementWarnings(fanScene, pose(fan.id)).some((w) => w.includes('ceiling')), false);
  fan.height.meters = 2.4;
  assert.ok(placementWarnings(fanScene, pose(fan.id)).some((w) => w.includes('ceiling')));
});

test('walking and floor area ignore elevated fixtures above a bounded standing volume', () => {
  const ac = newPhysicalItem('air-conditioner'), fan = newPhysicalItem('ceiling-fan');
  const scene = sceneWith(ac, fan);
  activeLayout(scene).placements[1] = pose(fan.id, 4, 3);
  assert.equal(canStand(scene, 2, 2), true);
  assert.equal(walkPathClear(scene, [1, 2], [4, 2]), true);
  assert.equal(roomFeedback(scene).occupiedArea, 0);
  ac.elevationM = 1.79;
  assert.equal(canStand(scene, 2, 2), false);
  ac.elevationM = 1.8;
  assert.equal(canStand(scene, 2, 2), true);
  const project = makeProject();
  project.items = [placed('air-conditioner'), placed('ceiling-fan', { x: 4, z: 3 })];
  assert.equal(getRoomMetrics(project).occupiedArea, 0);
});

test('mounted edits respect locked and fixed placements and preserve editable priors', () => {
  const item = newPhysicalItem('mirror'), scene = sceneWith(item);
  const changed = applyCommand(scene, { type: 'edit-item', id: item.id, changes: { mounting: 'wall', elevationM: 1.2 } });
  assert.equal(changed.ok, true);
  assert.equal(changed.value.items[0].elevationM, 1.2);
  assert.equal(changed.value.items[0].height.source, 'category-prior');
  for (const fixed of [false, true]) {
    const guarded = structuredClone(scene);
    guarded.items[0].movable = !fixed;
    activeLayout(guarded).placements[0].locked = true;
    for (const changes of [{ mounting: 'floor' }, { elevationM: 0 }])
      assert.equal(applyCommand(guarded, { type: 'edit-item', id: item.id, changes }).ok, false);
  }
});

test('manual categories do not imply new trained detector classes', () => {
  assert.equal(furnitureType('refrigerator'), 'fridge');
  assert.equal(furnitureType('tv'), null);
  for (const type of ['wardrobe', 'mirror', 'air-conditioner', 'ceiling-fan', 'dressing-table'])
    assert.equal(furnitureType(type), null);
});

test('Indian bedroom sample includes mounted fixtures without placement warnings', () => {
  const sample = createSampleProjects().find((p) => p.id === 'sample-indian-bedroom');
  assert.ok(sample);
  for (const type of ['wardrobe', 'dressing-table', 'air-conditioner', 'ceiling-fan', 'desk', 'bedside-table'])
    assert.ok(sample.items.some((i) => i.type === type));
  assert.deepEqual(getProjectWarnings(sample), []);
  const doc = migrateLegacyProject(sample);
  assert.deepEqual(roomFeedback(doc.scene).warnings, []);
});
