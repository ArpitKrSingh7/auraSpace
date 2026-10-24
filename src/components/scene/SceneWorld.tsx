import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { BufferGeometry, Float32BufferAttribute, MathUtils, OrthographicCamera, PerspectiveCamera, Plane, Vector3 } from 'three';
import type { FurnitureItem, Room, SceneProps, ViewMode } from '../../domain/types';
import { FurnitureModel } from './FurnitureModel';

const FLOOR = new Plane(new Vector3(0, 1, 0), 0);

export function insideFootprint(x: number, z: number, item: FurnitureItem, margin = 0): boolean {
  const theta = MathUtils.degToRad(item.rotation);
  const dx = x - item.x, dz = z - item.z;
  const localX = dx * Math.cos(theta) + dz * Math.sin(theta);
  const localZ = -dx * Math.sin(theta) + dz * Math.cos(theta);
  return Math.abs(localX) < item.width / 2 + margin && Math.abs(localZ) < item.depth / 2 + margin;
}

export function canWalkTo(x: number, z: number, room: Room, items: FurnitureItem[]) {
  const margin = Math.min(.18, room.width / 10, room.depth / 10);
  return x >= margin && z >= margin && x <= room.width - margin && z <= room.depth - margin
    && !items.some(item => item.placed && item.type !== 'rug' && insideFootprint(x, z, item, margin));
}

export function clearWalkPath(from: { x: number; z: number }, to: { x: number; z: number }, room: Room, items: FurnitureItem[]) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .06));
  for (let i = 1; i <= steps; i++) if (!canWalkTo(from.x + (to.x - from.x) * i / steps, from.z + (to.z - from.z) * i / steps, room, items)) return false;
  return true;
}

export function initialEye(room: Room, items: FurnitureItem[]) {
  const candidates = [{ x: room.width / 2, z: room.depth * .83 }, { x: room.width / 2, z: room.depth / 2 }];
  for (let z = room.depth - .3; z >= .25; z -= .3) for (let x = .3; x <= room.width - .25; x += .3) candidates.push({ x, z });
  return candidates.find(p => canWalkTo(p.x, p.z, room, items)) ?? { x: room.width / 2, z: room.depth / 2 };
}

export function useSceneCamera(mode: ViewMode, room: Room, items: FurnitureItem[]) {
  const { set, size, invalidate } = useThree();
  const camera = useMemo(() => {
    if (mode === 'plan') {
      const c = new OrthographicCamera(-5, 5, 5, -5, .01, 100);
      c.position.set(room.width / 2, Math.max(room.width, room.depth) * 2 + 4, room.depth / 2);
      c.up.set(0, 0, -1); c.lookAt(room.width / 2, 0, room.depth / 2);
      return c;
    }
    const c = new PerspectiveCamera(mode === 'inside' ? 68 : 38, 1, .03, 150);
    if (mode === 'inside') {
      const eye = initialEye(room, items);
      c.position.set(eye.x, Math.min(1.55, room.height * .7), eye.z);
      c.lookAt(room.width / 2, Math.min(1.15, room.height * .5), room.depth * .15);
    } else {
      const max = Math.max(room.width, room.depth);
      c.position.set(room.width / 2 + max * 1.1, max * 1.05, room.depth / 2 + max * 1.15);
      c.lookAt(room.width / 2, .45, room.depth / 2);
    }
    return c;
  }, [mode, room.width, room.depth, room.height]);
  useEffect(() => { set({ camera }); invalidate(); }, [camera, set, invalidate]);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    if (camera instanceof OrthographicCamera) {
      const vertical = Math.max(room.depth + .8, (room.width + .8) / aspect);
      camera.left = -vertical * aspect / 2; camera.right = vertical * aspect / 2;
      camera.top = vertical / 2; camera.bottom = -vertical / 2;
    } else camera.aspect = aspect;
    camera.updateProjectionMatrix(); invalidate();
  }, [camera, room.width, room.depth, size.width, size.height, invalidate]);
  return camera;
}

function Solid({ at, size, color }: { at: [number, number, number]; size: [number, number, number]; color: string }) {
  return <mesh position={at} receiveShadow castShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={.92} /></mesh>;
}

