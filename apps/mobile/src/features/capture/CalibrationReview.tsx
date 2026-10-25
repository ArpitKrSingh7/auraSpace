import {
  bounds,
  evidence,
  floorHomography,
  type PointXZ,
  type ProjectDocument,
} from '@auraspace/scene-domain';
import React from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { MediaImage } from '../../components/MediaImage';
import {
  Body,
  Button,
  Field,
  Heading,
  palette,
  Panel,
  styles,
} from '../../components/ui';
import { useStudio } from '../../state/studio';
export function CalibrationReview({
  document: doc,
  captureId,
}: {
  document: ProjectDocument;
  captureId: string;
}) {
  const capture = doc.scene.captures.find((c) => c.id === captureId)!;
  const b = bounds(doc.scene),
    fallback: PointXZ[] = [
      [capture.width * 0.15, capture.height * 0.55],
      [capture.width * 0.85, capture.height * 0.55],
      [capture.width * 0.98, capture.height * 0.98],
      [capture.width * 0.02, capture.height * 0.98],
    ],
    initial =
      capture.floorReview?.cornersPx ??
      capture.roomProposal?.floorCornersPx ??
      fallback;
  const [corners, setCorners] = React.useState<PointXZ[]>(
      initial.length === 4 ? initial : fallback,
    ),
    [width, setWidth] = React.useState(''),
    [depth, setDepth] = React.useState(''),
    selected = React.useRef<number | null>(null),
    size = React.useRef({ width: 1, height: 1 }),
    current = React.useRef(corners);
  current.current = corners;
  const position = (e: any): PointXZ => [
    Math.max(
      0,
      Math.min(
        capture.width,
        (e.nativeEvent.locationX / size.current.width) * capture.width,
      ),
    ),
    Math.max(
      0,
      Math.min(
        capture.height,
        (e.nativeEvent.locationY / size.current.height) * capture.height,
      ),
    ),
  ];
  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const p = position(e);
          selected.current = current.current.reduce(
            (best, corner, i) =>
              Math.hypot(corner[0] - p[0], corner[1] - p[1]) <
              Math.hypot(
                current.current[best][0] - p[0],
                current.current[best][1] - p[1],
              )
                ? i
                : best,
            0,
          );
        },
        onPanResponderMove: (e) => {
          const p = position(e);
          setCorners((previous) =>
            previous.map((corner, i) => (i === selected.current ? p : corner)),
          );
        },
        onPanResponderRelease: () => {
          selected.current = null;
        },
      }),
    [],
  );
  const save = () => {
    const w = width.trim() ? Number(width) : b.width,
      d = depth.trim() ? Number(depth) : b.depth,
      result = floorHomography(corners, w, d);
    if (!result.ok) {
      useStudio.getState().notify(result.message);
      return;
    }
    const scene = doc.scene;
    if (scene.floorPolygonXZ.length !== 4) {
      useStudio
        .getState()
        .notify(
          'Keep the custom floor outline, or use numeric boundary editing for this non-rectangular room.',
        );
      return;
    }
    const revision = scene.revision + 1;
    const next = {
      ...doc,
      updatedAt: new Date().toISOString(),
      scene: {
        ...scene,
        revision,
        dimensionEvidence: {
          ...scene.dimensionEvidence,
          ...(width.trim()
            ? { width: evidence(w, 'user-measured', true, [captureId]) }
            : {}),
          ...(depth.trim()
            ? { depth: evidence(d, 'user-measured', true, [captureId]) }
            : {}),
        },
        floorPolygonXZ: [
          [0, 0],
          [w, 0],
          [w, d],
          [0, d],
        ] as PointXZ[],
        captures: scene.captures.map((c) =>
          c.id === captureId
            ? {
                ...c,
                floorReview: {
                  cornersPx: corners,
                  widthM: width.trim() ? w : undefined,
                  depthM: depth.trim() ? d : undefined,
                  reviewed: true,
                  homography: result.value,
                },
              }
            : c,
        ),
      },
    };
    void useStudio
      .getState()
      .put(next)
      .then((ok) => {
        if (ok)
          useStudio
            .getState()
            .notify(
              'Floor review saved. Only entered measurements are marked as measured.',
            );
      });
  };
  return (
    <Panel>
      <Heading small>Correct the floor reference</Heading>
      <Body>
        Drag the four handles around the visible floor in order. Hidden corners
        remain approximate. This does not measure unseen room dimensions.
      </Body>
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
          <Polygon
            points={corners.map((p) => p.join(',')).join(' ')}
            fill={palette.brand}
            fillOpacity={0.2}
            stroke="white"
            strokeWidth={capture.width * 0.004}
          />
          {corners.map(([x, y], i) => (
            <React.Fragment key={i}>
              <Circle
                cx={x}
                cy={y}
                r={capture.width * 0.025}
                fill={palette.brand}
                stroke="white"
                strokeWidth={capture.width * 0.003}
              />
              <SvgText
                x={x}
                y={y + capture.width * 0.01}
                textAnchor="middle"
                fontSize={capture.width * 0.025}
                fill="white"
              >
                {i + 1}
              </SvgText>
            </React.Fragment>
          ))}
        </Svg>
      </View>
      <View style={styles.row}>
        <Field
          label="Measured width (m), optional"
          value={width}
          onChangeText={setWidth}
          keyboardType="decimal-pad"
        />
        <Field
          label="Measured depth (m), optional"
          value={depth}
          onChangeText={setDepth}
          keyboardType="decimal-pad"
        />
      </View>
      <Body>
        Leave an unknown value blank. Its current placeholder is kept and
        remains visibly unmeasured.
      </Body>
      <Button title="Save reviewed floor reference" onPress={save} />
    </Panel>
  );
}
