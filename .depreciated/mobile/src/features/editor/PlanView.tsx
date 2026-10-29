import {
  activeLayout,
  bounds,
  getOpeningLeaf,
  legacyItem,
  placementWarnings,
  type RoomScene,
} from '@auraspace/scene-domain';
import {
  getCorners,
  pointInFootprint,
} from '@auraspace/scene-domain/legacy/geometry';
import React from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { palette } from '../../components/ui';
export interface ViewportHandle {
  project: (pageX: number, pageY: number) => [number, number] | null;
}
interface Props {
  scene: RoomScene;
  selectedId: string | null;
  placingId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  onRotate: (id: string, yawRad: number) => void;
  rotationPreview?: { id: string; yawRad: number } | null;
  onPlace: (x: number, z: number) => void;
  showGrid?: boolean;
  candidate?: [number, number] | null;
}
export const PlanView = React.forwardRef<ViewportHandle, Props>(
  function PlanView(
    {
      scene,
      selectedId,
      placingId,
      onSelect,
      onMove,
      onRotate,
      rotationPreview,
      onPlace,
      showGrid = true,
      candidate,
    },
    ref,
  ) {
    const container = React.useRef<View>(null),
      size = React.useRef({ x: 0, y: 0, width: 1, height: 1 }),
      [layout, setLayout] = React.useState({ width: 1, height: 1 }),
      [dragPreview, setDragPreview] = React.useState<{
        id: string;
        x: number;
        z: number;
      } | null>(null),
      [anglePreview, setAnglePreview] = React.useState<{ id: string; yawRad: number } | null>(null),
      rotation = React.useRef<{ id: string; x: number; z: number; last: number; yawRad: number; initialYaw: number; moved: boolean } | null>(null),
      drag = React.useRef<{
        id: string;
        dx: number;
        dz: number;
        startX: number;
        startY: number;
        moved: boolean;
      } | null>(null);
    const b = bounds(scene),
      ratio = layout.width / Math.max(1, layout.height),
      viewHeight = Math.max(b.depth + 1, (b.width + 1) / ratio),
      viewWidth = viewHeight * ratio,
      minX = b.minX + b.width / 2 - viewWidth / 2,
      minZ = b.minZ + b.depth / 2 - viewHeight / 2;
    const previewAngle = anglePreview ?? rotationPreview;
    const selectedPlacement = activeLayout(scene).placements.find((p) => p.physicalItemId === selectedId),
      selectedPose = selectedPlacement && dragPreview?.id === selectedId
        ? { ...selectedPlacement, floorCenterXM: dragPreview.x, floorCenterZM: dragPreview.z }
        : selectedPlacement,
      selectedItem = scene.items.find((i) => i.id === selectedId),
      selectedYaw = previewAngle?.id === selectedId ? previewAngle.yawRad : selectedPose?.yawRad ?? 0,
      handleRadius = selectedItem ? selectedItem.depth.meters / 2 + 0.35 : 0,
      handle = selectedPose && selectedItem?.movable && !selectedPose.locked && !placingId
        ? { x: selectedPose.floorCenterXM - Math.sin(selectedYaw) * handleRadius,
            z: selectedPose.floorCenterZM - Math.cos(selectedYaw) * handleRadius,
            hitRadius: (viewWidth / Math.max(1, layout.width)) * 24 }
        : null;
    const point = (x: number, y: number): [number, number] | null => {
      const r = size.current;
      if (x < r.x || y < r.y || x > r.x + r.width || y > r.y + r.height)
        return null;
      return [
        minX + ((x - r.x) / r.width) * viewWidth,
        minZ + ((y - r.y) / r.height) * viewHeight,
      ];
    };
    React.useImperativeHandle(ref, () => ({ project: point }));
    const current = React.useRef({
      scene,
      selectedId,
      placingId,
      onSelect,
      onMove,
      onRotate,
      onPlace,
      point,
      handle,
    });
    current.current = {
      scene,
      selectedId,
      placingId,
      onSelect,
      onMove,
      onRotate,
      onPlace,
      point,
      handle,
    };
    const responder = React.useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: (e) => {
            const c = current.current,
              p = c.point(e.nativeEvent.pageX, e.nativeEvent.pageY);
            if (!p) return;
            if (c.placingId) {
              c.onPlace(p[0], p[1]);
              return;
            }
            const selected = activeLayout(c.scene).placements.find((pose) => pose.physicalItemId === c.selectedId);
            if (selected && c.handle && Math.hypot(p[0] - c.handle.x, p[1] - c.handle.z) <= c.handle.hitRadius) {
              rotation.current = { id: selected.physicalItemId, x: selected.floorCenterXM, z: selected.floorCenterZM,
                last: Math.atan2(-(p[0] - selected.floorCenterXM), -(p[1] - selected.floorCenterZM)),
                yawRad: selected.yawRad, initialYaw: selected.yawRad, moved: false };
              return;
            }
            const poses = [...activeLayout(c.scene).placements].reverse().sort((a, b) =>
              Number(c.scene.items.find((item) => item.id === a.physicalItemId)?.category === 'rug') -
              Number(c.scene.items.find((item) => item.id === b.physicalItemId)?.category === 'rug'));
            const found = poses.find((pose) => {
              const i = c.scene.items.find(
                (i) => i.id === pose.physicalItemId,
              )!;
              return pointInFootprint(p[0], p[1], legacyItem(i, pose));
            });
            c.onSelect(found?.physicalItemId ?? null);
            if (
              found &&
              !found.locked &&
              c.scene.items.find((i) => i.id === found.physicalItemId)?.movable
            )
              drag.current = {
                id: found.physicalItemId,
                dx: found.floorCenterXM - p[0],
                dz: found.floorCenterZM - p[1],
                startX: e.nativeEvent.pageX,
                startY: e.nativeEvent.pageY,
                moved: false,
              };
          },
          onPanResponderMove: (e) => {
            const r = rotation.current;
            if (r) {
              const p = current.current.point(e.nativeEvent.pageX, e.nativeEvent.pageY);
              if (!p || Math.hypot(p[0] - r.x, p[1] - r.z) < 0.08) return;
              const angle = Math.atan2(-(p[0] - r.x), -(p[1] - r.z));
              r.yawRad += Math.atan2(Math.sin(angle - r.last), Math.cos(angle - r.last));
              r.last = angle;
              r.moved ||= Math.abs(r.yawRad - r.initialYaw) > 0.01;
              if (r.moved) setAnglePreview({ id: r.id, yawRad: r.yawRad });
              return;
            }
            const d = drag.current;
            if (!d) return;
            const p = current.current.point(
              e.nativeEvent.pageX,
              e.nativeEvent.pageY,
            );
            if (!p) return;
            d.moved ||=
              Math.hypot(
                e.nativeEvent.pageX - d.startX,
                e.nativeEvent.pageY - d.startY,
              ) > 5;
            setDragPreview({ id: d.id, x: p[0] + d.dx, z: p[1] + d.dz });
          },
          onPanResponderRelease: (e) => {
            const r = rotation.current;
            if (r?.moved) current.current.onRotate(r.id, r.yawRad);
            rotation.current = null;
            setAnglePreview(null);
            const d = drag.current,
              p = current.current.point(
                e.nativeEvent.pageX,
                e.nativeEvent.pageY,
              );
            if (d?.moved && p)
              current.current.onMove(d.id, p[0] + d.dx, p[1] + d.dz);
            drag.current = null;
            setDragPreview(null);
          },
          onPanResponderTerminate: () => {
            rotation.current = null;
            setAnglePreview(null);
            drag.current = null;
            setDragPreview(null);
          },
        }),
      [],
    );
    const measure = () =>
      container.current?.measureInWindow((x, y, width, height) => {
        size.current = { x, y, width, height };
      });
    return (
      <View
        ref={container}
        style={{ flex: 1 }}
        onLayout={(e) => {
          setLayout(e.nativeEvent.layout);
          requestAnimationFrame(measure);
        }}
        {...responder.panHandlers}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`${minX} ${minZ} ${viewWidth} ${viewHeight}`}
        >
          <Polygon
            points={scene.floorPolygonXZ.map((p) => p.join(',')).join(' ')}
            fill="#f5f1e6"
            stroke={palette.ink}
            strokeWidth={0.04}
          />
          {showGrid &&
            Array.from(
              { length: Math.ceil(b.width / 0.25) },
              (_, i) => b.minX + i * 0.25,
            ).map((x) => (
              <Line
                key={`x${x}`}
                x1={x}
                y1={b.minZ}
                x2={x}
                y2={b.minZ + b.depth}
                stroke={palette.brand}
                strokeWidth={0.006}
                opacity={0.13}
              />
            ))}
          {showGrid &&
            Array.from(
              { length: Math.ceil(b.depth / 0.25) },
              (_, i) => b.minZ + i * 0.25,
            ).map((z) => (
              <Line
                key={`z${z}`}
                x1={b.minX}
                y1={z}
                x2={b.minX + b.width}
                y2={z}
                stroke={palette.brand}
                strokeWidth={0.006}
                opacity={0.13}
              />
            ))}
          {scene.openings.map((o) => {
            const a = scene.floorPolygonXZ[o.wallIndex],
              c =
                scene.floorPolygonXZ[
                  (o.wallIndex + 1) % scene.floorPolygonXZ.length
                ],
              len = Math.hypot(c[0] - a[0], c[1] - a[1]),
              ux = (c[0] - a[0]) / len,
              uz = (c[1] - a[1]) / len,
              leaf = getOpeningLeaf(scene.floorPolygonXZ, o),
              closedEnd = leaf.hingeSide === 'start' ? leaf.closedEnd : leaf.closedStart,
              cross = (closedEnd[0] - leaf.hinge[0]) * (leaf.end[1] - leaf.hinge[1]) - (closedEnd[1] - leaf.hinge[1]) * (leaf.end[0] - leaf.hinge[0]),
              color = o.kind === 'window' ? '#639aa3' : '#8c7154';
            return (
              <React.Fragment key={o.id}>
              <Line
                x1={a[0] + ux * o.offsetM}
                y1={a[1] + uz * o.offsetM}
                x2={a[0] + ux * (o.offsetM + o.widthM)}
                y2={a[1] + uz * (o.offsetM + o.widthM)}
                stroke={o.kind === 'window' ? '#8bbdc4' : '#f5f1e6'}
                strokeWidth={0.065}
              />
              {leaf.openAngleDeg > 0.01 && (
                <Path d={`M ${closedEnd.join(' ')} A ${o.widthM} ${o.widthM} 0 0 ${cross > 0 ? 1 : 0} ${leaf.end.join(' ')}`}
                  fill="none" stroke={color} strokeWidth={0.012} strokeDasharray="0.04 0.035" opacity={0.75} />
              )}
              <Line x1={leaf.hinge[0]} y1={leaf.hinge[1]} x2={leaf.end[0]} y2={leaf.end[1]} stroke={color} strokeWidth={o.kind === 'door' ? 0.045 : 0.035} />
              <Circle cx={leaf.hinge[0]} cy={leaf.hinge[1]} r={0.035} fill={color} />
              </React.Fragment>
            );
          })}
          {[...activeLayout(scene).placements]
            .sort(
              (a, b) =>
                Number(
                  scene.items.find((i) => i.id === b.physicalItemId)
                    ?.category === 'rug',
                ) -
                Number(
                  scene.items.find((i) => i.id === a.physicalItemId)
                    ?.category === 'rug',
                ),
            )
            .map((p) => {
              const item = scene.items.find((i) => i.id === p.physicalItemId)!;
              const movedPose =
                dragPreview?.id === item.id
                  ? {
                      ...p,
                      floorCenterXM: dragPreview.x,
                      floorCenterZM: dragPreview.z,
                    }
                  : p;
              const pose = previewAngle?.id === item.id ? { ...movedPose, yawRad: previewAngle.yawRad } : movedPose;
              const corners = getCorners(legacyItem(item, pose));
              const warnings = placementWarnings(scene, pose);
              return (
                <React.Fragment key={item.id}>
                  <Polygon
                    points={corners.map((p) => `${p.x},${p.z}`).join(' ')}
                    fill={item.color}
                    fillOpacity={item.category === 'rug' ? 0.4 : 0.8}
                    stroke={
                      selectedId === item.id
                        ? warnings.length
                          ? palette.danger
                          : palette.brand
                        : '#899180'
                    }
                    strokeWidth={selectedId === item.id ? 0.04 : 0.015}
                  />
                  <SvgText
                    x={pose.floorCenterXM}
                    y={pose.floorCenterZM}
                    textAnchor="middle"
                    fontSize={Math.min(0.15, item.width.meters * 0.2)}
                    fill={palette.ink}
                  >
                    {item.name.slice(0, 22)}
                  </SvgText>
                </React.Fragment>
              );
            })}
          {handle && selectedPose && (
            <>
              <Line x1={selectedPose.floorCenterXM} y1={selectedPose.floorCenterZM} x2={handle.x} y2={handle.z} stroke={palette.brand} strokeWidth={0.022} />
              <Circle cx={handle.x} cy={handle.z} r={Math.max(0.07, handle.hitRadius * 0.55)} fill={palette.brand} stroke="white" strokeWidth={0.025} />
              <SvgText x={handle.x} y={handle.z + 0.035} textAnchor="middle" fontSize={0.12} fill="white">↻</SvgText>
            </>
          )}
          {placingId &&
            candidate &&
            (() => {
              const item = scene.items.find((i) => i.id === placingId);
              if (!item) return null;
              const pose = {
                physicalItemId: item.id,
                floorCenterXM: candidate[0],
                floorCenterZM: candidate[1],
                yawRad: 0,
                locked: false,
              };
              return (
                <Polygon
                  points={getCorners(legacyItem(item, pose))
                    .map((p) => `${p.x},${p.z}`)
                    .join(' ')}
                  fill={item.color}
                  fillOpacity={0.4}
                  stroke={
                    placementWarnings(scene, pose).length
                      ? palette.danger
                      : palette.brand
                  }
                  strokeWidth={0.04}
                />
              );
            })()}
          <SvgText
            x={b.minX + b.width / 2}
            y={b.minZ - 0.16}
            textAnchor="middle"
            fontSize={0.15}
            fill={palette.secondary}
          >
            {b.width.toFixed(2)} m
          </SvgText>
          <SvgText
            x={b.minX - 0.15}
            y={b.minZ + b.depth / 2}
            fontSize={0.15}
            fill={palette.secondary}
            rotation={-90}
            origin={`${b.minX - 0.15},${b.minZ + b.depth / 2}`}
          >
            {b.depth.toFixed(2)} m
          </SvgText>
        </Svg>
      </View>
    );
  },
);
