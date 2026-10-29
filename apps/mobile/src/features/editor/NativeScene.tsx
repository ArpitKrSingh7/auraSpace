import { FurnitureModel } from '@auraspace/scene-assets';
import {
  activeLayout,
  bounds,
  canStand,
  getOpeningLeaf,
  getItemElevation,
  legacyItem,
  placementWarnings,
  walkPathClear,
  type Placement,
  type RoomScene,
} from '@auraspace/scene-domain';
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from '@react-three/fiber/native';
import React from 'react';
import { PanResponder, View } from 'react-native';
import {
  DoubleSide,
  PerspectiveCamera,
  Plane,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import type { ViewportHandle } from './PlanView';
const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
interface Props {
  scene: RoomScene;
  mode: 'overview' | 'inside';
  selectedId: string | null;
  placingId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  onRotate: (id: string, yawRad: number) => void;
  rotationPreview?: { id: string; yawRad: number } | null;
  onPlace: (x: number, z: number) => void;
  reset: number;
  eyeHeight: number;
  showGrid: boolean;
  candidate?: [number, number] | null;
  onUnavailable?: () => void;
}
export interface NativeViewportHandle extends ViewportHandle {
  capture: () => Promise<string | null>;
}
function Box({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}
function Wall({
  scene,
  index,
  cutaway,
}: {
  scene: RoomScene;
  index: number;
  cutaway: boolean;
}) {
  const a = scene.floorPolygonXZ[index],
    b = scene.floorPolygonXZ[(index + 1) % scene.floorPolygonXZ.length],
    length = Math.hypot(b[0] - a[0], b[1] - a[1]),
    height = cutaway ? 0.08 : scene.height.meters,
    openings = scene.openings
      .filter((o) => o.wallIndex === index)
      .sort((a, b) => a.offsetM - b.offsetM),
    blocks: React.ReactNode[] = [];
  const block = (
    start: number,
    width: number,
    bottom: number,
    h: number,
    key: string,
  ) => {
    if (width > 0.001 && h > 0.001)
      blocks.push(
        <Box
          key={key}
          position={[start + width / 2, bottom + h / 2, 0]}
          size={[width, h, 0.12]}
          color={scene.wallColor}
        />,
      );
  };
  const divisions = [...new Set([0, length, ...openings.flatMap((o) => [o.offsetM, o.offsetM + o.widthM])])].sort((x, y) => x - y);
  divisions.slice(0, -1).forEach((start, i) => {
    const width = divisions[i + 1] - start,
      middle = start + width / 2,
      holes = openings.filter((o) => middle > o.offsetM && middle < o.offsetM + o.widthM).sort((x, y) => x.sillHeightM - y.sillHeightM);
    let bottom = 0;
    holes.forEach((o, j) => {
      block(start, width, bottom, Math.min(height, o.sillHeightM) - bottom, `span-${i}-${j}`);
      bottom = Math.max(bottom, Math.min(height, o.sillHeightM + o.heightM));
    });
    block(start, width, bottom, height - bottom, `span-${i}-top`);
  });
  openings.forEach((o, i) => {
    if (height > 0.1) {
      const trim = 0.045;
      blocks.push(<React.Fragment key={`frame-${i}`}>
        <Box position={[o.offsetM, o.sillHeightM + o.heightM / 2, 0]} size={[trim, o.heightM + trim, 0.17]} color="#f2eee5" />
        <Box position={[o.offsetM + o.widthM, o.sillHeightM + o.heightM / 2, 0]} size={[trim, o.heightM + trim, 0.17]} color="#f2eee5" />
        <Box position={[o.offsetM + o.widthM / 2, o.sillHeightM + o.heightM, 0]} size={[o.widthM, trim, 0.17]} color="#f2eee5" />
        {o.kind === 'window' && <Box position={[o.offsetM + o.widthM / 2, o.sillHeightM, 0]} size={[o.widthM, trim, 0.17]} color="#f2eee5" />}
      </React.Fragment>);
    }
  });
  return (
    <>
    <group
      position={[a[0], 0, a[1]]}
      rotation={[0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0]}
    >
      {blocks}
    </group>
    {openings.map((opening) => {
      const leaf = getOpeningLeaf(scene.floorPolygonXZ, opening),
        w = leaf.widthM, h = leaf.heightM, t = leaf.thicknessM,
        frame = Math.min(0.045, w / 5, h / 5);
      return (
        <group key={`leaf-${opening.id}`} position={[leaf.center[0], leaf.sillHeightM + h / 2, leaf.center[1]]} rotation={[0, leaf.yawRad, 0]}>
          {opening.kind === 'door' ? (
            <>
              <Box position={[0, 0, 0]} size={[w, h, t]} color="#b79a78" />
              <Box position={[0, 0, t * 0.55]} size={[Math.max(0.04, w - 0.14), Math.max(0.04, h - 0.2), 0.009]} color="#c5ab8d" />
              <Box position={[w / 2 - Math.min(0.1, w / 4), -h * 0.06, 0]} size={[0.035, 0.035, t + 0.07]} color="#655d4b" />
            </>
          ) : (
            <>
              <Box position={[-w / 2 + frame / 2, 0, 0]} size={[frame, h, t]} color="#e6eee8" />
              <Box position={[w / 2 - frame / 2, 0, 0]} size={[frame, h, t]} color="#e6eee8" />
              <Box position={[0, h / 2 - frame / 2, 0]} size={[w, frame, t]} color="#e6eee8" />
              <Box position={[0, -h / 2 + frame / 2, 0]} size={[w, frame, t]} color="#e6eee8" />
              <mesh>
                <boxGeometry args={[w - frame * 2, h - frame * 2, 0.012]} />
                <meshStandardMaterial color="#a8ced6" transparent opacity={0.38} roughness={0.18} depthWrite={false} />
              </mesh>
              <Box position={[w / 2 - frame * 1.6, 0, t]} size={[0.025, Math.min(0.12, h / 3), 0.03]} color="#6c807c" />
            </>
          )}
        </group>
      );
    })}
    </>
  );
}
function RoomFloor({ scene }: { scene: RoomScene }) {
  const geometry = React.useMemo(() => {
    const shape = new Shape();
    scene.floorPolygonXZ.forEach((p, i) =>
      i ? shape.lineTo(p[0], -p[1]) : shape.moveTo(p[0], -p[1]),
    );
    shape.closePath();
    return new ShapeGeometry(shape);
  }, [scene.floorPolygonXZ]);
  React.useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial
        color={scene.floorColor}
        roughness={0.93}
        side={DoubleSide}
      />
    </mesh>
  );
}
function initialEye(scene: RoomScene) {
  const b = bounds(scene);
  for (let z = b.minZ + b.depth - 0.3; z > b.minZ + 0.2; z -= 0.3)
    for (let x = b.minX + 0.3; x < b.minX + b.width - 0.2; x += 0.3)
      if (canStand(scene, x, z)) return [x, z] as [number, number];
  return [b.minX + b.width / 2, b.minZ + b.depth / 2] as [number, number];
}
interface Bridge {
  camera: PerspectiveCamera | null;
  ray: (x: number, y: number) => [number, number] | null;
  capture: () => Promise<string | null>;
  walk: (x: number, z: number) => void;
}
function World({
  props,
  bridge,
  interaction,
  navigation,
}: {
  props: Props;
  bridge: React.MutableRefObject<Bridge>;
  interaction: React.MutableRefObject<boolean>;
  navigation: { azimuth: number; pitch: number; zoom: number };
}) {
  const {
      scene,
      mode,
      selectedId,
      placingId,
      onSelect,
      onMove,
      onRotate,
      onPlace,
      eyeHeight,
      reset,
    } = props,
    { set, size, gl, invalidate, raycaster } = useThree(),
    b = bounds(scene);
  const eye = React.useMemo(
    () => initialEye(scene),
    [scene.schemaVersion, reset, mode],
  );
  const camera = React.useMemo(
      () => new PerspectiveCamera(mode === 'inside' ? 68 : 38, 1, 0.03, 200),
      [mode, reset],
    ),
    walk = React.useRef<[number, number] | null>(null),
    drag = React.useRef<{
      id: string;
      dx: number;
      dz: number;
      startX: number;
      startZ: number;
      moved: boolean;
      elevationM: number;
    } | null>(null),
    rotation = React.useRef<{ id: string; x: number; z: number; last: number; yawRad: number; initialYaw: number; moved: boolean; elevationM: number } | null>(null),
    [anglePreview, setAnglePreview] = React.useState<{ id: string; yawRad: number } | null>(null),
    [preview, setPreview] = React.useState<{
      id: string;
      x: number;
      z: number;
    } | null>(null),
    target = new Vector3();
  const [hover, setHover] = React.useState<[number, number]>([
    b.minX + b.width / 2,
    b.minZ + b.depth / 2,
  ]);
  React.useEffect(() => {
    set({ camera });
    bridge.current.camera = camera;
    return () => {
      bridge.current.camera = null;
    };
  }, [camera, set]);
  React.useEffect(() => () => { interaction.current = false; }, []);
  React.useEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height);
    if (mode === 'inside') {
      camera.position.set(
        eye[0],
        Math.min(eyeHeight, scene.height.meters - 0.2),
        eye[1],
      );
      camera.lookAt(
        b.minX + b.width / 2,
        Math.min(1.1, eyeHeight - 0.1),
        b.minZ + b.depth * 0.2,
      );
    } else {
      const max = Math.max(b.width, b.depth),
        distance =
          max * 2.1 * navigation.zoom * Math.max(1, 1.08 / camera.aspect),
        pitch = Math.max(0.25, Math.min(1.3, navigation.pitch));
      camera.position.set(
        b.minX +
          b.width / 2 +
          Math.sin(navigation.azimuth) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance,
        b.minZ +
          b.depth / 2 +
          Math.cos(navigation.azimuth) * Math.cos(pitch) * distance,
      );
      camera.lookAt(b.minX + b.width / 2, 0.4, b.minZ + b.depth / 2);
    }
    camera.updateProjectionMatrix();
    invalidate();
  }, [
    camera,
    size.width,
    size.height,
    mode,
    reset,
    b.width,
    b.depth,
    eyeHeight,
    mode === 'overview' ? navigation : null,
  ]);
  const lastLook = React.useRef({
    azimuth: navigation.azimuth,
    pitch: navigation.pitch,
  });
  React.useEffect(() => {
    if (mode !== 'inside') {
      lastLook.current = navigation;
      return;
    }
    camera.rotation.order = 'YXZ';
    camera.rotation.y -= navigation.azimuth - lastLook.current.azimuth;
    camera.rotation.x = Math.max(
      -1.2,
      Math.min(
        1.2,
        camera.rotation.x + navigation.pitch - lastLook.current.pitch,
      ),
    );
    lastLook.current = navigation;
    invalidate();
  }, [navigation.azimuth, navigation.pitch]);
  bridge.current.ray = (x, y) => {
    raycaster.setFromCamera(
      { x: (2 * x) / size.width - 1, y: 1 - (2 * y) / size.height } as any,
      camera,
    );
    const hit = raycaster.ray.intersectPlane(FLOOR, new Vector3());
    return hit ? [hit.x, hit.z] : null;
  };
  bridge.current.walk = (x, z) => {
    if (walkPathClear(scene, [camera.position.x, camera.position.z], [x, z])) {
      walk.current = [x, z];
      invalidate();
    }
  };
  bridge.current.capture = async () => {
    try {
      const context = gl.getContext() as any;
      if (typeof context.takeSnapshotAsync !== 'function') return null;
      const snapshot = await context.takeSnapshotAsync({
        format: 'png',
        result: 'file',
      });
      return snapshot.uri ?? null;
    } catch {
      return null;
    }
  };
  useFrame((_, delta) => {
    if (mode !== 'inside' || !walk.current || interaction.current) return;
    const [x, z] = walk.current;
    if (!walkPathClear(scene, [camera.position.x, camera.position.z], [x, z])) {
      walk.current = null;
      return;
    }
    target.set(x, Math.min(eyeHeight, scene.height.meters - 0.2), z);
    camera.position.lerp(target, Math.min(1, delta * 5));
    if (camera.position.distanceTo(target) < 0.015) {
      camera.position.copy(target);
      walk.current = null;
    } else invalidate();
  });
  const point = (event: ThreeEvent<PointerEvent>, elevationM = 0) =>
    event.ray.intersectPlane(elevationM ? new Plane(new Vector3(0, 1, 0), -elevationM) : FLOOR, new Vector3());
  const down = (p: Placement, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (placingId) return;
    onSelect(p.physicalItemId);
    if (
      p.locked ||
      !scene.items.find((i) => i.id === p.physicalItemId)?.movable
    )
      return;
    const elevationM = getItemElevation(legacyItem(scene.items.find((item) => item.id === p.physicalItemId)!), scene.height.meters);
    const hit = point(e, elevationM);
    if (!hit) return;
    drag.current = {
      id: p.physicalItemId,
      dx: p.floorCenterXM - hit.x,
      dz: p.floorCenterZM - hit.z,
      startX: hit.x,
      startZ: hit.z,
      moved: false,
      elevationM,
    };
    interaction.current = true;
    (e.target as any).setPointerCapture?.(e.pointerId);
  };
  const rotateDown = (p: Placement, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (placingId || p.locked || !scene.items.find((i) => i.id === p.physicalItemId)?.movable) return;
    const elevationM = getItemElevation(legacyItem(scene.items.find((item) => item.id === p.physicalItemId)!), scene.height.meters);
    const hit = point(e, elevationM);
    if (!hit) return;
    rotation.current = { id: p.physicalItemId, x: p.floorCenterXM, z: p.floorCenterZM,
      last: Math.atan2(-(hit.x - p.floorCenterXM), -(hit.z - p.floorCenterZM)), yawRad: p.yawRad, initialYaw: p.yawRad, moved: false, elevationM };
    walk.current = null;
    interaction.current = true;
    (e.target as any).setPointerCapture?.(e.pointerId);
  };
  return (
    <group
      onPointerMove={(e) => {
        const r = rotation.current;
        if (r) {
          e.stopPropagation();
          const hit = point(e, r.elevationM);
          if (!hit || Math.hypot(hit.x - r.x, hit.z - r.z) < 0.08) return;
          const angle = Math.atan2(-(hit.x - r.x), -(hit.z - r.z));
          r.yawRad += Math.atan2(Math.sin(angle - r.last), Math.cos(angle - r.last));
          r.last = angle;
          r.moved ||= Math.abs(r.yawRad - r.initialYaw) > 0.01;
          if (r.moved) setAnglePreview({ id: r.id, yawRad: r.yawRad });
          return;
        }
        const d = drag.current,
          hit = point(e, d?.elevationM ?? 0);
        if (placingId && hit) {
          setHover([hit.x, hit.z]);
          return;
        }
        if (!d || !hit) return;
        e.stopPropagation();
        d.moved ||= Math.hypot(hit.x - d.startX, hit.z - d.startZ) > 0.025;
        if (d.moved) setPreview({ id: d.id, x: hit.x + d.dx, z: hit.z + d.dz });
      }}
      onPointerUp={(e) => {
        const r = rotation.current;
        if (r) {
          e.stopPropagation();
          if (r.moved) onRotate(r.id, r.yawRad);
          rotation.current = null;
          interaction.current = false;
          setAnglePreview(null);
          (e.target as any).releasePointerCapture?.(e.pointerId);
          return;
        }
        const d = drag.current;
        if (!d) return;
        e.stopPropagation();
        const hit = point(e, d.elevationM);
        if (d.moved && hit) onMove(d.id, hit.x + d.dx, hit.z + d.dz);
        drag.current = null;
        interaction.current = false;
        setPreview(null);
        (e.target as any).releasePointerCapture?.(e.pointerId);
      }}
      onPointerCancel={() => {
        rotation.current = null;
        setAnglePreview(null);
        drag.current = null;
        interaction.current = false;
        setPreview(null);
      }}
    >
      <ambientLight intensity={1} />
      <hemisphereLight args={['#fff8eb', '#9ea99a', 1.25]} />
      <directionalLight
        position={[b.minX + b.width, 7, b.minZ + b.depth]}
        intensity={2}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <group
        onClick={(e) => {
          if (e.delta > 5) return;
          e.stopPropagation();
          if (placingId) onPlace(e.point.x, e.point.z);
          else if (mode === 'inside') bridge.current.walk(e.point.x, e.point.z);
          else onSelect(null);
        }}
      >
        <RoomFloor scene={scene} />
      </group>
      {props.showGrid && (
        <gridHelper
          args={[
            Math.max(b.width, b.depth),
            Math.min(100, Math.round(Math.max(b.width, b.depth) * 4)),
            '#a8b49c',
            '#c1c7b7',
          ]}
          position={[b.minX + b.width / 2, 0.005, b.minZ + b.depth / 2]}
        />
      )}
      {scene.floorPolygonXZ.map((_, index) => (
        <Wall
          key={index}
          scene={scene}
          index={index}
          cutaway={mode === 'overview' && (index === 1 || index === 2)}
        />
      ))}
      {mode === 'inside' && (
        <mesh
          position={[
            b.minX + b.width / 2,
            scene.height.meters,
            b.minZ + b.depth / 2,
          ]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[b.width, b.depth]} />
          <meshStandardMaterial color={scene.wallColor} side={DoubleSide} />
        </mesh>
      )}
      {activeLayout(scene).placements.map((p) => {
        const item = scene.items.find((i) => i.id === p.physicalItemId)!;
        const movedPose =
          preview?.id === item.id
            ? { ...p, floorCenterXM: preview.x, floorCenterZM: preview.z }
            : p;
        const previewAngle = anglePreview ?? props.rotationPreview,
          pose = previewAngle?.id === item.id ? { ...movedPose, yawRad: previewAngle.yawRad } : movedPose;
        const color = placementWarnings(scene, pose).length
          ? '#b45339'
          : '#3e6658';
        return (
          <group
            key={item.id}
            position={[pose.floorCenterXM, 0, pose.floorCenterZM]}
            onPointerDown={(e) => down(p, e)}
            onClick={(e) => {
              e.stopPropagation();
              if (!placingId) onSelect(item.id);
            }}
          >
            <FurnitureModel item={legacyItem(item, pose)} roomHeight={scene.height.meters} />
            {selectedId === item.id && (
              <group position={[0, getItemElevation(legacyItem(item), scene.height.meters), 0]} rotation={[0, pose.yawRad, 0]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                  <planeGeometry
                    args={[item.width.meters + 0.08, item.depth.meters + 0.08]}
                  />
                  <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.22}
                    depthWrite={false}
                  />
                </mesh>
                {!placingId && item.movable && !pose.locked && (
                  <group onPointerDown={(e) => rotateDown(p, e)} onClick={(e) => e.stopPropagation()}>
                    <mesh position={[0, 0.07, -(item.depth.meters / 2 + 0.35) / 2]}>
                      <boxGeometry args={[0.025, 0.025, item.depth.meters / 2 + 0.35]} />
                      <meshBasicMaterial color={color} />
                    </mesh>
                    <mesh position={[0, 0.08, -(item.depth.meters / 2 + 0.35)]}>
                      <cylinderGeometry args={[0.115, 0.115, 0.035, 28]} />
                      <meshBasicMaterial color={color} />
                    </mesh>
                    <mesh position={[0, 0.105, -(item.depth.meters / 2 + 0.35)]} rotation={[-Math.PI / 2, 0, 0]}>
                      <torusGeometry args={[0.065, 0.012, 8, 28]} />
                      <meshBasicMaterial color="#ffffff" />
                    </mesh>
                  </group>
                )}
              </group>
            )}
          </group>
        );
      })}
      {placingId &&
        (() => {
          const item = scene.items.find((i) => i.id === placingId);
          if (!item) return null;
          const pos = props.candidate ?? hover;
          return (
            <group position={[pos[0], 0.015, pos[1]]}>
              <FurnitureModel item={legacyItem(item)} roomHeight={scene.height.meters} opacity={0.4} />
            </group>
          );
        })()}
    </group>
  );
}
export const NativeScene = React.forwardRef<NativeViewportHandle, Props>(
  function NativeScene(props, ref) {
    const container = React.useRef<View>(null),
      rect = React.useRef({ x: 0, y: 0, width: 1, height: 1 }),
      interaction = React.useRef(false),
      bridge = React.useRef<Bridge>({
        camera: null,
        ray: () => null,
        capture: async () => null,
        walk: () => undefined,
      }),
      [navigation, setNavigation] = React.useState({
        azimuth: 0.8,
        pitch: 0.6,
        zoom: 1,
      });
    const ready = React.useRef(false);
    React.useEffect(() => {
      const timer = setTimeout(() => {
        if (!ready.current) props.onUnavailable?.();
      }, 15000);
      return () => clearTimeout(timer);
    }, []);
    const current = React.useRef(props);
    current.current = props;
    const last = React.useRef({ x: 0, y: 0, pinch: 0 });
    React.useEffect(
      () => setNavigation({ azimuth: 0.8, pitch: 0.6, zoom: 1 }),
      [props.mode, props.reset],
    );
    const responder = React.useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponderCapture: (_e, g) =>
            !interaction.current &&
            !current.current.placingId &&
            Math.hypot(g.dx, g.dy) > 7,
          onPanResponderGrant: (e) => {
            const touches = e.nativeEvent.touches;
            last.current = {
              x: e.nativeEvent.pageX,
              y: e.nativeEvent.pageY,
              pinch:
                touches.length === 2
                  ? Math.hypot(
                      touches[0].pageX - touches[1].pageX,
                      touches[0].pageY - touches[1].pageY,
                    )
                  : 0,
            };
          },
          onPanResponderMove: (e) => {
            const t = e.nativeEvent.touches,
              x = e.nativeEvent.pageX,
              y = e.nativeEvent.pageY,
              pinch =
                t.length === 2
                  ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY)
                  : 0;
            setNavigation((n) => ({
              azimuth: n.azimuth + (x - last.current.x) * 0.006,
              pitch: Math.max(
                -1.2,
                Math.min(1.3, n.pitch + (y - last.current.y) * 0.004),
              ),
              zoom:
                pinch && last.current.pinch
                  ? Math.max(
                      0.4,
                      Math.min(3, (n.zoom * last.current.pinch) / pinch),
                    )
                  : n.zoom,
            }));
            last.current = { x, y, pinch };
          },
        }),
      [],
    );
    React.useImperativeHandle(ref, () => ({
      project: (pageX, pageY) => {
        const r = rect.current;
        if (
          pageX < r.x ||
          pageY < r.y ||
          pageX > r.x + r.width ||
          pageY > r.y + r.height
        )
          return null;
        return bridge.current.ray(pageX - r.x, pageY - r.y);
      },
      capture: () => bridge.current.capture(),
    }));
    return (
      <View
        ref={container}
        style={{ flex: 1 }}
        onLayout={() =>
          container.current?.measureInWindow((x, y, width, height) => {
            rect.current = { x, y, width, height };
          })
        }
        {...responder.panHandlers}
      >
        <Canvas
          onCreated={() => {
            ready.current = true;
          }}
          shadows
          frameloop="demand"
          gl={{ antialias: true, preserveDrawingBuffer: true }}
        >
          <World
            props={props}
            bridge={bridge}
            interaction={interaction}
            navigation={navigation}
          />
        </Canvas>
      </View>
    );
  },
);
