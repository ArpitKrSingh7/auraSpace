import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import {
  BufferGeometry,
  Float32BufferAttribute,
  MathUtils,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Vector3,
} from 'three';
import type {
  FurnitureItem,
  Room,
  SceneProps,
  ViewMode,
} from '../../domain/types';
import { getItemElevation, getRoomOpenings, roomOpeningToCanonical, validatePlacement } from '../../domain/geometry';
import { getOpeningLeaf } from '@auraspace/scene-domain';
import { FurnitureModel } from './FurnitureModel';
import { attachToWall, nearestWall, placementPose, type PlacementPose, type WallSide } from '../../domain/placement';
import { placementFromRay, wallPoint } from './placement-ray';

const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
type PointerCapture = { pointerId: number; target: { setPointerCapture?: (id: number) => void; releasePointerCapture?: (id: number) => void } };
function releaseCapture(capture?: PointerCapture) {
  // Keep the original event target: releasing from a bubbling parent leaves
  // Fiber's captured object registered and steals subsequent room clicks.
  try { capture?.target.releasePointerCapture?.(capture.pointerId); }
  catch { /* The browser may already have released a cancelled pointer. */ }
}

export function insideFootprint(
  x: number,
  z: number,
  item: FurnitureItem,
  margin = 0,
): boolean {
  const theta = MathUtils.degToRad(item.rotation);
  const dx = x - item.x,
    dz = z - item.z;
  const localX = dx * Math.cos(theta) + dz * Math.sin(theta);
  const localZ = -dx * Math.sin(theta) + dz * Math.cos(theta);
  return (
    Math.abs(localX) < item.width / 2 + margin &&
    Math.abs(localZ) < item.depth / 2 + margin
  );
}

export function canWalkTo(
  x: number,
  z: number,
  room: Room,
  items: FurnitureItem[],
) {
  const margin = Math.min(0.18, room.width / 10, room.depth / 10);
  return (
    x >= margin &&
    z >= margin &&
    x <= room.width - margin &&
    z <= room.depth - margin &&
    !items.some(
      (item) =>
        item.placed &&
        item.type !== 'rug' &&
        getItemElevation(item, room.height) < 1.8 &&
        insideFootprint(x, z, item, margin),
    )
  );
}

export function clearWalkPath(
  from: { x: number; z: number },
  to: { x: number; z: number },
  room: Room,
  items: FurnitureItem[],
) {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.06),
  );
  for (let i = 1; i <= steps; i++)
    if (
      !canWalkTo(
        from.x + ((to.x - from.x) * i) / steps,
        from.z + ((to.z - from.z) * i) / steps,
        room,
        items,
      )
    )
      return false;
  return true;
}

export function initialEye(room: Room, items: FurnitureItem[]) {
  const candidates = [
    { x: room.width / 2, z: room.depth * 0.83 },
    { x: room.width / 2, z: room.depth / 2 },
  ];
  for (let z = room.depth - 0.3; z >= 0.25; z -= 0.3)
    for (let x = 0.3; x <= room.width - 0.25; x += 0.3)
      candidates.push({ x, z });
  return (
    candidates.find((p) => canWalkTo(p.x, p.z, room, items)) ?? {
      x: room.width / 2,
      z: room.depth / 2,
    }
  );
}

