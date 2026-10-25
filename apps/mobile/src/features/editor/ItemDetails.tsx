import {
  activeLayout,
  placementWarnings,
  type Dimension,
  type ProjectDocument,
} from '@auraspace/scene-domain';
import { useRouter } from 'expo-router';
import React from 'react';
import { Switch, Text, View } from 'react-native';
import { MediaImage } from '../../components/MediaImage';
import {
  Body,
  Button,
  Field,
  Heading,
  NumberField,
  palette,
  Panel,
  Sheet,
  styles,
} from '../../components/ui';
import { useStudio } from '../../state/studio';
export function ItemDetails({
  document: doc,
  itemId,
  onClose,
}: {
  document: ProjectDocument;
  itemId: string;
  onClose: () => void;
}) {
  const router = useRouter(),
    execute = useStudio((s) => s.execute),
    [merge, setMerge] = React.useState(false),
    item = doc.scene.items.find((i) => i.id === itemId),
    [name, setName] = React.useState(item?.name ?? '');
  if (!item) return null;
  const placement = activeLayout(doc.scene).placements.find(
      (p) => p.physicalItemId === itemId,
    ),
    warnings = placement ? placementWarnings(doc.scene, placement) : [];
  const editAxis = (axis: 'width' | 'depth' | 'height', meters: number) => {
    const dim: Dimension = {
      ...item[axis],
      meters,
      source: 'user-measured',
      reviewed: true,
    };
    execute(doc.id, {
      type: 'edit-item',
      id: item.id,
      changes: { [axis]: dim },
    });
  };
  const updatePose = (changes: Partial<NonNullable<typeof placement>>) => {
    if (placement)
      execute(doc.id, {
        type: 'place',
        placement: { ...placement, ...changes },
      });
  };
  return (
    <View style={{ gap: 18 }}>
      <Field
        label="Piece name"
        value={name}
        onChangeText={setName}
        maxLength={100}
        onEndEditing={() =>
          execute(doc.id, {
            type: 'edit-item',
            id: item.id,
            changes: { name: name.trim() || item.name },
          })
        }
      />
      <Heading small>Dimensions</Heading>
      <Body>
        These are physical dimensions shared by every layout. Change only the
        values you have measured.
      </Body>
      {(['width', 'depth', 'height'] as const).map((axis) => (
        <View key={axis} style={{ gap: 5 }}>
          <NumberField
            label={`${axis[0].toUpperCase() + axis.slice(1)} (m)`}
            value={item[axis].meters}
            onChange={(meters) => editAxis(axis, meters)}
            min={0.01}
            max={axis === 'height' ? 12 : 20}
          />
          <Text style={{ fontSize: 11, color: palette.secondary }}>
            {item[axis].source.replaceAll('-', ' ')} ·{' '}
            {item[axis].reviewed ? 'reviewed' : 'needs review'}
          </Text>
        </View>
      ))}
      {placement && (
        <>
          <Heading small>Placement</Heading>
          <View style={styles.row}>
            <NumberField
              label="X (m)"
              value={placement.floorCenterXM}
              min={-100}
              max={100}
              onChange={(floorCenterXM) => updatePose({ floorCenterXM })}
            />
            <NumberField
              label="Z (m)"
              value={placement.floorCenterZM}
              min={-100}
              max={100}
              onChange={(floorCenterZM) => updatePose({ floorCenterZM })}
            />
          </View>
          <NumberField
            label="Clockwise rotation (degrees)"
            value={((((-placement.yawRad * 180) / Math.PI) % 360) + 360) % 360}
            min={0}
            max={360}
            onChange={(degrees) =>
              updatePose({ yawRad: (-degrees * Math.PI) / 180 })
            }
          />
          <View style={styles.row}>
            <Body>Lock placement in this layout</Body>
            <Switch
              value={placement.locked}
              disabled={!item.movable}
              onValueChange={(locked) => {
                execute(doc.id, { type: 'lock', id: item.id, locked });
              }}
              trackColor={{ true: palette.brand }}
            />
          </View>
          <View style={styles.row}>
            <Body>Fixed fixture in every layout</Body>
            <Switch
              value={!item.movable}
              onValueChange={(fixed) => {
                execute(doc.id, { type: 'fixed', id: item.id, fixed });
              }}
              trackColor={{ true: palette.brand }}
            />
          </View>
        </>
      )}
      {warnings.length > 0 && (
        <Panel>
          <Heading small>Check the fit</Heading>
          {warnings.map((w, i) => (
            <Body key={i}>{w}</Body>
          ))}
        </Panel>
      )}
      <Heading small>Finish</Heading>
      <View
        style={[styles.row, { flexWrap: 'wrap', justifyContent: 'flex-start' }]}
      >
        {[
          '#8C9D88',
          '#C9977D',
          '#B58A60',
          '#C9B9A5',
          '#A4A8B8',
          '#557761',
          '#E6DED1',
          '#424C43',
        ].map((color) => (
          <Button
            compact
            key={color}
            title={item.color === color ? '✓' : '●'}
            secondary={item.color !== color}
            onPress={() =>
              execute(doc.id, {
                type: 'edit-item',
                id: item.id,
                changes: { color },
              })
            }
          />
        ))}
      </View>
      <Heading small>Source observations</Heading>
      {item.observationIds.length ? (
        item.observationIds.map((id) => {
          const o = doc.scene.observations.find((o) => o.id === id)!;
          return (
            <Panel key={id}>
              <View style={styles.row}>
                <MediaImage
                  assetId={o.thumbnailAssetId}
                  style={{ height: 55, width: 55, borderRadius: 8 }}
                  resizeMode="contain"
                />
                <Body>{o.originalLabel}</Body>
              </View>
              <Button
                secondary
                title="Review source photo / mask"
                onPress={() => {
                  onClose();
                  router.push({
                    pathname: '/capture',
                    params: { projectId: doc.id, captureId: o.captureImageId },
                  });
                }}
              />
              {item.observationIds.length > 1 && (
                <Button
                  secondary
                  compact
                  title="This is a different physical piece"
                  onPress={() =>
                    execute(doc.id, {
                      type: 'split-observation',
                      itemId: item.id,
                      observationId: o.id,
                    })
                  }
                />
              )}
            </Panel>
          );
        })
      ) : (
        <Body>Library or custom object. No photo evidence is attached.</Body>
      )}
      <View style={[styles.row, { flexWrap: 'wrap' }]}>
        <Button
          secondary
          title="Duplicate as a new piece"
          onPress={() => execute(doc.id, { type: 'duplicate', id: item.id })}
        />
        <Button
          secondary
          title="Merge duplicate items…"
          disabled={doc.scene.items.length < 2}
          onPress={() => setMerge(true)}
        />
        <Button
          secondary
          title="Delete piece"
          disabled={!item.movable || placement?.locked}
          onPress={() => {
            if (execute(doc.id, { type: 'remove-item', id: item.id }))
              onClose();
          }}
        />
      </View>
      <Sheet
        open={merge}
        title="Keep this physical piece"
        onClose={() => setMerge(false)}
      >
        <Body>
          Select a duplicate to combine its photo observations into this piece.
          This piece’s dimensions are retained.
        </Body>
        {doc.scene.items
          .filter((i) => i.id !== item.id && i.movable)
          .map((other) => (
            <Button
              secondary
              key={other.id}
              title={`Merge ${other.name}`}
              onPress={() => {
                if (
                  execute(doc.id, {
                    type: 'merge',
                    keepId: item.id,
                    removeIds: [other.id],
                  })
                )
                  setMerge(false);
              }}
            />
          ))}
      </Sheet>
    </View>
  );
}
