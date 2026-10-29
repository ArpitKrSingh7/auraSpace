// Bounded cross-language smoke: analytic camera/depth -> Python fit -> TS review.
// No model weights, server, database or GPU required.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mapRoomProposalToSource, reviewedRoomForWeb } from '../src/services/reconstruction-core.ts';
import { mapFloorPoint } from '../packages/scene-domain/src/calibration.ts';
import { makeProject } from '../src/domain/catalog.ts';

const python = process.env.AURASPACE_PYTHON ||
  (existsSync('.artifacts/vision-venv/bin/python') ? '.artifacts/vision-venv/bin/python' : 'python3');
const fileIndex = process.argv.indexOf('--fixture');
const fixture = fileIndex >= 0 ? { status: 0, error: null, stderr: '',
  stdout: readFileSync(process.argv[fileIndex + 1], 'utf8') } : spawnSync(python, ['scripts/reconstruction-fixture.py'], {
  encoding: 'utf8', timeout: 20_000, maxBuffer: 1_000_000,
  env: { ...process.env, PYTHONPATH: 'services/vision:services/vision/tests', OMP_NUM_THREADS: '1', MKL_NUM_THREADS: '1' },
});
if (fixture.error || fixture.status !== 0)
  throw new Error(`Python geometry check failed: ${fixture.error?.message ?? fixture.stderr.slice(-1500)}. If process spawning is restricted, generate JSON with scripts/reconstruction-fixture.py and pass --fixture <path>.`);
const { proposal, points, lengthM } = JSON.parse(fixture.stdout);
assert.equal(proposal.status, 'estimated');
assert.equal(proposal.partial, true);
const mapped = mapRoomProposalToSource(proposal, { width: 320, height: 240 }, { width: 640, height: 480 });
const pointsPx = points.map(([x, y]) => [x * 2, y * 2]);
const floorPoints = pointsPx.map((p) => mapFloorPoint(mapped.imageToFloor, p));
const baseline = Math.hypot(floorPoints[1][0] - floorPoints[0][0], floorPoints[1][1] - floorPoints[0][1]);
assert.ok(Math.abs(baseline / lengthM - .8) < .002);
const project = makeProject('Geometry integration', 6, 5, 2.8);
project.room.openings = []; // The analytic fixture supplies no openings to preserve.
project.photos = [{ id: 'analytic-room', uri: 'data:image/png;base64,YQ==', name: 'Analytic room',
  width: 640, height: 480, detections: [], analysisStatus: 'complete', roomProposal: mapped }];
const before = structuredClone(project);
const result = reviewedRoomForWeb(project, 'analytic-room', { scaleAnchor: { pointsPx, lengthM } });
assert.deepEqual(project, before);
assert.ok(Math.abs(result.room.width - 5.2) < .12);
assert.equal(result.room.height, 2.8); // No ceiling observation means no invented height.
assert.equal(result.room.dimensionSources.width, 'calibrated-estimate');
console.log(`Reconstruction integration passed: calibrated visible extent ${result.room.width.toFixed(2)} × ${result.room.depth.toFixed(2)} m; missing height preserved.`);
