import {
  activeLayout,
  bounds,
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
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg';
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
      onPlace,
      point,
    });
    current.current = {
      scene,
      selectedId,
      placingId,
      onSelect,
      onMove,
      onPlace,
      point,
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
            const poses = [...activeLayout(c.scene).placements].reverse();
            const found = poses.find((pose) => {
              const i = c.scene.items.find(
                (i) => i.id === pose.physicalItemId,
              )!;
              if (i.category === 'rug') return false;
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
              uz = (c[1] - a[1]) / len;
            return (
              <Line
                key={o.id}
                x1={a[0] + ux * o.offsetM}
                y1={a[1] + uz * o.offsetM}
                x2={a[0] + ux * (o.offsetM + o.widthM)}
                y2={a[1] + uz * (o.offsetM + o.widthM)}
                stroke={o.kind === 'window' ? '#8bbdc4' : '#f5f1e6'}
                strokeWidth={0.065}
              />
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
              const pose =
                dragPreview?.id === item.id
                  ? {
                      ...p,
                      floorCenterXM: dragPreview.x,
                      floorCenterZM: dragPreview.z,
                    }
                  : p;
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
