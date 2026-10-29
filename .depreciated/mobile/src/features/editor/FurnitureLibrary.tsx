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
import { furnitureGroups, matchesFurniture, typeEmoji, type FurnitureGroup } from './furniture-library-data';
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
    [query, setQuery] = React.useState(''),
    [group, setGroup] = React.useState<FurnitureGroup>('All'),
    execute = useStudio((s) => s.execute),
    notify = useStudio((s) => s.notify);
  const placed = new Set(
    activeLayout(doc.scene).placements.map((p) => p.physicalItemId),
  );
  const tray = doc.scene.items.filter((i) => i.movable && !placed.has(i.id));
  const entries = CATALOG.filter((entry) => entry.type !== 'custom' && matchesFurniture(entry.type, entry.name, query, group));
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
          flex: 1,
          maxWidth: '49%',
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
              alignItems: 'center',
              justifyContent: 'center',
            }}
          ><Text style={{ fontSize: 30 }}>{typeEmoji[item.category]}</Text></View>
        )}
        <Text
          style={{ fontSize: 12, fontWeight: '600', lineHeight: 17, color: palette.ink }}
        >
          {item.name}
        </Text>
        <Text style={{ fontSize: 10, color: palette.secondary }}>
          {Math.round(item.width.meters * 100)} ×{' '}
          {Math.round(item.depth.meters * 100)} × {Math.round(item.height.meters * 100)} cm
        </Text>
        <Text style={{ fontSize: 10, color: palette.secondary }}>{item.mounting ?? 'floor'} placement</Text>
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
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: row }: { item: PhysicalItem[] }) => (
            <View style={{ flexDirection: 'row', gap: 10, marginVertical: 5 }}>
              {row.map(card)}
            </View>
          )}
          contentContainerStyle={{ padding: 18, paddingBottom: 35 }}
          ListHeaderComponent={
            <View style={{ gap: 18, marginBottom: 12 }}>
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
              <Heading small>Add a library piece</Heading>
              <Body>Library dimensions are starting estimates. Measure your piece before planning.</Body>
              <Field
                label="Search furniture"
                placeholder="Almirah, study table, AC…"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
              <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
                {(Object.keys(furnitureGroups) as FurnitureGroup[]).map((name) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: group === name }}
                    onPress={() => setGroup(name)}
                    style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: group === name ? palette.brand : palette.line, backgroundColor: group === name ? palette.tint : palette.panel }}
                  ><Text style={{ fontSize: 12, color: group === name ? palette.brand : palette.secondary }}>{name}</Text></Pressable>
                ))}
              </View>
              <Text style={{ fontSize: 11, color: palette.secondary }}>{entries.length} {entries.length === 1 ? 'piece' : 'pieces'} · W × D × H in cm</Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {entries.map((entry) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${entry.name}, ${entry.mounting ?? 'floor'} placement`}
                    key={entry.type}
                    style={{
                      width: '47%',
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
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    ><Text style={{ fontSize: 27 }}>{typeEmoji[entry.type]}</Text></View>
                    <Text style={{ fontSize: 12, fontWeight: '600', lineHeight: 17, minHeight: 34, color: palette.ink }}>
                      {entry.name}
                    </Text>
                    <Text style={{ fontSize: 10, color: palette.secondary }}>{Math.round(entry.width * 100)} × {Math.round(entry.depth * 100)} × {Math.round(entry.height * 100)}</Text>
                    <Text style={{ fontSize: 10, color: palette.brand }}>{entry.mounting ?? 'floor'} placement</Text>
                  </Pressable>
                ))}
              </View>
              {entries.length === 0 && <Body>No library pieces match. Try another search or add a custom object below.</Body>}
              <Button
                secondary
                title="Add a custom object"
                onPress={() => setCustom(true)}
              />
              <Body>
                Tap a piece, then tap the plan. Long-press a tray piece to drag
                it into the room. Set its surface and height in piece details.
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
        <Body>Use a cuboid for any unusual object. Start with a box or a thin board, then enter your own dimensions (0.01–12 m).</Body>
        <View style={[styles.row, { justifyContent: 'flex-start' }]}>
          <Button secondary compact title="Box preset" onPress={() => { setName('Custom box'); setW('0.8'); setD('0.6'); setH('0.8'); }} />
          <Button secondary compact title="Board preset" onPress={() => { setName('Custom board'); setW('1'); setD('0.03'); setH('0.8'); }} />
        </View>
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
            const dimensions = [w, d, h].map((value) => Number(value.replace(',', '.')));
            if (!name.trim() || dimensions.some((value) => !Number.isFinite(value) || value < 0.01 || value > 12)) {
              notify('Enter a name and dimensions between 0.01 and 12 meters.');
              return;
            }
            const item = newPhysicalItem('custom', name);
            item.width = evidence(dimensions[0], 'user-measured', true);
            item.depth = evidence(dimensions[1], 'user-measured', true);
            item.height = evidence(dimensions[2], 'user-measured', true);
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
