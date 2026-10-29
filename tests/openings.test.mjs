import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeLayout,
  createDocument,
  dimensionedPlan,
  getOpeningLeaf,
  getOpeningSettings,
  migrateLegacyProject,
  newPhysicalItem,
  openingClearance,
  openingSchema,
  placementWarnings,
  roomSceneSchema,
  toLegacyProject,
} from '../packages/scene-domain/src/index.ts';
import {
  getDoorClearances,
  getRoomOpenings,
  roomOpeningToCanonical,
  validatePlacement,
} from '../packages/scene-domain/src/legacy/geometry.ts';
import { makeItem, makeProject } from '../src/domain/catalog.ts';
import { exportProjectJson, parseProjectJson, validateRoom } from '../src/domain/validation.ts';
import { exportPlanSvg } from '../src/domain/export.ts';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
const floor = [[0, 0], [6, 0], [6, 5], [0, 5]];
const opening = (changes = {}) => ({
  id: 'door-a', kind: 'door', wallIndex: 0, offsetM: 1, widthM: 0.9,
  heightM: 2.1, sillHeightM: 0, source: 'user-measured',
  hingeSide: 'start', swingDirection: 'inward', openAngleDeg: 0,
  ...changes,
});
const multiProject = () => {
  const project = makeProject('Openings', 6, 5, 2.8);
  project.room.openings = [
    { id: 'front-door', kind: 'door', wall: 'front', offset: 0.4, width: 0.9, height: 2.1, sillHeight: 0, hingeSide: 'start', swingDirection: 'inward', openAngleDeg: 45 },
    { id: 'back-door', kind: 'door', wall: 'back', offset: 3, width: 1, height: 2.2, sillHeight: 0, hingeSide: 'end', swingDirection: 'outward', openAngleDeg: 90 },
    { id: 'left-window', kind: 'window', wall: 'left', offset: 1, width: 1.2, height: 1, sillHeight: 0.9, hingeSide: 'end', swingDirection: 'inward', openAngleDeg: 30 },
    { id: 'right-window', kind: 'window', wall: 'right', offset: 2, width: 1.2, height: 0.9, sillHeight: 1.1, hingeSide: 'start', swingDirection: 'outward', openAngleDeg: 60 },
  ];
  return project;
};

test('two doors and two windows retain dimensions, positions and hinge settings in both formats', () => {
  const project = multiProject(),
    validated = validateRoom(project.room),
    portable = parseProjectJson(exportProjectJson(project)),
    doc = migrateLegacyProject(project),
    restored = toLegacyProject(doc);
  assert.deepEqual(validated.openings, project.room.openings);
  assert.deepEqual(portable.room.openings, project.room.openings);
  assert.equal(doc.scene.openings.length, 4);
  assert.equal(roomSceneSchema.safeParse(doc.scene).success, true);
  for (const expected of project.room.openings) {
    const actual = restored.room.openings.find((o) => o.id === expected.id);
    for (const key of ['offset', 'width', 'height', 'sillHeight', 'openAngleDeg']) close(actual[key], expected[key]);
    for (const key of ['kind', 'wall', 'hingeSide', 'swingDirection']) assert.equal(actual[key], expected[key]);
  }
  // A front wall opening starts at smaller x in legacy and larger x in canonical.
  const front = doc.scene.openings.find((o) => o.id === 'front-door');
  close(front.offsetM, 4.7);
  assert.equal(front.hingeSide, 'end');
  const leaf = getOpeningLeaf(doc.scene.floorPolygonXZ, front);
  close(leaf.hinge[0], 0.4);
  close(leaf.hinge[1], 5);
  const svg = dimensionedPlan(doc);
  for (const expected of project.room.openings) assert.ok(svg.includes(`data-opening-id="${expected.id}"`));
  const webSvg = exportPlanSvg(project);
  for (const expected of project.room.openings) assert.ok(webSvg.includes(`data-opening-id="${expected.id}"`));
});

test('an explicit empty openings array remains empty through import and migration', () => {
  const project = multiProject();
  project.room.openings = [];
  assert.deepEqual(getRoomOpenings(project.room), []);
  assert.deepEqual(validateRoom(project.room).openings, []);
  assert.deepEqual(parseProjectJson(exportProjectJson(project)).room.openings, []);
  const doc = migrateLegacyProject(project);
  assert.deepEqual(doc.scene.openings, []);
  assert.deepEqual(toLegacyProject(doc).room.openings, []);
  assert.deepEqual(getDoorClearances(project.room), []);
});