export function useSceneCamera(
  mode: ViewMode,
  room: Room,
  items: FurnitureItem[],
) {
  const { set, size, invalidate } = useThree();
  const camera = useMemo(() => {
    if (mode === 'plan') {
      const c = new OrthographicCamera(-5, 5, 5, -5, 0.01, 100);
      c.position.set(
        room.width / 2,
        Math.max(room.width, room.depth) * 2 + 4,
        room.depth / 2,
      );
      c.up.set(0, 0, -1);
      c.lookAt(room.width / 2, 0, room.depth / 2);
      return c;
    }
    const c = new PerspectiveCamera(mode === 'inside' ? 68 : 38, 1, 0.03, 150);
    if (mode === 'inside') {
      const eye = initialEye(room, items);
      c.position.set(eye.x, Math.min(1.55, room.height * 0.7), eye.z);
      c.lookAt(
        room.width / 2,
        Math.min(1.15, room.height * 0.5),
        room.depth * 0.15,
      );
    } else {
      const max = Math.max(room.width, room.depth);
      c.position.set(
        room.width / 2 + max * 1.1,
        max * 1.05,
        room.depth / 2 + max * 1.15,
      );
      c.lookAt(room.width / 2, 0.45, room.depth / 2);
    }
    return c;
  }, [mode, room.width, room.depth, room.height]);
  useEffect(() => {
    set({ camera });
    invalidate();
  }, [camera, set, invalidate]);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    if (camera instanceof OrthographicCamera) {
      const vertical = Math.max(room.depth + 0.8, (room.width + 0.8) / aspect);
      camera.left = (-vertical * aspect) / 2;
      camera.right = (vertical * aspect) / 2;
      camera.top = vertical / 2;
      camera.bottom = -vertical / 2;
    } else camera.aspect = aspect;
    if (camera instanceof PerspectiveCamera && mode === 'overview') {
      const max = Math.max(room.width, room.depth),
        fit = Math.max(1, 1.08 / aspect);
      camera.position.set(
        room.width / 2 + max * 1.1 * fit,
        max * 1.05 * fit,
        room.depth / 2 + max * 1.15 * fit,
      );
      camera.lookAt(room.width / 2, 0.45, room.depth / 2);
    }
    camera.updateProjectionMatrix();
    invalidate();
  }, [
    camera,
    mode,
    room.width,
    room.depth,
    size.width,
    size.height,
    invalidate,
  ]);
  return camera;
}

function Solid({
  at,
  size,
  color,
}: {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={at} receiveShadow castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
  );
}

function Wall({
  room,
  side,
  height,
  onOpeningSelect,
  selectedOpeningId,
  placing = false,
}: {
  room: Room;
  side: Room['door']['wall'];
  height: number;
  onOpeningSelect?: (id: string) => void;
  selectedOpeningId?: string | null;
  placing?: boolean;
}) {
  const horizontal = side === 'front' || side === 'back';
  const length = horizontal ? room.width : room.depth;
  const wallZ = side === 'front' ? room.depth + 0.065 : -0.065;
  const wallX = side === 'right' ? room.width + 0.065 : -0.065;
  const block = (
    start: number,
    size: number,
    h: number,
    bottom = 0,
    key = 'wall',
  ) =>
    size > 0.001 && h > 0.001 ? (
      <Solid
        key={key}
        at={
          horizontal
            ? [start + size / 2, bottom + h / 2, wallZ]
            : [wallX, bottom + h / 2, start + size / 2]
        }
        size={horizontal ? [size, h, 0.13] : [0.13, h, size]}
        color={room.wallColor}
      />
    ) : null;
  const openings = getRoomOpenings(room).filter((opening) => opening.wall === side).sort((a, b) => a.offset - b.offset);
  // Fill wall intervals around every opening; vertically stacked openings share a span.
  const cuts = [...new Set([0, length, ...openings.flatMap((opening) => [opening.offset, opening.offset + opening.width])])].sort((a, b) => a - b);
  const structure = cuts.slice(0, -1).flatMap((start, index) => {
    const end = cuts[index + 1];
    const holes = openings.filter((opening) => opening.offset < end - 1e-6 && opening.offset + opening.width > start + 1e-6).sort((a, b) => a.sillHeight - b.sillHeight);
    const blocks: React.ReactNode[] = [];
    let bottom = 0;
    for (const hole of holes) {
      blocks.push(block(start, end - start, Math.max(0, Math.min(height, hole.sillHeight) - bottom), bottom, `${index}-${hole.id}`));
      bottom = Math.max(bottom, hole.sillHeight + hole.height);
    }
    blocks.push(block(start, end - start, Math.max(0, height - bottom), bottom, `${index}-top`));
    return blocks;
  });
  const baseCuts = openings.filter((opening) => opening.sillHeight < 0.13);
  const baseSegments: Array<[number, number]> = [];
  let baseEnd = 0;
  for (const opening of baseCuts) {
    if (opening.offset > baseEnd) baseSegments.push([baseEnd, opening.offset - baseEnd]);
    baseEnd = Math.max(baseEnd, opening.offset + opening.width);
  }
  if (baseEnd < length) baseSegments.push([baseEnd, length - baseEnd]);
  return (
    <group>
      {structure}
      {baseSegments.map(([start, size], i) =>
        size > 0.001 ? (
          <Solid
            key={`base-${i}`}
            at={
              horizontal
                ? [
                    start + size / 2,
                    0.065,
                    side === 'front' ? room.depth - 0.015 : 0.015,
                  ]
                : [
                    side === 'right' ? room.width - 0.015 : 0.015,
                    0.065,
                    start + size / 2,
                  ]
            }
            size={horizontal ? [size, 0.13, 0.025] : [0.025, 0.13, size]}
            color="#e8e2d8"
          />
        ) : null,
      )}
      {openings.map((opening) => {
        const floor: [number, number][] = [[0, 0], [room.width, 0], [room.width, room.depth], [0, room.depth]];
        const leaf = getOpeningLeaf(floor, roomOpeningToCanonical(room, opening));
        const h = height < 0.1 ? 0.045 : leaf.heightM;
        const sill = height < 0.1 ? 0 : leaf.sillHeightM;
        const trim = Math.min(0.045, leaf.widthM / 5, h / 5);
        const frameColor = opening.id === selectedOpeningId ? '#8db5a5' : opening.kind === 'door' ? '#c9af8d' : '#edf3ee';
        return (
          <group key={opening.id} name={`opening-${opening.id}`} position={[leaf.center[0], sill + h / 2, leaf.center[1]]} rotation={[0, leaf.yawRad, 0]}
            onPointerDown={(event) => { if (!placing) event.stopPropagation(); }}
            onClick={(event) => {
              if (placing) return;
              event.stopPropagation();
              if (event.button === 0 && event.delta <= 5) onOpeningSelect?.(opening.id);
            }}>
            {opening.kind === 'door' || height < 0.1 ? <>
              <Solid at={[0, 0, 0]} size={[leaf.widthM, h, 0.04]} color={frameColor} />
              {height >= 0.1 && <Solid at={[leaf.widthM / 2 - Math.min(0.1, leaf.widthM / 4), 0, 0]} size={[0.035, 0.035, 0.12]} color="#675844" />}
            </> : <>
              <Solid at={[-leaf.widthM / 2 + trim / 2, 0, 0]} size={[trim, h, 0.05]} color={frameColor} />
              <Solid at={[leaf.widthM / 2 - trim / 2, 0, 0]} size={[trim, h, 0.05]} color={frameColor} />
              <Solid at={[0, h / 2 - trim / 2, 0]} size={[leaf.widthM, trim, 0.05]} color={frameColor} />
              <Solid at={[0, -h / 2 + trim / 2, 0]} size={[leaf.widthM, trim, 0.05]} color={frameColor} />
              <mesh><boxGeometry args={[leaf.widthM - trim * 2, h - trim * 2, 0.012]} /><meshStandardMaterial color="#a8cad5" transparent opacity={0.38} roughness={0.15} depthWrite={false} /></mesh>
            </>}
          </group>
        );
      })}
    </group>
  );
}

