import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { act, createPointerEvents, createRoot, extend } from '@react-three/fiber';
import { SceneWorld } from '../src/components/scene/SceneWorld.tsx';
import { createSampleProjects, makeItem } from '../src/domain/catalog.ts';
import { getRoomOpenings, roomOpeningToCanonical } from '../src/domain/geometry.ts';
import { getOpeningLeaf } from '../packages/scene-domain/src/openings.ts';

// Use Fiber's CJS Three instance for its instanceof Camera check. Actual scene
// meshes, raycasting and event propagation run here; only GPU drawing is stubbed.
const THREE = createRequire(import.meta.url)('three');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
extend(THREE);

async function viewport(options = {}) {
  let project = createSampleProjects().find((p) => p.id === 'sample-living');
  let mode = options.mode ?? 'plan', selectedId = null, selectedOpeningId = null;
  const moved = [], rotated = [], walked = [], placed = [];
  const canvas = { width: 800, height: 600, style: {}, addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {} };
  const gl = { domElement: canvas, render() {}, setSize() {}, setPixelRatio() {}, shadowMap: {},
    xr: { addEventListener() {}, removeEventListener() {} }, renderLists: { dispose() {} }, forceContextLoss() {} };
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .01, 100);
  camera.position.set(2.6, 10, 2.1); camera.up.set(0, 0, -1); camera.lookAt(2.6, 0, 2.1); camera.manual = true;
  const root = createRoot(canvas).configure({ gl, camera, size: { width: 800, height: 600, top: 0, left: 0 }, frameloop: 'never', events: createPointerEvents });
  let store;
  const render = async () => {
    await act(async () => {
      store = root.render(React.createElement(SceneWorld, {
        project, mode, selectedId, selectedOpeningId, showGrid: true, snap: true,
        placing: options.placing,
        onSelect(id) { selectedId = id; selectedOpeningId = null; },
        onOpeningSelect(id) { selectedId = null; selectedOpeningId = id; },
        onMove(id, x, z) { moved.push({ id, x, z }); project = { ...project, items: project.items.map((item) => item.id === id ? { ...item, x, z } : item) }; },
        onRotate(id, angle) { rotated.push({ id, angle }); project = { ...project, items: project.items.map((item) => item.id === id ? { ...item, rotation: angle } : item) }; },
        onWalk(x, z) { walked.push([x, z]); },
        onPlace(x, z) { placed.push([x, z]); },
      }));
    });
    store.getState().scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  };
  const fire = async (name, x, z, button = 0) => {
    const position = new THREE.Vector3(x, 0, z).project(camera);
    const offsetX = (position.x + 1) * 400, offsetY = (1 - position.y) * 300;
    const type = { onClick: 'click', onPointerDown: 'pointerdown', onPointerUp: 'pointerup', onPointerMove: 'pointermove' }[name];
    await act(async () => store.getState().events.handlers[name]({
      offsetX, offsetY, clientX: offsetX, clientY: offsetY, pointerId: 1, button, type, target: canvas,
    }));
    await render();
  };
  await render();
  return {
    get project() { return project; }, get selected() { return selectedId; }, get opening() { return selectedOpeningId; },
    moved, rotated, walked, placed, fire,
    async tap(x, z) { for (const name of ['onPointerDown', 'onPointerUp', 'onClick']) await fire(name, x, z); },
    async changeMode(next) { mode = next; await render(); },
    async openingAngle(angle) {
      project = { ...project, room: { ...project.room, openings: getRoomOpenings(project.room).map((o) => ({ ...o, openAngleDeg: angle })) } };
      await render();
    },
    leaf(id) { return store.getState().scene.getObjectByName(`opening-${id}`); },
    async close() { await act(async () => root.unmount()); },
  };
}

test('a furniture tap stays selected; wall and empty floor taps clear selection', async () => {
  const view = await viewport();
  try {
    const before = structuredClone(view.project.items);
    await view.tap(2.5, .75);
    assert.equal(view.selected, 'sample-living-sofa');
    await view.tap(2.6, -.065); // Back wall, outside the floor plane.
    assert.equal(view.selected, null);
    await view.tap(2.5, .75);
    await view.tap(.8, 2.8);
    assert.equal(view.selected, null);
    assert.deepEqual(view.project.items, before);
  } finally { await view.close(); }
});

test('inside-view floor clicks deselect furniture and retain tap-to-walk', async () => {
  const view = await viewport({ mode: 'inside' });
  try {
    await view.tap(2.5, .75);
    assert.equal(view.selected, 'sample-living-sofa');
    await view.tap(.8, 2.8);
    assert.equal(view.selected, null);
    assert.equal(view.walked.length, 1);
    assert.ok(Math.abs(view.walked[0][0] - .8) < .001);
    assert.ok(Math.abs(view.walked[0][1] - 2.8) < .001);
  } finally { await view.close(); }
});

test('dragging onto a wall keeps the furniture selected', async () => {
  const view = await viewport();
  try {
    await view.fire('onPointerDown', 2.5, .75);
    await view.fire('onPointerMove', 2.8, 1.1);
    await view.fire('onPointerUp', 2.6, -.065);
    await view.fire('onClick', 2.6, -.065);
    assert.equal(view.selected, 'sample-living-sofa');
    assert.equal(view.moved.length, 1);
  } finally { await view.close(); }
});

test('door taps open their controls, and 0/90 degree updates change the rendered leaf', async () => {
  const view = await viewport();
  try {
    await view.tap(2.5, .75);
    const opening = getRoomOpenings(view.project.room)[0], room = view.project.room;
    const floor = [[0, 0], [room.width, 0], [room.width, room.depth], [0, room.depth]];
    const leaf = getOpeningLeaf(floor, roomOpeningToCanonical(room, opening));
    await view.tap(...leaf.center);
    assert.equal(view.opening, opening.id);
    assert.equal(view.selected, null);
    const closed = view.leaf(opening.id).rotation.y;
    await view.openingAngle(90);
    assert.ok(Math.abs(Math.abs(view.leaf(opening.id).rotation.y - closed) - Math.PI / 2) < 1e-6);
    await view.openingAngle(0);
    assert.ok(Math.abs(view.leaf(opening.id).rotation.y - closed) < 1e-6);
    await view.tap(2.6, -.065);
    assert.equal(view.opening, null);
  } finally { await view.close(); }
});

test('the rotation handle keeps selection and commits one rotation without a move', async () => {
  const view = await viewport();
  try {
    await view.tap(2.5, .75);
    const item = view.project.items.find((i) => i.id === view.selected), radius = item.depth / 2 + .25;
    await view.fire('onPointerDown', item.x, item.z - radius);
    await view.fire('onPointerMove', item.x + radius, item.z);
    await view.fire('onPointerUp', item.x + radius, item.z);
    assert.equal(view.selected, item.id);
    assert.equal(view.rotated.length, 1);
    assert.equal(view.rotated[0].angle, 90);
    assert.equal(view.moved.length, 0);
  } finally { await view.close(); }
});

test('placing a ghost still reaches the floor and never becomes deselection', async () => {
  const view = await viewport({ placing: makeItem('chair') });
  try {
    await view.tap(.8, 2.8);
    assert.equal(view.placed.length, 1);
    assert.equal(view.moved.length, 0);
  } finally { await view.close(); }
});
