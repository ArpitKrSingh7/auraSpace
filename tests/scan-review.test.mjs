import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDetections } from '../src/services/observation-identity.ts';
import { selectedRemovalMask, scaleRemovalMask } from '../src/services/removal-mask.ts';
import { parseDetections } from '../src/services/vision-core.ts';
import { recoverStudio } from '../src/services/studio-recovery.ts';
import { useAppStore } from '../src/store/useAppStore.ts';
import { makeProject } from '../src/domain/catalog.ts';
import { exportProjectJson, parseProjectJson } from '../src/domain/validation.ts';

const observation = (id, x, extras = {}) => ({ id, type: 'chair', label: 'chair', score: .9,
  box: [x, 20, 40, 60], source: 'model', ...extras });
const photo = () => ({ id: 'scan', name: 'Room', uri: 'data:image/png;base64,AAAA', width: 400, height: 300,
  analysisStatus: 'complete', detections: [observation('det-0', 10), observation('det-1', 120)] });
const store = () => useAppStore.getState();

test('reordered scan observations retain identity but use their new inference indices', () => {
  const next = reconcileDetections(photo().detections, [observation('det-0', 121, { analysisIndex: 0 }), observation('det-1', 11, { analysisIndex: 1 })]);
  assert.deepEqual(next.map((d) => [d.id, d.analysisIndex]), [['det-1', 0], ['det-0', 1]]);
  const manual = observation('corrected', 10, { source: 'manual', type: 'table' });
  assert.deepEqual(reconcileDetections([manual], [observation('det-0', 10)]), [manual]);
});

test('ambiguous, missed or newly appearing detections never inherit an index-based identity', () => {
  const old = [observation('old-1', 10), observation('old-2', 12)];
  const next = reconcileDetections(old, [observation('old-1', 11), observation('old-2', 220)]);
  assert.ok(next.every((d) => !old.some((p) => p.id === d.id)));
  assert.equal(new Set(next.map((d) => d.id)).size, 2);
});

test('rescans and rebuilds preserve unlocked edits, saved layouts and valid undo references', () => {
  const id = store().createProject('Rescan preservation', 6, 5, 3);
  store().addPhoto(photo());
  store().buildRoomFromPhoto('scan');
  const item = store().activeProject().items.find((i) => i.detectionId === 'det-0');
  store().moveItem(item.id, 2, 2);
  store().rotateItem(item.id, 27);
  store().recolorItem(item.id, '#123456');
  const edited = structuredClone(store().activeProject().items.find((i) => i.id === item.id));
  store().saveLayout('Edited');
  store().updatePhotoInProject(id, 'scan', { analysisStatus: 'complete', detections: [observation('det-0', 121, { analysisIndex: 0 }), observation('det-1', 11, { analysisIndex: 1 })] });
  store().buildRoomFromPhoto('scan');
  assert.equal(store().activeProject().items.length, 2);
  assert.deepEqual(store().activeProject().items.find((i) => i.id === item.id), edited);
  assert.equal(parseProjectJson(exportProjectJson(store().activeProject())).items.find((i) => i.id === item.id).edited, true);
  store().updatePhotoInProject(id, 'scan', { analysisStatus: 'complete', detections: [] });
  assert.doesNotThrow(() => exportProjectJson(store().activeProject()));
  assert.ok(store().activeProject().items.every((i) => i.detectionId === undefined && i.edited));
  store().undo();
  assert.doesNotThrow(() => exportProjectJson(store().activeProject()));
  store().redo();
  assert.doesNotThrow(() => exportProjectJson(store().activeProject()));
});

test('stable observation IDs still select the correct depth pose after model reordering', () => {
  const id = store().createProject('Pose identity', 6, 5, 3);
  store().updateRoom({ openings: [] });
  store().addPhoto(photo());
  store().updatePhotoInProject(id, 'scan', { analysisStatus: 'complete', detections: [observation('det-0', 120, { analysisIndex: 0 }), observation('det-1', 10, { analysisIndex: 1 })],
    roomProposal: { status: 'estimated', source: 'model-estimated', method: 'fixture', partial: true, confidence: 'low', floorCornersPx: [], warnings: [], widthM: 6, depthM: 5,
      furniture: [{ detectionIndex: 0, centerXZ: [4, 3], widthM: .6, depthM: .6, heightM: 1, rotationDeg: 15, method: 'depth-projected' }] } });
  const result = store().buildRoomFromPhoto('scan', { preserveObservedPoses: true });
  const placed = result.items.find((i) => i.detectionId === 'det-1');
  assert.deepEqual([placed.x, placed.z, placed.rotation], [4, 3, 15]);
});

test('instance masks and brush corrections scale together and reject invalid coordinates', () => {
  const d = parseDetections([{ label: 'chair', score: .9, box: [10, 20, 40, 60], mask_polygon: [[10,20],[50,20],[40,80]] }], 400, 300)[0];
  const mask = selectedRemovalMask([d], [{ tool: 'erase', radius: 8, points: [[20,30],[24,40]] }]);
  const scaled = scaleRemovalMask(mask, {width:400,height:300}, {width:200,height:150});
  assert.deepEqual(scaled.polygons[0], [[5,10],[25,10],[20,40]]);
  assert.deepEqual(scaled.strokes[0], {tool:'erase',radius:4,points:[[10,15],[12,20]]});
  assert.throws(() => scaleRemovalMask({...mask,strokes:[{tool:'erase',radius:8,points:[[401,0]]}]}, {width:400,height:300}, {width:200,height:150}));
  assert.throws(() => scaleRemovalMask({...mask,strokes:[{tool:'paint',radius:NaN,points:[[1,1]]}]}, {width:400,height:300}, {width:200,height:150}));
});

