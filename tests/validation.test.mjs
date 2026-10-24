import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProject,
  validateRoom,
  validateItem,
  exportProjectJson,
  parseProjectJson,
} from '../src/domain/validation.ts';
import { makeProject, makeItem, makeRoom } from '../src/domain/catalog.ts';

test('Project validation & schema compliance', () => {
  const project = makeProject('Test Living Room', 6, 4.5, 2.9);
  const validated = validateProject(project);
  assert.equal(validated.name, 'Test Living Room');
  assert.equal(validated.room.width, 6);
  assert.equal(validated.room.depth, 4.5);
  assert.equal(validated.room.height, 2.9);
});

test('Item validation and coordinate bounds', () => {
  const item = makeItem('sofa', {
    name: 'Leather Sectional',
    width: 2.4,
    depth: 1.0,
    height: 0.85,
    x: 2,
    z: 1.5,
    rotation: 90,
    placed: true,
  });
  const validated = validateItem(item);
  assert.equal(validated.name, 'Leather Sectional');
  assert.equal(validated.width, 2.4);
  assert.equal(validated.rotation, 90);
});

test('Project JSON round-trip export and import', () => {
  const project = makeProject('Studio Apartment', 5, 4, 2.8);
  project.items.push(makeItem('bed', { x: 2, z: 2, placed: true }));
  project.items.push(makeItem('chair', { x: 4, z: 1, placed: true }));

  const jsonString = exportProjectJson(project);
  assert.ok(jsonString.includes('auraspace-project'));
  assert.ok(jsonString.includes('Studio Apartment'));

  const parsed = parseProjectJson(jsonString);
  assert.equal(parsed.name, 'Studio Apartment');
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.room.width, 5);
});
