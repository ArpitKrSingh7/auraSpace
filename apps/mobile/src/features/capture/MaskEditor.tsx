import {
  clone,
  type Capture,
  type MaskEdit,
  type Observation,
} from '@auraspace/scene-domain';
import React from 'react';
import { PanResponder, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Mask,
  Polygon,
  Polyline,
  Rect,
} from 'react-native-svg';
import { MediaImage } from '../../components/MediaImage';
import { Body, Button, NumberField, styles } from '../../components/ui';
export function MaskEditor({
  capture,
  observation,
  onChange,
}: {
  capture: Capture;
  observation: Observation;
  onChange: (mask: MaskEdit, box?: Observation['boxPx']) => void;
}) {
  const [tool, setTool] = React.useState<'paint' | 'erase' | 'rectangle'>(
      'paint',
    ),
    [radius, setRadius] = React.useState(
      Math.max(3, Math.round(Math.min(capture.width, capture.height) * 0.02)),
    ),
    [stroke, setStroke] = React.useState<Array<[number, number]>>([]);
  const size = React.useRef({ width: 1, height: 1 }),
    current = React.useRef({ capture, observation, onChange, tool, radius });
  current.current = { capture, observation, onChange, tool, radius };
  const points = React.useRef<Array<[number, number]>>([]);
  const position = (e: any): [number, number] => [
    Math.max(
      0,
      Math.min(
        current.current.capture.width,
        (e.nativeEvent.locationX / size.current.width) *
          current.current.capture.width,
      ),
    ),
    Math.max(
      0,
      Math.min(
        current.current.capture.height,
        (e.nativeEvent.locationY / size.current.height) *
          current.current.capture.height,
      ),
    ),
  ];
  const setBox = (index: number, value: number) => {
    const box = [...observation.boxPx] as Observation['boxPx'];
    box[index] = value;
    box[0] = Math.max(0, Math.min(box[0], capture.width - 1));
    box[1] = Math.max(0, Math.min(box[1], capture.height - 1));
    box[2] = Math.max(1, Math.min(box[2], capture.width - box[0]));
    box[3] = Math.max(1, Math.min(box[3], capture.height - box[1]));
    const [x, y, w, h] = box;
    onChange(
      {
        ...observation.mask,
        revision: observation.mask.revision + 1,
        polygons: [
          [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ],
        ],
        strokes: [],
      },
      box,
    );
  };
  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          points.current = [position(e)];
          setStroke([...points.current]);
        },
        onPanResponderMove: (e) => {
          if (points.current.length >= 3000) return;
          points.current.push(position(e));
          setStroke([...points.current]);
        },
        onPanResponderRelease: () => {
          const { observation: o, onChange, tool, radius } = current.current,
            mask = clone(o.mask),
            p = points.current;
          mask.revision++;
          if (tool === 'rectangle' && p.length) {
            const a = p[0],
              b = p[p.length - 1],
              x = Math.min(a[0], b[0]),
              y = Math.min(a[1], b[1]),
              w = Math.abs(a[0] - b[0]),
              h = Math.abs(a[1] - b[1]);
            if (w >= 3 && h >= 3) {
              mask.polygons = [
                [
                  [x, y],
                  [x + w, y],
                  [x + w, y + h],
                  [x, y + h],
                ],
              ];
              mask.strokes = [];
              onChange(mask, [x, y, w, h]);
            }
          } else if (p.length) {
            mask.strokes.push({
              tool: tool === 'erase' ? 'erase' : 'paint',
              radius,
              points: p,
            });
            onChange(mask);
          }
          points.current = [];
          setStroke([]);
        },
        onPanResponderTerminate: () => {
          points.current = [];
          setStroke([]);
        },
      }),
    [],
  );
  return (
    <View style={{ gap: 12 }}>
      <Body>
        Paint the furniture and shadows to remove. Erase any wall, window, or
        fixed feature that should stay.
      </Body>
      <View
        style={[styles.row, { justifyContent: 'flex-start', flexWrap: 'wrap' }]}
      >
        {(['paint', 'erase', 'rectangle'] as const).map((t) => (
          <Button
            key={t}
            compact
            secondary={tool !== t}
            title={
              t === 'rectangle'
                ? 'Box outline'
                : t === 'paint'
                  ? 'Paint mask'
                  : 'Erase mask'
            }
            onPress={() => setTool(t)}
          />
        ))}
      </View>
      <View
        style={{
          aspectRatio: capture.width / capture.height,
          width: '100%',
          overflow: 'hidden',
          borderRadius: 12,
        }}
        onLayout={(e) => {
          size.current = e.nativeEvent.layout;
        }}
        {...responder.panHandlers}
      >
        <MediaImage
          assetId={capture.originalAssetId}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
        <Svg
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0 }}
          width="100%"
          height="100%"
          viewBox={`0 0 ${capture.width} ${capture.height}`}
        >
          <Defs>
            <Mask
              id="selection"
              x={0}
              y={0}
              width={capture.width}
              height={capture.height}
              maskUnits="userSpaceOnUse"
            >
              <Rect
                width={capture.width}
                height={capture.height}
                fill="black"
              />
              {observation.mask.polygons.map((polygon, i) => (
                <Polygon
                  key={i}
                  points={polygon.map((p) => p.join(',')).join(' ')}
                  fill="white"
                />
              ))}
              {[
                ...observation.mask.strokes,
                ...(stroke.length && tool !== 'rectangle'
                  ? [
                      {
                        tool:
                          tool === 'erase'
                            ? ('erase' as const)
                            : ('paint' as const),
                        radius,
                        points: stroke,
                      },
                    ]
                  : []),
              ].map((s, i) => (
                <React.Fragment key={i}>
                  <Polyline
                    points={s.points.map((p) => p.join(',')).join(' ')}
                    fill="none"
                    stroke={s.tool === 'paint' ? 'white' : 'black'}
                    strokeWidth={s.radius * 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {s.points.length === 1 && (
                    <Circle
                      cx={s.points[0][0]}
                      cy={s.points[0][1]}
                      r={s.radius}
                      fill={s.tool === 'paint' ? 'white' : 'black'}
                    />
                  )}
                </React.Fragment>
              ))}
            </Mask>
          </Defs>
          <Rect
            width={capture.width}
            height={capture.height}
            fill="#409a8a"
            opacity={0.55}
            mask="url(#selection)"
          />
          {tool === 'rectangle' && stroke.length > 1 && (
            <Rect
              x={Math.min(stroke[0][0], stroke[stroke.length - 1][0])}
              y={Math.min(stroke[0][1], stroke[stroke.length - 1][1])}
              width={Math.abs(stroke[0][0] - stroke[stroke.length - 1][0])}
              height={Math.abs(stroke[0][1] - stroke[stroke.length - 1][1])}
              stroke="white"
              strokeWidth={3}
              fill="none"
            />
          )}
        </Svg>
      </View>
      <Body>
        For precise selection without dragging, enter a box in source-image
        pixels. Changing the box replaces the painted outline.
      </Body>
      <View style={styles.row}>
        {(['Left X', 'Top Y', 'Width', 'Height'] as const).map((label, i) => (
          <NumberField
            key={label}
            label={label}
            value={observation.boxPx[i]}
            min={i < 2 ? 0 : 1}
            max={i % 2 === 0 ? capture.width : capture.height}
            onChange={(v) => setBox(i, v)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <NumberField
          label="Brush radius (pixels)"
          value={radius}
          onChange={setRadius}
          min={1}
          max={500}
        />
        <NumberField
          label="Expand mask (pixels)"
          value={observation.mask.expansionPx}
          onChange={(value) =>
            onChange({
              ...observation.mask,
              expansionPx: Math.round(value),
              revision: observation.mask.revision + 1,
            })
          }
          min={0}
          max={100}
        />
      </View>
      <Button
        secondary
        title="Undo last brush stroke"
        disabled={!observation.mask.strokes.length}
        onPress={() =>
          onChange({
            ...observation.mask,
            strokes: observation.mask.strokes.slice(0, -1),
            revision: observation.mask.revision + 1,
          })
        }
      />
    </View>
  );
}
