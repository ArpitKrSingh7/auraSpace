import {
  bounds,
  evidence,
  type Opening,
  type ProjectDocument,
} from '@auraspace/scene-domain';
import { newId } from '@auraspace/scene-domain/legacy/catalog';
import React from 'react';
import { Text, View } from 'react-native';
import {
  Body,
  Button,
  Heading,
  NumberField,
  Panel,
  styles,
} from '../../components/ui';
import { useStudio } from '../../state/studio';
export function RoomDetails({ document: doc }: { document: ProjectDocument }) {
  const scene = doc.scene,
    b = bounds(scene),
    execute = useStudio((s) => s.execute),
    [advanced, setAdvanced] = React.useState(false);
  const resize = (axis: 'width' | 'depth' | 'height', value: number) => {
    const width = axis === 'width' ? value : b.width,
      depth = axis === 'depth' ? value : b.depth,
      height = axis === 'height' ? value : scene.height.meters;
    const floor =
      axis === 'height'
        ? scene.floorPolygonXZ
        : scene.floorPolygonXZ.map(
            ([x, z]) =>
              [
                b.minX + ((x - b.minX) * width) / b.width,
                b.minZ + ((z - b.minZ) * depth) / b.depth,
              ] as [number, number],
          );
    const openings = scene.openings.map((o) => {
      const a = floor[o.wallIndex],
        c = floor[(o.wallIndex + 1) % floor.length],
        len = Math.hypot(c[0] - a[0], c[1] - a[1]),
        sill = Math.min(o.sillHeightM, height - 0.2),
        h = Math.min(o.heightM, height - sill),
        w = Math.min(o.widthM, len);
      return {
        ...o,
        widthM: w,
        offsetM: Math.min(o.offsetM, Math.max(0, len - w)),
        heightM: h,
        sillHeightM: sill,
      };
    });
    execute(doc.id, {
      type: 'room',
      changes: {
        floorPolygonXZ: floor,
        height:
          axis === 'height'
            ? evidence(value, 'user-measured', true)
            : scene.height,
        dimensionEvidence: {
          ...scene.dimensionEvidence,
          ...(axis !== 'height'
            ? { [axis]: evidence(value, 'user-measured', true) }
            : {}),
        },
        boundarySource:
          axis !== 'height' ? 'user-measured' : scene.boundarySource,
        openings,
      } as any,
    });
  };
  const editOpening = (o: Opening, changes: Partial<Opening>) =>
    execute(doc.id, {
      type: 'opening',
      opening: { ...o, ...changes, source: 'user-measured' },
    });
  const addOpening = (kind: 'door' | 'window') => {
    for (
      let wallIndex = 0;
      wallIndex < scene.floorPolygonXZ.length;
      wallIndex++
    ) {
      const a = scene.floorPolygonXZ[wallIndex],
        c = scene.floorPolygonXZ[(wallIndex + 1) % scene.floorPolygonXZ.length],
        len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const used = scene.openings
        .filter((o) => o.wallIndex === wallIndex)
        .sort((a, b) => a.offsetM - b.offsetM);
      let offset = 0.15;
      for (const o of used)
        if (offset + 0.8 > o.offsetM) offset = o.offsetM + o.widthM + 0.15;
      if (offset + 0.8 <= len) {
        execute(doc.id, {
          type: 'opening',
          opening: {
            id: newId('opening'),
            kind,
            wallIndex,
            offsetM: offset,
            widthM: 0.8,
            heightM:
              kind === 'door'
                ? Math.min(2.1, scene.height.meters)
                : Math.min(1.1, scene.height.meters - 0.5),
            sillHeightM: kind === 'door' ? 0 : 0.5,
            source: 'placeholder',
            ...(kind === 'door' ? { doorSwing: 'inward-start' as const } : {}),
          },
        });
        return;
      }
    }
    useStudio
      .getState()
      .notify(
        'There is no free wall span for another opening. Adjust existing openings first.',
      );
  };
  return (
    <View style={{ gap: 20 }}>
      <Body>
        Enter known measurements. Resizing the shell keeps furniture at its
        actual size and position; review any fit warnings afterward.
      </Body>
      <View style={styles.row}>
        <NumberField
          label="Width (m)"
          value={b.width}
          min={1}
          max={40}
          onChange={(v) => resize('width', v)}
        />
        <NumberField
          label="Depth (m)"
          value={b.depth}
          min={1}
          max={40}
          onChange={(v) => resize('depth', v)}
        />
      </View>
      <NumberField
        label="Height (m)"
        value={scene.height.meters}
        min={1.5}
        max={12}
        onChange={(v) => resize('height', v)}
      />
      <Body>
        Width:{' '}
        {scene.dimensionEvidence.width?.source.replaceAll('-', ' ') ??
          'boundary estimate'}{' '}
        · Depth:{' '}
        {scene.dimensionEvidence.depth?.source.replaceAll('-', ' ') ??
          'boundary estimate'}{' '}
        · Height: {scene.height.source.replaceAll('-', ' ')}
      </Body>
      <Heading small>Walls & floor</Heading>
      {(['wallColor', 'floorColor'] as const).map((surface) => (
        <View key={surface} style={{ gap: 8 }}>
          <Body>
            {surface === 'wallColor' ? 'Wall finish' : 'Floor finish'}
          </Body>
          <View
            style={[
              styles.row,
              { justifyContent: 'flex-start', flexWrap: 'wrap' },
            ]}
          >
            {(surface === 'wallColor'
              ? ['#EDE7DE', '#E7E5DA', '#F6F3EA', '#CDD6C5', '#D9CFC8']
              : ['#C9A982', '#D4B797', '#B18B63', '#CFC9BF', '#9A8C78']
            ).map((color) => (
              <Button
                key={color}
                compact
                title={scene[surface] === color ? '✓' : '●'}
                secondary={scene[surface] !== color}
                onPress={() =>
                  execute(doc.id, {
                    type: 'room',
                    changes: { [surface]: color },
                  })
                }
              />
            ))}
          </View>
        </View>
      ))}
      <Heading small>Doors & windows</Heading>
      {scene.openings.map((o, index) => (
        <Panel key={o.id}>
          <Heading small>
            {o.kind === 'door' ? 'Door' : 'Window'} {index + 1}
          </Heading>
          <NumberField
            label="Wall number"
            value={o.wallIndex + 1}
            min={1}
            max={scene.floorPolygonXZ.length}
            onChange={(v) => editOpening(o, { wallIndex: Math.round(v) - 1 })}
          />
          <View style={styles.row}>
            <NumberField
              label="Offset along wall (m)"
              value={o.offsetM}
              onChange={(v) => editOpening(o, { offsetM: v })}
            />
            <NumberField
              label="Opening width (m)"
              value={o.widthM}
              min={0.1}
              max={10}
              onChange={(v) => editOpening(o, { widthM: v })}
            />
          </View>
          <View style={styles.row}>
            <NumberField
              label="Opening height (m)"
              value={o.heightM}
              min={0.1}
              max={12}
              onChange={(v) => editOpening(o, { heightM: v })}
            />
            <NumberField
              label="Sill height (m)"
              value={o.sillHeightM}
              min={0}
              max={12}
              onChange={(v) => editOpening(o, { sillHeightM: v })}
            />
          </View>
          {o.kind === 'door' && (
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              {(['inward-start', 'inward-end', 'outward'] as const).map(
                (doorSwing) => (
                  <Button
                    key={doorSwing}
                    compact
                    secondary={o.doorSwing !== doorSwing}
                    title={doorSwing.replace('-', ' ')}
                    onPress={() => editOpening(o, { doorSwing })}
                  />
                ),
              )}
            </View>
          )}
          <Button
            secondary
            compact
            title="Remove opening"
            onPress={() =>
              execute(doc.id, { type: 'remove-opening', id: o.id })
            }
          />
        </Panel>
      ))}
      <View style={styles.row}>
        <Button secondary title="Add door" onPress={() => addOpening('door')} />
        <Button
          secondary
          title="Add window"
          onPress={() => addOpening('window')}
        />
      </View>
      <Button
        secondary
        title={advanced ? 'Hide boundary editor' : 'Edit floor outline…'}
        onPress={() => setAdvanced(!advanced)}
      />
      {advanced && (
        <>
          <Body>
            Vertices follow the room boundary in order. The same polygon is used
            for rendering and containment checks.
          </Body>
          {scene.floorPolygonXZ.map(([x, z], index) => (
            <View key={index} style={styles.row}>
              <Text>{index + 1}</Text>
              <NumberField
                label="X (m)"
                value={x}
                min={-100}
                max={100}
                onChange={(v) =>
                  execute(doc.id, {
                    type: 'room',
                    changes: {
                      floorPolygonXZ: scene.floorPolygonXZ.map((p, i) =>
                        i === index ? [v, p[1]] : p,
                      ),
                      boundarySource: 'user-measured',
                    },
                  })
                }
              />
              <NumberField
                label="Z (m)"
                value={z}
                min={-100}
                max={100}
                onChange={(v) =>
                  execute(doc.id, {
                    type: 'room',
                    changes: {
                      floorPolygonXZ: scene.floorPolygonXZ.map((p, i) =>
                        i === index ? [p[0], v] : p,
                      ),
                      boundarySource: 'user-measured',
                    },
                  })
                }
              />
            </View>
          ))}
          <Body>
            For a concave room, verify every segment and opening before placing
            furniture.
          </Body>
        </>
      )}
    </View>
  );
}