test('the old single door derives safe defaults and migrates on every wall', () => {
  for (const wall of ['front', 'back', 'left', 'right']) {
    const project = makeProject('Legacy', 6, 5, 1.8);
    project.room.door = { wall, offset: 0.7, width: 0.9 };
    assert.equal(project.room.openings, undefined);
    const [legacyOpening] = getRoomOpenings(project.room);
    assert.equal(legacyOpening.height, 1.8);
    assert.equal(legacyOpening.openAngleDeg, 0);
    const doc = migrateLegacyProject(project), restored = toLegacyProject(doc);
    assert.equal(restored.room.door.wall, wall);
    close(restored.room.door.offset, 0.7);
    close(restored.room.door.width, 0.9);
    assert.equal(restored.room.openings[0].hingeSide, 'start');
  }
});

test('narrow and wide explicit doors retain a valid legacy compatibility door', () => {
  for (const width of [0.1, 4]) {
    const project = multiProject();
    project.room.openings = [{ ...project.room.openings[0], wall: 'front', offset: 0, width }];
    const restored = toLegacyProject(migrateLegacyProject(project));
    assert.equal(validateRoom(restored.room).door.width, width);
  }
  const project = multiProject();
  project.room.width = 1;
  project.room.door = { wall: 'front', offset: 0.1, width: 0.8 };
  project.room.openings = [{ ...project.room.openings[0], offset: 0.9, width: 0.1 }];
  const doc = migrateLegacyProject(project);
  assert.equal(doc.scene.openings[0].offsetM, 0);
});

test('leaf poses respect either polygon winding, hinge side, and inward/outward 0/90 degree angles', () => {
  for (const polygon of [floor, [[6, 0], [0, 0], [0, 5], [6, 5]]])
    for (const hingeSide of ['start', 'end'])
      for (const swingDirection of ['inward', 'outward'])
        for (const openAngleDeg of [0, 90]) {
          const o = opening({ hingeSide, swingDirection, openAngleDeg }),
            leaf = getOpeningLeaf(polygon, o);
          close(Math.hypot(leaf.end[0] - leaf.hinge[0], leaf.end[1] - leaf.hinge[1]), 0.9);
          close(leaf.center[0], (leaf.hinge[0] + leaf.end[0]) / 2);
          close(leaf.center[1], (leaf.hinge[1] + leaf.end[1]) / 2);
          close(leaf.end[0] - leaf.hinge[0], Math.cos(leaf.yawRad) * 0.9);
          close(leaf.end[1] - leaf.hinge[1], -Math.sin(leaf.yawRad) * 0.9);
          assert.equal(leaf.footprint.length, 4);
          if (openAngleDeg === 0) {
            close(leaf.end[1], 0);
            assert.deepEqual(leaf.hinge, hingeSide === 'start' ? leaf.closedStart : leaf.closedEnd);
          } else {
            close(leaf.end[0], leaf.hinge[0]);
            close(leaf.end[1], swingDirection === 'inward' ? 0.9 : -0.9);
          }
        }
});

test('old canonical doorSwing values work and new fields take precedence', () => {
  const old = opening();
  delete old.hingeSide;
  delete old.swingDirection;
  delete old.openAngleDeg;
  assert.equal(openingSchema.safeParse(old).success, true);
  assert.deepEqual(getOpeningSettings({ ...old, doorSwing: 'inward-end' }), { hingeSide: 'end', swingDirection: 'inward', openAngleDeg: 0 });
  assert.equal(getOpeningSettings({ ...old, doorSwing: 'outward' }).swingDirection, 'outward');
  assert.deepEqual(getOpeningSettings({ ...old, doorSwing: 'outward', hingeSide: 'end', swingDirection: 'inward', openAngleDeg: 25 }), { hingeSide: 'end', swingDirection: 'inward', openAngleDeg: 25 });
});