function FloorLines({ room, grid }: { room: Room; grid: boolean }) {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    const step = grid ? 0.25 : 0.23;
    for (let x = step; x < room.width; x += step)
      vertices.push(x, 0.006, 0, x, 0.006, room.depth);
    if (grid)
      for (let z = step; z < room.depth; z += step)
        vertices.push(0, 0.006, z, room.width, 0.006, z);
    else
      for (let x = 0, i = 0; x < room.width; x += step, i++)
        for (let z = (i % 3) * 0.7 + 0.9; z < room.depth; z += 1.9)
          vertices.push(x, 0.007, z, Math.min(x + step, room.width), 0.007, z);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    return g;
  }, [room.width, room.depth, grid]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial
        color={grid ? '#8f9c89' : '#aa9273'}
        transparent
        opacity={grid ? 0.32 : 0.16}
      />
    </lineSegments>
  );
}

export function SelectionOutline({
  item,
  color = '#3e6658',
  roomHeight,
}: {
  item: FurnitureItem;
  color?: string;
  roomHeight?: number;
}) {
  const geometry = useMemo(() => {
    const w = item.width / 2 + 0.035,
      d = item.depth / 2 + 0.035;
    const g = new BufferGeometry();
    g.setAttribute(
      'position',
      new Float32BufferAttribute(
        [
          -w,
          0.035,
          -d,
          w,
          0.035,
          -d,
          w,
          0.035,
          -d,
          w,
          0.035,
          d,
          w,
          0.035,
          d,
          -w,
          0.035,
          d,
          -w,
          0.035,
          d,
          -w,
          0.035,
          -d,
        ],
        3,
      ),
    );
    return g;
  }, [item.width, item.depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={[0, getItemElevation(item, roomHeight), 0]} rotation={[0, -MathUtils.degToRad(item.rotation), 0]}>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color={color} depthTest={false} />
      </lineSegments>
      <mesh position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[item.width + 0.07, item.depth + 0.07]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.14}
          depthWrite={false}
        />
      </mesh>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh
            key={`${x},${z}`}
            position={[
              x * (item.width / 2 + 0.035),
              0.045,
              z * (item.depth / 2 + 0.035),
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[0.04, 16]} />
            <meshBasicMaterial color={color} depthTest={false} />
          </mesh>
        )),
      )}
    </group>
  );
}

