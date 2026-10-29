import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPixelOperation,
  approximateSurfaceFill,
  parseDetections,
} from '../src/services/vision-core.ts';
import { exportPlanSvg } from '../src/domain/export.ts';
import { makeItem, makeProject } from '../src/domain/catalog.ts';

test('Python corner boxes and browser width-height boxes map to the same pixels', () => {
  const a = parseDetections(
    [{ label: 'chair', score: 0.8, box: { x1: 10, y1: 20, x2: 40, y2: 60 } }],
    100,
    100,
  );
  const b = parseDetections(
    [{ label: 'chair', score: 0.8, box: [10, 20, 30, 40] }],
    100,
    100,
  );
  assert.deepEqual(a[0].box, b[0].box);
  assert.equal(
    parseDetections(
      [{ label: 'chair', score: 0.8, box: [NaN, 0, 1, 1] }],
      100,
      100,
    ).length,
    0,
  );
});

test('pixel processing preserves alpha and does not mutate source', () => {
  const source = new Uint8ClampedArray([255, 0, 0, 120, 0, 255, 0, 240]);
  const result = applyPixelOperation(source, 2, 1, 'grayscale');
  assert.equal(result[0], 76);
  assert.equal(result[3], 120);
  assert.equal(result[7], 240);
  assert.equal(source[0], 255);
});

test('surface fill preserves every unselected pixel and rejects a full mask', () => {
  const source = new Uint8ClampedArray(5 * 5 * 4).fill(150);
  source.set([0, 0, 0, 255], 12 * 4);
  const result = approximateSurfaceFill(source, 5, 5, [[2, 2, 1, 1]]);
  for (let i = 0; i < 25; i++)
    if (i !== 12)
      assert.deepEqual(
        result.slice(i * 4, i * 4 + 4),
        source.slice(i * 4, i * 4 + 4),
      );
  assert.equal(result[48], 150);
  assert.throws(() => approximateSurfaceFill(source, 5, 5, [[0, 0, 5, 5]]));
});

test('plan exports escape names and include dimensions and rotated footprints', () => {
  const project = makeProject('<script> & room', 5, 4, 2.8);
  project.items = [
    makeItem('chair', {
      name: 'Chair & lamp',
      placed: true,
      x: 2,
      z: 2,
      rotation: 45,
    }),
  ];
  const svg = exportPlanSvg(project);
  assert.ok(svg.includes('&lt;script&gt; &amp; room'));
  assert.ok(svg.includes('Chair &amp; lamp'));
  assert.match(svg, />5(?:\.0+)? m</);
  assert.ok(!svg.includes('<script>'));
});
