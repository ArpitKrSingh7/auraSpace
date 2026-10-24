import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCorners,
  overlaps,
  pointInFootprint,
  isInsideRoom,
  validatePlacement,
  normalizeRotation,
  snapPosition,
  getRoomMetrics,
} from '../src/domain/geometry.ts';
import { makeItem, makeRoom, makeProject } from '../src/domain/catalog.ts';

test('Separating Axis Theorem (SAT): non-overlapping separated items', () => {
  const sofaA = makeItem('sofa', { x: 1, z: 1, width: 2, depth: 1, rotation: 0, placed: true });
  const sofaB = makeItem('sofa', { x: 4, z: 1, width: 2, depth: 1, rotation: 0, placed: true });
  assert.equal(overlaps(sofaA, sofaB), false);
});

test('SAT: overlapping parallel items', () => {
  const sofaA = makeItem('sofa', { x: 2, z: 2, width: 2, depth: 1, rotation: 0, placed: true });
  const sofaB = makeItem('sofa', { x: 2.5, z: 2.2, width: 2, depth: 1, rotation: 0, placed: true });
  assert.equal(overlaps(sofaA, sofaB), true);
});

test('SAT: rotated collision detection', () => {
  // A table at (2, 2)
  const table = makeItem('table', { x: 2, z: 2, width: 1.2, depth: 0.8, rotation: 0, placed: true });
  // A chair at (2, 3) rotated 45 degrees
  const chairRotated = makeItem('chair', { x: 2, z: 2.8, width: 0.8, depth: 0.8, rotation: 45, placed: true });
  const chairAway = makeItem('chair', { x: 2, z: 3.8, width: 0.8, depth: 0.8, rotation: 45, placed: true });

  assert.equal(overlaps(table, chairRotated), true);
  assert.equal(overlaps(table, chairAway), false);
});

test('Rugs do not trigger collision with other furniture', () => {
  const rug = makeItem('rug', { x: 2, z: 2, width: 3, depth: 2, placed: true });
  const sofa = makeItem('sofa', { x: 2, z: 2, width: 2, depth: 1, placed: true });
  assert.equal(overlaps(rug, sofa), false);
});

test('Room boundary containment', () => {
  const room = makeRoom(5, 4, 2.8);
  const insideItem = makeItem('chair', { x: 2.5, z: 2, width: 0.8, depth: 0.8, rotation: 0, placed: true });
  const outsideItem = makeItem('chair', { x: 4.8, z: 2, width: 0.8, depth: 0.8, rotation: 0, placed: true });

  assert.equal(isInsideRoom(insideItem, room), true);
  assert.equal(isInsideRoom(outsideItem, room), false);
});

test('Door swing swept clearance detection', () => {
  const room = makeRoom(5, 4, 2.8);
  // Door is on front wall at offset
  const doorItem = makeItem('cabinet', {
    x: room.door.offset + 0.2,
    z: room.depth - 0.2,
    width: 0.8,
    depth: 0.5,
    placed: true,
  });
  const warnings = validatePlacement(doorItem, room, [doorItem]);
  assert.ok(warnings.some((w) => w.includes('Blocks the doorway clearance')));
});

test('Math helpers: normalizeRotation and snapPosition', () => {
  assert.equal(normalizeRotation(370), 10);
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(snapPosition(1.23, true, 0.1), 1.2);
  assert.equal(snapPosition(1.27, true, 0.1), 1.3);
  assert.equal(snapPosition(1.234, false), 1.234);
});