function Wall({ room, side, height }: { room: Room; side: Room['door']['wall']; height: number }) {
  const horizontal = side === 'front' || side === 'back';
  const length = horizontal ? room.width : room.depth;
  const wallZ = side === 'front' ? room.depth + .065 : -.065;
  const wallX = side === 'right' ? room.width + .065 : -.065;
  const block = (start: number, size: number, h: number, bottom = 0, key = 'wall') => size > .001 && h > .001 ? <Solid key={key} at={horizontal ? [start + size / 2, bottom + h / 2, wallZ] : [wallX, bottom + h / 2, start + size / 2]} size={horizontal ? [size, h, .13] : [.13, h, size]} color={room.wallColor} /> : null;
  const hasDoor = room.door.wall === side;
  const offset = Math.max(0, Math.min(length - room.door.width, room.door.offset));
  const doorWidth = Math.min(room.door.width, length);
  const doorHeight = Math.min(2.12, room.height * .84);
  return <group>
    {hasDoor ? <>{block(0, offset, height, 0, 'a')}{block(offset + doorWidth, length - offset - doorWidth, height, 0, 'b')}{block(offset, doorWidth, height - doorHeight, doorHeight, 'header')}</> : block(0, length, height)}
    {(!hasDoor ? [[0, length]] : [[0, offset], [offset + doorWidth, length - offset - doorWidth]]).map(([start, size], i) => size > .001 ? <Solid key={`base-${i}`} at={horizontal ? [start + size / 2, .065, side === 'front' ? room.depth - .015 : .015] : [side === 'right' ? room.width - .015 : .015, .065, start + size / 2]} size={horizontal ? [size, .13, .025] : [.025, .13, size]} color="#e8e2d8" /> : null)}
    {hasDoor && <Solid at={horizontal ? [offset + doorWidth / 2, .012, side === 'front' ? room.depth : 0] : [side === 'right' ? room.width : 0, .012, offset + doorWidth / 2]} size={horizontal ? [doorWidth, .024, .21] : [.21, .024, doorWidth]} color="#ab9278" />}
  </group>;
}

function FloorLines({ room, grid }: { room: Room; grid: boolean }) {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    const step = grid ? .25 : .23;
    for (let x = step; x < room.width; x += step) vertices.push(x, .006, 0, x, .006, room.depth);
    if (grid) for (let z = step; z < room.depth; z += step) vertices.push(0, .006, z, room.width, .006, z);
    else for (let x = 0, i = 0; x < room.width; x += step, i++) for (let z = (i % 3) * .7 + .9; z < room.depth; z += 1.9) vertices.push(x, .007, z, Math.min(x + step, room.width), .007, z);
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(vertices, 3)); return g;
  }, [room.width, room.depth, grid]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry}><lineBasicMaterial color={grid ? '#8f9c89' : '#aa9273'} transparent opacity={grid ? .32 : .16} /></lineSegments>;
}