test('canonical-to-legacy projection handles translated rooms and reversed winding', () => {
  const doc = createDocument('Reversed', 6, 5, 2.8);
  doc.scene.floorPolygonXZ = [[16, 20], [10, 20], [10, 25], [16, 25]];
  doc.scene.openings = [opening({ hingeSide: 'end', openAngleDeg: 90 })];
  const restored = toLegacyProject(doc).room.openings[0];
  assert.equal(restored.wall, 'back');
  close(restored.offset, 4.1);
  assert.equal(restored.hingeSide, 'start');
  const projected = roomOpeningToCanonical({ width: 6, depth: 5 }, restored);
  const leaf = getOpeningLeaf(floor, projected);
  close(leaf.hinge[0], 4.1);
  close(leaf.end[1], 0.9);
});

test('both room formats reject overlapping openings, bounds and unsupported angles', () => {
  const project = multiProject();
  const badChanges = [
    { offset: -1 }, { offset: 5.8 }, { width: 0 }, { height: 3 },
    { sillHeight: -0.1 }, { sillHeight: 1 }, { openAngleDeg: -1 }, { openAngleDeg: 171 },
  ];
  for (const changes of badChanges) {
    const room = structuredClone(project.room);
    Object.assign(room.openings[0], changes);
    assert.throws(() => validateRoom(room));
  }
  const overlapping = structuredClone(project.room);
  overlapping.openings.push({ ...overlapping.openings[0], id: 'overlap', offset: 0.6 });
  assert.throws(() => validateRoom(overlapping), /overlap/);
  const duplicate = structuredClone(project.room);
  duplicate.openings[1].id = duplicate.openings[0].id;
  assert.throws(() => validateRoom(duplicate), /duplicate/);
  const window = structuredClone(project.room);
  window.openings[2].openAngleDeg = 91;
  assert.throws(() => validateRoom(window), /angle/);
  for (const changes of [
    { offsetM: -1 }, { offsetM: 5.8 }, { heightM: 3 }, { sillHeightM: 1 },
    { openAngleDeg: -1 }, { openAngleDeg: 171 }, { openAngleDeg: NaN },
    { kind: 'window', openAngleDeg: 91 },
  ]) {
    const scene = createDocument('Bounds', 6, 5, 2.8).scene;
    scene.openings = [opening(changes)];
    assert.equal(roomSceneSchema.safeParse(scene).success, false, JSON.stringify(changes));
  }
  assert.equal(openingSchema.safeParse(opening({ kind: 'window', openAngleDeg: 91 })).success, false);
  const scene = createDocument('Overlap', 6, 5, 2.8).scene;
  scene.openings = [opening(), opening({ id: 'door-b', offsetM: 1.1 })];
  assert.equal(roomSceneSchema.safeParse(scene).success, false);
  scene.openings[1] = opening({ id: 'high-window', kind: 'window', sillHeightM: 2.2, heightM: 0.5 });
  assert.equal(roomSceneSchema.safeParse(scene).success, true);
});

test('clearance includes every inward door, respects outward overrides, and warns about open leaves above furniture', () => {
  const project = multiProject();
  assert.equal(getDoorClearances(project.room).length, 1);
  project.room.openings[1].swingDirection = 'inward';
  assert.equal(getDoorClearances(project.room).length, 2);
  project.room.openings[1].swingDirection = 'outward';
  const doc = migrateLegacyProject(project);
  assert.equal(openingClearance(doc.scene).length, 1);
  doc.scene.openings[0].swingDirection = 'outward';
  assert.equal(openingClearance(doc.scene).length, 0);
  const scene = createDocument('Window clearance', 6, 5, 2.8).scene,
    item = newPhysicalItem('cabinet'),
    placement = { physicalItemId: item.id, floorCenterXM: 1, floorCenterZM: 0.5, yawRad: 0, locked: false };
  scene.openings = [opening({ kind: 'window', sillHeightM: 0.2, heightM: 1, openAngleDeg: 90 })];
  scene.items = [item];
  activeLayout(scene).placements = [placement];
  assert.ok(placementWarnings(scene, placement).includes('Blocks an open window'));
  scene.openings[0].sillHeightM = 1;
  assert.equal(placementWarnings(scene, placement).includes('Blocks an open window'), false);
  const legacy = toLegacyProject({ ...createDocument(), scene });
  legacy.room.openings[0].sillHeight = 0.2;
  const legacyItem = makeItem('cabinet', { x: 1, z: 0.5, placed: true });
  assert.ok(validatePlacement(legacyItem, legacy.room, [legacyItem]).includes('Blocks an open window'));
});
