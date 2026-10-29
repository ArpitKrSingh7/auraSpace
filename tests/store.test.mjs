import test from 'node:test';
import assert from 'node:assert/strict';
import { useAppStore } from '../src/store/useAppStore.ts';
import { makeItem, makeProject } from '../src/domain/catalog.ts';
const state = () => useAppStore.getState();
const project = () => state().activeProject();

test('undo and redo preserve each edit and branch correctly', () => {
  state().createProject('History', 5, 4, 2.8);
  state().addItem('sofa');
  const id = project().items[0].id;
  state().moveItem(id, 2, 2);
  state().rotateItem(id, 45);
  state().undo();
  assert.equal(project().items[0].rotation, 0);
  assert.equal(project().items[0].x, 2);
  state().undo();
  assert.equal(project().items[0].placed, false);
  state().undo();
  assert.equal(project().items.length, 0);
  state().redo();
  state().redo();
  state().redo();
  assert.equal(project().items[0].rotation, 45);
  state().undo();
  state().resizeItem(id, 2.4, 1, 0.9);
  state().redo();
  assert.equal(project().items[0].rotation, 0);
  assert.equal(project().items[0].width, 2.4);
});

test('placing from the tray preserves physical item identity', () => {
  state().createProject('Inventory', 5, 4, 2.8);
  state().addItem('chair');
  const item = project().items[0];
  useAppStore.setState({ placingItem: item, placingType: item.type });
  state().confirmPlacing(2, 1);
  assert.equal(project().items.length, 1);
  assert.equal(project().items[0].id, item.id);
  assert.equal(project().items[0].placed, true);
  state().returnToTray(item.id);
  assert.equal(project().items[0].placed, false);
});

test('locking prevents transform changes and unlocking restores editing', () => {
  state().createProject('Locks', 5, 4, 2.8);
  state().addItem('chair', { x: 2, z: 2, placed: true });
  const item = project().items[0];
  state().lockItem(item.id);
  state().moveItem(item.id, 3, 3);
  state().rotateItem(item.id, 90);
  state().resizeItem(item.id, 1, 1, 1);
  state().returnToTray(item.id);
  assert.deepEqual(project().items[0], { ...item, locked: true });
  state().unlockItem(item.id);
  state().moveItem(item.id, 3, 3);
  assert.equal(project().items[0].x, 3);
});

test('detection extraction is idempotent and evidence removal keeps exports valid', () => {
  state().createProject('Photos', 5, 4, 2.8);
  state().addPhoto({
    id: 'ph',
    name: 'photo',
    uri: 'data:image/png;base64,AAAA',
    width: 100,
    height: 100,
    analysisStatus: 'complete',
    detections: [
      {
        id: 'det',
        label: 'chair',
        type: 'chair',
        score: 0.9,
        box: [1, 1, 20, 20],
        source: 'model',
      },
    ],
  });
  state().addDetectionAsItem('ph', 'det');
  state().addDetectionAsItem('ph', 'det');
  assert.equal(project().items.length, 1);
  state().saveLayout('First');
  state().removePhoto('ph');
  assert.equal(project().items[0].photoId, undefined);
  assert.equal(project().layouts[0].items[0].photoId, undefined);
});

test('invalid dimensions and coordinates cannot corrupt a room', () => {
  assert.throws(() => state().createProject('Invalid', NaN, 4, 2.8));
  state().createProject('Validation', 5, 4, 2.8);
  state().addItem('chair');
  const item = project().items[0];
  state().resizeItem(item.id, Infinity, 1, 1);
  state().moveItem(item.id, NaN, 1);
  state().moveItem(item.id, 101, 1);
  assert.deepEqual(project().items[0], item);
  state().updateRoom({ width: 1 });
  assert.ok(project().room.door.offset + project().room.door.width <= 1);
  assert.equal(project().room.dimensionSources.width, 'user-measured');
});

test('room estimates keep their source and undo restores earlier measured dimensions', () => {
  state().createProject('Room provenance', 5, 4, 2.8);
  state().updateRoom({ wallColor: '#112233' });
  assert.equal(project().room.dimensionSources?.width, undefined);
  state().updateRoom({ width: 6 });
  assert.equal(project().room.dimensionSources.width, 'user-measured');
  state().updateRoom({ width: 7, dimensionSources: { ...project().room.dimensionSources, width: 'model-estimated' } });
  assert.equal(project().room.dimensionSources.width, 'model-estimated');
  state().undo();
  assert.equal(project().room.width, 6);
  assert.equal(project().room.dimensionSources.width, 'user-measured');
  state().redo();
  assert.equal(project().room.width, 7);
  assert.equal(project().room.dimensionSources.width, 'model-estimated');
});

test('imports never overwrite existing project IDs and layouts can be restored', () => {
  const source = makeProject('Imported');
  source.items = [makeItem('table', { placed: true, x: 2, z: 2 })];
  const first = state().importProject(source),
    second = state().importProject(source);
  assert.notEqual(first, second);
  state().openProject(first);
  state().saveLayout('Original');
  state().moveItem(source.items[0].id, 3, 3);
  state().loadLayout(project().layouts[0].id);
  assert.equal(project().items[0].x, 2);
  state().undo();
  assert.equal(project().items[0].x, 3);
});