export function SelectionOutline({ item, color = '#3e6658' }: { item: FurnitureItem; color?: string }) {
  const geometry = useMemo(() => {
    const w = item.width / 2 + .035, d = item.depth / 2 + .035;
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute([-w, .035, -d, w, .035, -d, w, .035, -d, w, .035, d, w, .035, d, -w, .035, d, -w, .035, d, -w, .035, -d], 3)); return g;
  }, [item.width, item.depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group rotation={[0, -MathUtils.degToRad(item.rotation), 0]}>
    <lineSegments geometry={geometry}><lineBasicMaterial color={color} depthTest={false} /></lineSegments>
    <mesh position={[0, .026, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[item.width + .07, item.depth + .07]} /><meshBasicMaterial color={color} transparent opacity={.14} depthWrite={false} /></mesh>
    {[-1, 1].flatMap(x => [-1, 1].map(z => <mesh key={`${x},${z}`} position={[x * (item.width / 2 + .035), .045, z * (item.depth / 2 + .035)]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[.04, 16]} /><meshBasicMaterial color={color} depthTest={false} /></mesh>))}
  </group>;
}

export interface SceneWorldProps extends SceneProps {
  onInteractionChange?: (dragging: boolean) => void;
  onWalk?: (x: number, z: number) => void;
}

export function SceneWorld(props: SceneWorldProps) {
  const { project, mode, selectedId, showGrid, snap, onSelect, onMove, onPlace, placing, onInteractionChange, onWalk } = props;
  const room = project.room;
  const [preview, setPreview] = useState<{ id: string; x: number; z: number } | null>(null);
  const [hover, setHover] = useState({ x: room.width / 2, z: room.depth / 2 });
  const drag = useRef<{ id: string; dx: number; dz: number; moved: boolean; x: number; z: number } | null>(null);
  const { invalidate } = useThree();
  useEffect(() => { setPreview(null); drag.current = null; onInteractionChange?.(false); }, [project.id, mode]);

  const point = (e: ThreeEvent<PointerEvent>) => e.ray.intersectPlane(FLOOR, new Vector3());
  const candidate = (item: FurnitureItem, x: number, z: number) => {
    const theta = MathUtils.degToRad(item.rotation), halfX = Math.abs(Math.cos(theta)) * item.width / 2 + Math.abs(Math.sin(theta)) * item.depth / 2;
    const halfZ = Math.abs(Math.sin(theta)) * item.width / 2 + Math.abs(Math.cos(theta)) * item.depth / 2;
    const nx = snap ? Math.round(x * 10) / 10 : x, nz = snap ? Math.round(z * 10) / 10 : z;
    return { x: halfX <= room.width / 2 ? Math.max(halfX, Math.min(room.width - halfX, nx)) : room.width / 2, z: halfZ <= room.depth / 2 ? Math.max(halfZ, Math.min(room.depth - halfZ, nz)) : room.depth / 2 };
  };
  const down = (item: FurnitureItem, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect(item.id);
    if (placing || item.locked) return;
    const p = point(e); if (!p) return;
    drag.current = { id: item.id, dx: item.x - p.x, dz: item.z - p.z, moved: false, x: item.x, z: item.z };
    onInteractionChange?.(true);
    (e.target as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const p = point(e); if (!p) return;
    if (placing) { setHover(candidate(placing, p.x, p.z)); return; }
    if (!drag.current) return;
    e.stopPropagation();
    const item = project.items.find(i => i.id === drag.current!.id); if (!item) return;
    const pos = candidate(item, p.x + drag.current.dx, p.z + drag.current.dz);
    drag.current.moved ||= Math.hypot(pos.x - item.x, pos.z - item.z) > .015;
    drag.current.x = pos.x; drag.current.z = pos.z;
    setPreview({ id: item.id, ...pos }); invalidate();
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    e.stopPropagation();
    const d = drag.current; drag.current = null;
    (e.target as unknown as { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(e.pointerId);
    if (d.moved) onMove(d.id, d.x, d.z);
    setPreview(null); onInteractionChange?.(false);
  };

  return <group onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setPreview(null); onInteractionChange?.(false); }}>
    <ambientLight intensity={.9} />
    <hemisphereLight args={['#fff8eb', '#b4b6a4', 1.4]} />
    <directionalLight position={[room.width + 2, 8, room.depth - 2]} intensity={2.2} color="#fff5df" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-normalBias={.035} />
    <Solid at={[room.width / 2, -.105, room.depth / 2]} size={[room.width + .27, .2, room.depth + .27]} color="#e4dccf" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[room.width / 2, 0, room.depth / 2]} receiveShadow onClick={e => {
      if (e.delta > 5) return;
      e.stopPropagation();
      if (placing && onPlace) { const p = candidate(placing, e.point.x, e.point.z); onPlace(p.x, p.z); }
      else if (mode === 'inside') onWalk?.(e.point.x, e.point.z);
      else onSelect(null);
    }}>
      <planeGeometry args={[room.width, room.depth]} /><meshStandardMaterial color={room.floorColor} roughness={.92} />
    </mesh>
    <FloorLines room={room} grid={showGrid || mode === 'plan'} />
    {(['back', 'left', 'front', 'right'] as const).map(side => <Wall key={side} room={room} side={side} height={mode === 'plan' ? .075 : mode === 'overview' && (side === 'front' || side === 'right') ? .075 : room.height} />)}
    {mode === 'inside' && <mesh rotation={[Math.PI / 2, 0, 0]} position={[room.width / 2, room.height, room.depth / 2]}><planeGeometry args={[room.width, room.depth]} /><meshStandardMaterial color="#f8f5ee" /></mesh>}
    {project.items.filter(i => i.placed).map(item => {
      const p = preview?.id === item.id ? preview : item;
      return <group key={item.id} position={[p.x, 0, p.z]} onPointerDown={e => down(item, e)}>
        <FurnitureModel item={item} />
        {selectedId === item.id && <SelectionOutline item={item} />}
      </group>;
    })}
    {placing && <group position={[hover.x, .015, hover.z]}><FurnitureModel item={placing} opacity={.52} /><SelectionOutline item={placing} color="#397864" /></group>}
  </group>;
}
