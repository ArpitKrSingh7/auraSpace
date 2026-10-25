import {
  activeLayout,
  evidence,
  newPhysicalItem,
  type PhysicalItem,
  type ProjectDocument,
} from '@auraspace/scene-domain';
import { CATALOG } from '@auraspace/scene-domain/legacy/catalog';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MediaImage } from '../../components/MediaImage';
import {
  Body,
  Button,
  Field,
  Heading,
  palette,
  Sheet,
  styles,
} from '../../components/ui';
import { useStudio } from '../../state/studio';
export function FurnitureLibrary({
  document: doc,
  sheetRef,
  onChoose,
  onLongPress,
  onClose,
}: {
  document: ProjectDocument;
  sheetRef: React.RefObject<BottomSheet | null>;
  onChoose: (id: string) => void;
  onLongPress: (id: string) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = React.useState(false),
    [name, setName] = React.useState('Custom object'),
    [w, setW] = React.useState('0.8'),
    [d, setD] = React.useState('0.6'),
    [h, setH] = React.useState('0.8'),
    execute = useStudio((s) => s.execute);
  const placed = new Set(
    activeLayout(doc.scene).placements.map((p) => p.physicalItemId),
  );
  const tray = doc.scene.items.filter((i) => i.movable && !placed.has(i.id));
  const card = (item: PhysicalItem) => {
    const observation = doc.scene.observations.find((o) =>
      item.observationIds.includes(o.id),
    );
    return (
      <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`Place ${item.name}`}
        onPress={() => onChoose(item.id)}
        onLongPress={() => onLongPress(item.id)}
        delayLongPress={400}
        style={{
          width: 120,
          padding: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: palette.line,
          gap: 6,
          backgroundColor: palette.panel,
        }}
      >
        {observation?.thumbnailAssetId ? (
          <MediaImage
            assetId={observation.thumbnailAssetId}
            style={{ height: 65, width: '100%' }}
            resizeMode="contain"
          />
        ) : (
          <View
            style={{
              height: 55,
              backgroundColor: item.color,
              borderRadius: 8,
              margin: 7,
            }}
          />
        )}
        <Text
          numberOfLines={1}
          style={{ fontSize: 12, fontWeight: '600', color: palette.ink }}
        >
          {item.name}
        </Text>
        <Text style={{ fontSize: 10, color: palette.secondary }}>
          {Math.round(item.width.meters * 100)} ×{' '}
          {Math.round(item.depth.meters * 100)} cm
        </Text>
      </Pressable>
    );
  };
  return (
    <>
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['36%', '70%']}
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={onClose}
        backgroundStyle={{ backgroundColor: palette.background }}
        handleIndicatorStyle={{ backgroundColor: '#bcc7b5' }}
      >
        <BottomSheetFlatList
          data={Array.from({ length: Math.ceil(tray.length / 2) }, (_, i) =>
            tray.slice(i * 2, i * 2 + 2),
          )}
          keyExtractor={(row: PhysicalItem[]) => row.map((i) => i.id).join(':')}
          initialNumToRender={4}
          windowSize={5}
          renderItem={({ item: row }: { item: PhysicalItem[] }) => (
            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 5 }}>
              {row.map(card)}
            </View>
          )}
          contentContainerStyle={{ padding: 18, paddingBottom: 35 }}
          ListHeaderComponent={
            <View style={{ gap: 18, marginBottom: 12 }}>
              {' '}
              <View style={styles.row}>
                <Heading small>Furniture</Heading>
                <Button
                  secondary
                  compact
                  title="Close"
                  onPress={() => sheetRef.current?.close()}
                />
              </View>
              {tray.length > 0 && <Body>Your pieces in the tray</Body>}
            </View>
          }
          ListFooterComponent={
            <View style={{ gap: 18, marginTop: 18 }}>
              {' '}
              <Body>Add a library piece</Body>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {CATALOG.filter((c) => c.type !== 'custom').map((entry) => (
                  <Pressable
                    accessibilityRole="button"
                    key={entry.type}
                    style={{
                      width: 120,
                      padding: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: palette.line,
                      gap: 8,
                      backgroundColor: palette.panel,
                    }}
                    onPress={() => {
                      const item = newPhysicalItem(entry.type);
                      if (execute(doc.id, { type: 'add-item', item }))
                        onChoose(item.id);
                    }}
                  >
                    <View
                      style={{
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: entry.color,
                      }}
                    />
                    <Text style={{ fontSize: 12, color: palette.ink }}>
                      {entry.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Button
                secondary
                title="Add a custom object"
                onPress={() => setCustom(true)}
              />
              <Body>
                Tap a piece, then tap the floor. Long-press to drag it into the
                room. Its dimensions stay editable.
              </Body>
            </View>
          }
        />
      </BottomSheet>
      <Sheet
        open={custom}
        title="Give anything a place"
        onClose={() => setCustom(false)}
      >
        <Field
          label="Object name"
          value={name}
          maxLength={100}
          onChangeText={setName}
        />
        <View style={styles.row}>
          <Field
            label="Width (m)"
            value={w}
            onChangeText={setW}
            keyboardType="decimal-pad"
          />
          <Field
            label="Depth (m)"
            value={d}
            onChangeText={setD}
            keyboardType="decimal-pad"
          />
          <Field
            label="Height (m)"
            value={h}
            onChangeText={setH}
            keyboardType="decimal-pad"
          />
        </View>
        <Button
          title="Add & place"
          onPress={() => {
            const item = newPhysicalItem('custom', name);
            item.width = evidence(Number(w), 'user-measured', true);
            item.depth = evidence(Number(d), 'user-measured', true);
            item.height = evidence(Number(h), 'user-measured', true);
            if (execute(doc.id, { type: 'add-item', item })) {
              setCustom(false);
              onChoose(item.id);
            }
          }}
        />
      </Sheet>
    </>
  );
}