test('one corrupt project or settings record does not hide valid rooms', () => {
  const good = makeProject('Keep me'); good.photos = [{...photo(), analysisStatus:'running'}];
  const result = recoverStudio({projects:[{id:'broken'},good],settings:{snap:'invalid'}});
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].id, good.id);
  assert.equal(result.projects[0].photos[0].analysisStatus, 'failed');
  assert.equal(result.skipped, 2);
  assert.deepEqual(recoverStudio({projects:[]}).projects, []);
});

test('exports preserve instance boundaries but do not carry dangling device-local original references', () => {
  const project = makeProject('Portable');
  project.photos = [{...photo(),originalAssetId:'local-file'}];
  project.photos[0].detections[0].maskPolygon = [[10,20],[50,20],[50,80]];
  const restored = parseProjectJson(exportProjectJson(project));
  assert.equal(restored.photos[0].originalAssetId, undefined);
  assert.equal(restored.photos[0].uri, project.photos[0].uri);
  assert.deepEqual(restored.photos[0].detections[0].maskPolygon, project.photos[0].detections[0].maskPolygon);
});

test('floor and camera hints retain their source coordinates through export and analysis resize', async () => {
  const {scaledPhotoHints, validatePhotoHints} = await import('../src/services/photo-hints.ts');
  const p=makeProject('Guided scan');p.photos=[photo()];
  p.photos[0].analysisHints={floorRegionPx:[[40,150],[300,150],[300,250],[40,250]],intrinsics:{fx:350,fy:360,cx:199.5,cy:149.5}};
  const mapped=scaledPhotoHints(p.photos[0],{width:200,height:120});
  assert.deepEqual(mapped.floor_region[2],[150,100]);
  assert.deepEqual(mapped.intrinsics,{fx:175,fy:144,cx:99.75,cy:59.800000000000004});
  assert.deepEqual(parseProjectJson(exportProjectJson(p)).photos[0].analysisHints,p.photos[0].analysisHints);
  assert.throws(()=>validatePhotoHints({floorRegionPx:[[0,0],[400,300],[0,300],[400,0]]},p.photos[0]));
  assert.throws(()=>validatePhotoHints({floorRegionPx:[[-1,0],[400,0],[400,300],[0,300]]},p.photos[0]));
});

test('rejecting geometry ignores model scale and poses, and survives save/build', () => {
  store().createProject('Reject floor',5,4,3);store().addPhoto({...photo(),roomProposal:{status:'estimated',source:'model-estimated',method:'fixture',partial:true,confidence:'low',floorCornersPx:[],warnings:[],widthM:9,depthM:8,
    furniture:[{detectionIndex:0,centerXZ:[6,7],widthM:1,depthM:1,heightM:1,rotationDeg:35,method:'depth-projected'}]}});
  const result=store().buildRoomFromPhoto('scan',{useEstimatedGeometry:false});
  assert.equal(result.projectedCount,0);assert.deepEqual([result.room.width,result.room.depth],[5,4]);
  assert.equal(parseProjectJson(exportProjectJson(store().activeProject())).photos[0].roomProposal.geometryRejected,true);
  assert.equal(store().buildRoomFromPhoto('scan').projectedCount,0);
});

test('keeping a photo arrangement exposes out-of-room poses instead of hiding conflicts by clamping', () => {
  store().createProject('Observed pose',5,4,3);store().updateRoom({openings:[]});store().addPhoto({...photo(),roomProposal:{status:'estimated',source:'model-estimated',method:'fixture',partial:true,confidence:'low',floorCornersPx:[],warnings:[],widthM:5,depthM:4,
    furniture:[{detectionIndex:0,centerXZ:[6,7],widthM:.6,depthM:.6,heightM:1,rotationDeg:35,method:'depth-projected'}]}});
  const result=store().buildRoomFromPhoto('scan',{preserveObservedPoses:true});
  const item=result.items.find(i=>i.detectionId==='det-0');assert.deepEqual([item.x,item.z],[6,7]);assert.ok(result.warnings.length>0);
});

test('calibration must use actual floor evidence even when a furniture-expanded envelope contains the point', () => {
  store().createProject('Evidence calibration',5,4,3);
  const p={...photo(),roomProposal:{status:'estimated',source:'model-estimated',method:'fixture',partial:true,confidence:'low',floorCornersPx:[],warnings:[],widthM:5,depthM:4,imageToFloor:[.01,0,0,0,.01,0,0,0,1],
    floorSupport:{columns:4,rows:3,originPx:[50,50],stepPx:[100,100],cells:[8,9,10,11]}}};
  store().addPhoto(p);
  assert.throws(()=>store().buildRoomFromPhoto('scan',{scaleAnchor:{pointsPx:[[50,50],[150,50]],lengthM:1}}),/floor evidence/);
  assert.doesNotThrow(()=>store().buildRoomFromPhoto('scan',{scaleAnchor:{pointsPx:[[50,250],[150,250]],lengthM:1}}));
});
