import { FurnitureModel } from '@auraspace/scene-assets';
import {
  activeLayout,
  bounds,
  canStand,
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
  let cursor = 0;
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
  openings.forEach((o, i) => {
    block(cursor, o.offsetM - cursor, 0, height, `before-${i}`);
    block(o.offsetM, o.widthM, 0, Math.min(o.sillHeightM, height), `sill-${i}`);
    block(
      o.offsetM,
      o.widthM,
      o.sillHeightM + o.heightM,
      height - o.sillHeightM - o.heightM,
      `above-${i}`,
    );
    if (o.kind === 'window' && height > 0.1)
      blocks.push(
        <mesh
          key={`glass-${i}`}
          position={[
            o.offsetM + o.widthM / 2,
            o.sillHeightM + o.heightM / 2,
            0,
          ]}
        >
          <boxGeometry args={[o.widthM, o.heightM, 0.03]} />
          <meshStandardMaterial
            color="#b8d5d9"
            transparent
            opacity={0.3}
            roughness={0.15}
          />
        </mesh>,
      );
    cursor = o.offsetM + o.widthM;
  });
  block(cursor, length - cursor, 0, height, 'end');
  return (
    <group
      position={[a[0], 0, a[1]]}
      rotation={[0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0]}
    >
      {blocks}
    </group>
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
      moved: boolean;
    } | null>(null),
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
    if (mode !== 'inside' || !walk.current) return;
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
  const point = (event: ThreeEvent<PointerEvent>) =>
    event.ray.intersectPlane(FLOOR, new Vector3());
  const down = (p: Placement, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (placingId) return;
    onSelect(p.physicalItemId);
    if (
      p.locked ||
      !scene.items.find((i) => i.id === p.physicalItemId)?.movable
    )
      return;
    const hit = point(e);
    if (!hit) return;
    drag.current = {
      id: p.physicalItemId,
      dx: p.floorCenterXM - hit.x,
      dz: p.floorCenterZM - hit.z,
      moved: false,
    };
    interaction.current = true;
    (e.target as any).setPointerCapture?.(e.pointerId);
  };
  return (
    <group
      onPointerMove={(e) => {
        const d = drag.current,
          hit = point(e);
        if (placingId && hit) {
          setHover([hit.x, hit.z]);
          return;
        }
        if (!d || !hit) return;
        e.stopPropagation();
        d.moved = true;
        setPreview({ id: d.id, x: hit.x + d.dx, z: hit.z + d.dz });
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d) return;
        e.stopPropagation();
        const hit = point(e);
        if (d.moved && hit) onMove(d.id, hit.x + d.dx, hit.z + d.dz);
        drag.current = null;
        interaction.current = false;
        setPreview(null);
        (e.target as any).releasePointerCapture?.(e.pointerId);
      }}
      onPointerCancel={() => {
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
        const pose =
          preview?.id === item.id
            ? { ...p, floorCenterXM: preview.x, floorCenterZM: preview.z }
            : p;
        const color = placementWarnings(scene, pose).length
          ? '#b45339'
          : '#3e6658';
        return (
          <group
            key={item.id}
            position={[pose.floorCenterXM, 0, pose.floorCenterZM]}
            onPointerDown={(e) => down(p, e)}
          >
            <FurnitureModel item={legacyItem(item, pose)} />
            {selectedId === item.id && (
              <group rotation={[0, pose.yawRad, 0]}>
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
              <FurnitureModel item={legacyItem(item)} opacity={0.4} />
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