export interface SceneWorldProps extends SceneProps {
  onInteractionChange?: (dragging: boolean) => void;
  onWalk?: (x: number, z: number) => void;
}

export function SceneWorld(props: SceneWorldProps) {
  const {
    project,
    mode,
    selectedId,
    showGrid,
    snap,
    onSelect,
    onOpeningSelect,
    selectedOpeningId,
    onMove,
    onRotate,
    onPlace,
    placing,
    onInteractionChange,
    onWalk,
  } = props;
  const room = project.room;
  const roomPointer = useRef(false);
  const [preview, setPreview] = useState<{
    id: string;
    x: number;
    z: number;
    rotation?: number;
    elevationM?: number;
  } | null>(null);
  const rotationDrag = useRef<{ id: string; startAngle: number; startRotation: number; rotation: number; elevationM: number; capture: PointerCapture } | null>(null);
  const [hover, setHover] = useState<PlacementPose | null>(null);
  const drag = useRef<{
    id: string;
    dx: number;
    dz: number;
    moved: boolean;
    x: number;
    z: number;
    elevationM: number;
    dy: number;
    wall?: WallSide;
    startX: number;
    startY: number;
    threshold: number;
    pose?: PlacementPose;
    capture: PointerCapture;
  } | null>(null);
  const { invalidate, gl } = useThree();
  const cancelGesture = () => {
    const oldDrag = drag.current, oldRotation = rotationDrag.current;
    drag.current = null; rotationDrag.current = null;
    releaseCapture(oldDrag?.capture); releaseCapture(oldRotation?.capture);
    roomPointer.current = false; setPreview(null); onInteractionChange?.(false);
    gl.domElement.style.cursor = '';
  };
  useEffect(() => {
    const cancel = () => cancelGesture();
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelGesture(); };
    const lost = (e: PointerEvent) => {
      const capture = drag.current?.capture ?? rotationDrag.current?.capture;
      if (capture?.pointerId === e.pointerId) cancelGesture();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', cancel);
      window.addEventListener('keydown', escape);
    }
    // Fiber clears hover on pointercancel without dispatching it through meshes.
    // Listen on the canvas as well so cancelled touch gestures never commit later.
    gl.domElement.addEventListener('pointercancel', lost);
    gl.domElement.addEventListener('lostpointercapture', lost);
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', cancel);
        window.removeEventListener('keydown', escape);
      }
      gl.domElement.removeEventListener('pointercancel', lost);
      gl.domElement.removeEventListener('lostpointercapture', lost);
      releaseCapture(drag.current?.capture); releaseCapture(rotationDrag.current?.capture);
      onInteractionChange?.(false);
    };
  }, [gl, onInteractionChange]);
  useEffect(() => { setHover(null); }, [placing?.id, placing?.mounting, mode]);
  useEffect(() => {
    releaseCapture(drag.current?.capture);
    releaseCapture(rotationDrag.current?.capture);
    setPreview(null);
    drag.current = null;
    rotationDrag.current = null;
    onInteractionChange?.(false);
  }, [project.id, mode]);

  const point = (e: ThreeEvent<PointerEvent>, elevationM = 0) =>
    e.ray.intersectPlane(elevationM ? new Plane(new Vector3(0, 1, 0), -elevationM) : FLOOR, new Vector3());
  const down = (item: FurnitureItem, e: ThreeEvent<PointerEvent>) => {
    if (placing || e.button !== 0 || drag.current || rotationDrag.current) return;
    e.stopPropagation();
    roomPointer.current = false;
    onSelect(item.id);
    if (item.locked) return;
    const elevationM = getItemElevation(item, room.height);
    const wall = item.mounting === 'wall' && mode !== 'plan' ? nearestWall(item.x, item.z, room) : undefined;
    const p = wall ? wallPoint(e.ray, room, wall, item.depth / 2) : point(e, elevationM);
    if (!p) return;
    drag.current = {
      id: item.id, dx: item.x - p.x, dz: item.z - p.z, dy: elevationM - p.y,
      moved: false, x: item.x, z: item.z, elevationM, wall,
      startX: e.clientX, startY: e.clientY, threshold: e.pointerType === 'touch' ? 8 : 5,
      capture: { pointerId: e.pointerId, target: e.target as unknown as PointerCapture['target'] },
    };
    onInteractionChange?.(true);
    gl.domElement.style.cursor = 'grabbing';
    (e.target as unknown as PointerCapture['target']).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (placing) {
      setHover(placementFromRay(e.ray, placing, room, mode, snap));
      return;
    }
    if (rotationDrag.current) {
      const gesture = rotationDrag.current;
      if (gesture.capture.pointerId !== e.pointerId) return;
      e.stopPropagation();
      const p = point(e, gesture.elevationM);
      const item = project.items.find((candidate) => candidate.id === gesture.id);
      if (!p || !item || Math.hypot(p.x - item.x, p.z - item.z) < 0.05) return;
      const angle = Math.atan2(p.z - item.z, p.x - item.x);
      const delta = Math.atan2(Math.sin(angle - gesture.startAngle), Math.cos(angle - gesture.startAngle));
      gesture.rotation = ((Math.round(gesture.startRotation + MathUtils.radToDeg(delta)) % 360) + 360) % 360;
      setPreview({ id: item.id, x: item.x, z: item.z, rotation: gesture.rotation });
      invalidate();
      return;
    }
    const gesture = drag.current;
    if (!gesture || gesture.capture.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (!gesture.moved && Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) < gesture.threshold) return;
    const item = project.items.find((i) => i.id === gesture.id);
    if (!item) return;
    const p = gesture.wall ? wallPoint(e.ray, room, gesture.wall, item.depth / 2) : point(e, gesture.elevationM);
    if (!p) return;
    const pose = gesture.wall
      ? attachToWall(item, room, gesture.wall, p.x + gesture.dx, p.z + gesture.dz, p.y + gesture.dy, snap)
      : placementPose(item, room, p.x + gesture.dx, p.z + gesture.dz, snap);
    gesture.moved = true;
    gesture.pose = pose;
    setPreview({ id: item.id, ...pose });
    invalidate();
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    if (rotationDrag.current) {
      const gesture = rotationDrag.current;
      if (gesture.capture.pointerId !== e.pointerId) return;
      e.stopPropagation();
      rotationDrag.current = null;
      releaseCapture(gesture.capture);
      if (gesture.rotation !== gesture.startRotation) onRotate?.(gesture.id, gesture.rotation);
      setPreview(null);
      onInteractionChange?.(false);
      return;
    }
    if (!drag.current || drag.current.capture.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const d = drag.current;
    drag.current = null;
    releaseCapture(d.capture);
    if (d.moved && d.pose) onMove(d.id, d.pose.x, d.pose.z, d.pose);
    gl.domElement.style.cursor = '';
    setPreview(null);
    onInteractionChange?.(false);
  };

  return (
    <group
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancelGesture}
      onPointerDown={(e) => { if (placing && e.button === 0) roomPointer.current = true; }}
      onClick={(e) => {
        if (!placing || e.button !== 0) return;
        e.stopPropagation();
        if (e.delta > 5 || !roomPointer.current) return;
        roomPointer.current = false;
        const pose = placementFromRay(e.ray, placing, room, mode, snap);
        if (pose) onPlace?.(pose.x, pose.z, pose);
      }}
    >
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#fff8eb', '#b4b6a4', 1.4]} />
      <directionalLight
        position={[room.width + 2, 8, room.depth - 2]}
        intensity={2.2}
        color="#fff5df"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-normalBias={0.035}
      />
      <group name="room-surfaces"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if (!placing) event.stopPropagation();
          roomPointer.current = true;
        }}
        onClick={(event) => {
          if (placing) return;
          event.stopPropagation();
          if (event.button === 0 && event.delta <= 5 && roomPointer.current && !placing) onSelect(null);
        }}>
      <Solid
        at={[room.width / 2, -0.105, room.depth / 2]}
        size={[room.width + 0.27, 0.2, room.depth + 0.27]}
        color="#e4dccf"
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[room.width / 2, 0, room.depth / 2]}
        receiveShadow
        onClick={(e) => {
          if (placing) return;
          e.stopPropagation();
          if (e.button !== 0 || e.delta > 5 || !roomPointer.current) return;
          onSelect(null);
          if (mode === 'inside') onWalk?.(e.point.x, e.point.z);
        }}
      >
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial color={room.floorColor} roughness={0.92} />
      </mesh>
      <FloorLines room={room} grid={showGrid || mode === 'plan'} />
      {(['back', 'left', 'front', 'right'] as const).map((side) => (
        <Wall
          key={side}
          room={room}
          side={side}
          placing={!!placing}
          onOpeningSelect={placing ? undefined : onOpeningSelect}
          selectedOpeningId={selectedOpeningId}
          height={
            mode === 'plan'
              ? 0.075
              : mode === 'overview' && (side === 'front' || side === 'right')
                ? 0.075
                : room.height
          }
        />
      ))}
      {mode === 'inside' && (
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          position={[room.width / 2, room.height, room.depth / 2]}
        >
          <planeGeometry args={[room.width, room.depth]} />
          <meshStandardMaterial color="#f8f5ee" />
        </mesh>
      )}
      </group>
      {project.items
        .filter((i) => i.placed && i.id !== placing?.id)
        .map((item) => {
          const p = preview?.id === item.id ? preview : item;
          const displayedItem = { ...item, ...p };
          return (
            <group
              key={item.id}
              name={`furniture-${item.id}`}
              position={[p.x, 0, p.z]}
              onPointerDown={(e) => down(item, e)}
              onClick={(e) => {
                // Clicks have their own hit propagation, separate from pointer-down.
                // Consume this hit so the floor cannot immediately clear selection.
                if (placing) return;
                e.stopPropagation();
                if (e.button === 0 && e.delta <= 5) onSelect(item.id);
              }}
            >
              <mesh position={[0, getItemElevation(displayedItem, room.height) + item.height / 2, 0]}
                rotation={[0, -MathUtils.degToRad(displayedItem.rotation), 0]}>
                <boxGeometry args={[item.width, item.height, item.depth]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <FurnitureModel item={displayedItem} roomHeight={room.height} />
              {selectedId === item.id && (
                <SelectionOutline
                  item={displayedItem}
                  roomHeight={room.height}
                  color={
                    validatePlacement(
                      { ...displayedItem, x: p.x, z: p.z },
                      room,
                      project.items,
                    ).length
                      ? '#b45339'
                      : '#3e6658'
                  }
                />
              )}
              {selectedId === item.id && !item.locked && item.mounting !== 'wall' && !placing && onRotate && (
                <group rotation={[0, -MathUtils.degToRad(displayedItem.rotation), 0]}>
                  <mesh
                    position={[0, getItemElevation(item, room.height) + 0.07, -item.depth / 2 - 0.25]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    renderOrder={20}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.button !== 0) return;
                      roomPointer.current = false;
                      const elevationM = getItemElevation(item, room.height);
                      const hit = point(e, elevationM);
                      if (!hit) return;
                      rotationDrag.current = {
                        id: item.id,
                        startAngle: Math.atan2(hit.z - item.z, hit.x - item.x),
                        startRotation: item.rotation,
                        rotation: item.rotation,
                        elevationM,
                        capture: { pointerId: e.pointerId, target: e.target as unknown as PointerCapture['target'] },
                      };
                      drag.current = null;
                      onInteractionChange?.(true);
                      (e.target as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <circleGeometry args={[0.1, 24]} />
                    <meshBasicMaterial color="#3e6658" depthTest={false} />
                  </mesh>
                  <mesh position={[0, getItemElevation(item, room.height) + 0.072, -item.depth / 2 - 0.25]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={21} raycast={() => null}>
                    <ringGeometry args={[0.048, 0.062, 24]} />
                    <meshBasicMaterial color="#ffffff" depthTest={false} />
                  </mesh>
                </group>
              )}
            </group>
          );
        })}
      {placing && hover && (
        <group position={[hover.x, 0, hover.z]}>
          <FurnitureModel item={{ ...placing, ...hover }} roomHeight={room.height} opacity={0.52} />
          <SelectionOutline
            item={{ ...placing, ...hover }}
            roomHeight={room.height}
            color={
              validatePlacement(
                { ...placing, ...hover, placed: true },
                room,
                project.items.filter((i) => i.id !== placing.id),
              ).length
                ? '#b45339'
                : '#397864'
            }
          />
        </group>
      )}
    </group>
  );
}
