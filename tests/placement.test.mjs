import test from 'node:test';
import assert from 'node:assert/strict';
import { Ray, Vector3 } from 'three';
import { makeItem, makeProject } from '../src/domain/catalog.ts';
import { attachToWall, mountingPose, placementPose } from '../src/domain/placement.ts';
import { placementFromRay } from '../src/components/scene/placement-ray.ts';
import { useAppStore } from '../src/store/useAppStore.ts';
const room = {...makeProject('Placement').room, width:5, depth:4, height:2.8};
const ac = makeItem('air-conditioner');
const state = () => useAppStore.getState();

test('wall fixtures face inward and remain exactly flush after snapping on all four walls', () => {
  for (const [wall, rotation, x, z] of [['back',0,2.3,.115],['front',180,2.3,3.885],['left',270,.115,1.8],['right',90,4.885,1.8]]) {
    const pose=attachToWall(ac,room,wall,2.34,1.83,2.63,true);
    assert.equal(pose.rotation,rotation);
    assert.equal(pose.x,x); assert.equal(pose.z,z);
    assert.equal(pose.elevationM,room.height-ac.height);
  }
});

test('grid snapping cannot push a rotated floor piece through the room boundary', () => {
  const item=makeItem('custom',{width:.73,depth:1.13,rotation:45});
  const pose=placementPose(item,room,100,-100,true);
  const half=(item.width+item.depth)/Math.sqrt(2)/2;
  assert.ok(Math.abs(pose.x-(room.width-half))<1e-9);
  assert.ok(Math.abs(pose.z-half)<1e-9);
});

test('switching surfaces resets height appropriately and clamps ceiling footprints', () => {
  const ceiling=mountingPose({...ac,x:-1,z:100},room,'ceiling',true);
  assert.equal(ceiling.elevationM,room.height-ac.height);
  assert.equal(ceiling.x,ac.width/2);
  assert.equal(ceiling.z,room.depth-ac.depth/2);
  assert.equal(mountingPose(ceiling,room,'floor',true).elevationM,0);
});

test('overview placement ignores the invisible upper section of cutaway walls', () => {
  const origin=new Vector3(2.5,4,7), target=new Vector3(2.5,1.5,0);
  const pose=placementFromRay(new Ray(origin,target.sub(origin).normalize()),ac,room,'overview',false);
  assert.equal(pose.rotation,0); assert.equal(pose.z,ac.depth/2);
  assert.ok(Math.abs(pose.elevationM-1.35)<1e-9);
});

test('placement on existing furniture still targets the room surface', () => {
  const ray=new Ray(new Vector3(2,10,2),new Vector3(0,-1,0));
  const pose=placementFromRay(ray,ac,room,'plan',true);
  assert.equal(pose.z,ac.depth/2);
  assert.equal(pose.elevationM,ac.elevationM);
});

test('wall drop persists its exact inset and height in one undo step', () => {
  state().createProject('Wall placement',5,4,2.8);
  state().startPlacing('air-conditioner');
  const pose=attachToWall(state().placingItem,room,'back',2,0,2.1,true);
  state().confirmPlacing(pose.x,pose.z,pose);
  const item=state().activeProject().items[0];
  assert.equal(item.z,.115); assert.equal(item.elevationM,2.1);
  state().undo(); assert.equal(state().activeProject().items.length,0);
  state().redo(); assert.deepEqual(state().activeProject().items[0],item);
  state().moveItem(item.id,3,.115,{rotation:0,elevationM:2.4});
  assert.equal(state().activeProject().items[0].elevationM,2.4);
  state().undo(); assert.deepEqual(state().activeProject().items[0],item);
});

test('repositioning keeps identity; cancelling a surface change does not edit the original', () => {
  state().createProject('Reposition',5,4,2.8); state().addItem('air-conditioner',{placed:true,x:2,z:.115});
  const item=state().activeProject().items[0];
  useAppStore.setState({placingItem:item,placingType:item.type}); state().setPlacementSurface('ceiling'); state().cancelPlacing();
  assert.deepEqual(state().activeProject().items[0],item);
  useAppStore.setState({placingItem:item,placingType:item.type}); state().setPlacementSurface('ceiling'); state().confirmPlacing(2,2);
  assert.equal(state().activeProject().items.length,1); assert.equal(state().activeProject().items[0].id,item.id);
  assert.equal(state().activeProject().items[0].mounting,'ceiling');
  state().undo(); assert.deepEqual(state().activeProject().items[0],item);
});

test('explicit wall orientation survives a near-corner drop of a deep custom fixture', () => {
  state().createProject('Deep wall object',5,4,2.8);
  const item=makeItem('custom',{width:.1,depth:1,mounting:'wall',elevationM:1});
  useAppStore.setState({placingItem:item,placingType:item.type});
  const pose=attachToWall(item,room,'back',0,0,1,true);
  state().confirmPlacing(pose.x,pose.z,pose);
  const saved=state().activeProject().items[0];
  assert.equal(saved.rotation,0); assert.equal(saved.z,.5); assert.equal(saved.x,.05);
});

test('wall fixtures stay attached when resized and cannot be freely rotated off the wall', () => {
  state().createProject('Wall fixture sizing',5,4,2.8);
  state().addItem('air-conditioner',{placed:true,x:2.5,z:.115,elevationM:2});
  const item=state().activeProject().items[0];
  const history=state().historyIndex;
  state().rotateItem(item.id,45);
  state().updateItem(item.id,{rotation:45});
  state().updateItem(item.id,{mounting:'wall'});
  assert.deepEqual(state().activeProject().items[0],item);
  assert.equal(state().historyIndex,history);
  state().resizeItem(item.id,item.width,.5,item.height);
  const resized=state().activeProject().items[0];
  assert.equal(resized.z,.25);
  assert.equal(resized.rotation,0);
  assert.equal(resized.elevationM,2);
  state().undo(); assert.deepEqual(state().activeProject().items[0],item);
});
