import {
  activeLayout,
  bounds,
  circulation,
  placementWarnings,
  roomFeedback,
  type Placement,
} from '@auraspace/scene-domain';
import BottomSheet from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { AppState, PanResponder, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { RecoverableBoundary } from '../../src/components/ErrorBoundary';
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
} from '../../src/components/ui';
import { FurnitureLibrary } from '../../src/features/editor/FurnitureLibrary';
import { ItemDetails } from '../../src/features/editor/ItemDetails';
import {
  NativeScene,
  type NativeViewportHandle,
} from '../../src/features/editor/NativeScene';
import {
  PlanView,
  type ViewportHandle,
} from '../../src/features/editor/PlanView';
import { RoomDetails } from '../../src/features/editor/RoomDetails';
import { saveSeparateCloudCopy } from '../../src/services/copy-room';
import {
  exportPlan,
  exportPortable,
  shareFile,
} from '../../src/services/sharing';
import { enqueueSync } from '../../src/services/sync';
import { useStudio } from '../../src/state/studio';
export default function RoomEditor() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    router = useRouter(),
    doc = useStudio((s) => s.projects.find((p) => p.id === id)),
    history = useStudio((s) => s.history[id]),
    dirty = useStudio((s) => s.dirtyIds.includes(id)),
    [mode, setMode] = React.useState<'overview' | 'inside' | 'plan'>(
      'overview',
    ),
    [selected, setSelected] = React.useState<string | null>(null),
    [placing, setPlacing] = React.useState<string | null>(null),
    [candidate, setCandidate] = React.useState<[number, number] | null>(null),
    [sheet, setSheet] = React.useState<
      'details' | 'room' | 'options' | 'layouts' | 'exports' | 'feedback' | null
    >(null),
    [libraryOpen, setLibraryOpen] = React.useState(false),
    [layoutName, setLayoutName] = React.useState(''),
    [reset, setReset] = React.useState(0),
    [eyeHeight, setEyeHeight] = React.useState(1.55),
    [grid, setGrid] = React.useState(false),
    [snap, setSnap] = React.useState(true),
    [busy, setBusy] = React.useState(false),
    [passageWidth, setPassageWidth] = React.useState(0.7),
    [foreground, setForeground] = React.useState(0);
  const library = React.useRef<BottomSheet>(null),
    planRef = React.useRef<ViewportHandle>(null),
    nativeRef = React.useRef<NativeViewportHandle>(null),
    viewRef = React.useRef<View>(null),
    longDrag = React.useRef(false),
    modeRef = React.useRef(mode),
    current = React.useRef({ placing, mode });
  modeRef.current = mode;
  current.current = { placing, mode };
  const execute = useStudio((s) => s.execute),
    notify = useStudio((s) => s.notify);
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForeground((n) => n + 1);
    });
    return () => sub.remove();
  }, []);
  const pick = (x: number, z: number) =>
    setCandidate([
      snap ? Math.round(x * 10) / 10 : x,
      snap ? Math.round(z * 10) / 10 : z,
    ]);
  const pickRef = React.useRef(pick);
  pickRef.current = pick;
  const point = (x: number, y: number) =>
    modeRef.current === 'plan'
      ? planRef.current?.project(x, y)
      : (nativeRef.current?.project(x, y) ?? planRef.current?.project(x, y));
  const dragResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: () => longDrag.current,
        onPanResponderMove: (_e, g) => {
          if (!longDrag.current) return;
          const p = point(g.moveX, g.moveY);
          if (p) pickRef.current(p[0], p[1]);
        },
        onPanResponderRelease: (_e, g) => {
          const p = point(g.moveX, g.moveY);
          if (p) pickRef.current(p[0], p[1]);
          longDrag.current = false;
        },
        onPanResponderTerminate: () => {
          longDrag.current = false;
        },
      }),
    [],
  );
  if (!doc)
    return (
      <SafeAreaView style={styles.center}>
        <Heading>Room not found</Heading>
        <Button title="Back to studio" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  const scene = doc.scene,
    layout = activeLayout(scene),
    item = scene.items.find((i) => i.id === selected),
    placement = layout.placements.find((p) => p.physicalItemId === selected),
    feedback = roomFeedback(scene);
  const staged: Placement | null =
      placing && candidate
        ? {
            physicalItemId: placing,
            floorCenterXM: candidate[0],
            floorCenterZM: candidate[1],
            yawRad: 0,
            locked: false,
          }
        : null,
    stageWarnings = staged ? placementWarnings(scene, staged) : [];
  const choose = (id: string) => {
    setSelected(null);
    setPlacing(id);
    setCandidate(null);
    setSheet(null);
    library.current?.close();
    setLibraryOpen(false);
  };
  const select = (id: string | null) => {
    if (!placing) {
      setSelected(id);
      setSheet(null);
    }
  };
  const move = (id: string, x: number, z: number) => {
    const p = activeLayout(
      useStudio.getState().projects.find((p) => p.id === doc.id)!.scene,
    ).placements.find((p) => p.physicalItemId === id);
    if (p)
      execute(doc.id, {
        type: 'place',
        placement: {
          ...p,
          floorCenterXM: snap ? Math.round(x * 10) / 10 : x,
          floorCenterZM: snap ? Math.round(z * 10) / 10 : z,
        },
      });
  };
  const run = (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    void action()
      .catch((error) =>
        notify(
          error instanceof Error
            ? error.message
            : 'This operation could not finish. Your room is saved locally.',
        ),
      )
      .finally(() => setBusy(false));
  };
  const fallback = (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12 }}>
        <Body>
          3D is unavailable on this device. Your floor plan remains fully
          editable.
        </Body>
      </View>
      <PlanView
        ref={planRef}
        scene={scene}
        selectedId={selected}
        placingId={placing}
        candidate={candidate}
        onSelect={select}
        onMove={move}
        onPlace={pick}
        showGrid={grid}
      />
    </View>
  );
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: palette.background }}
      edges={['top', 'bottom']}
      {...dragResponder.panHandlers}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderBottomWidth: 1,
          borderColor: palette.line,
        }}
      >
        <Button compact secondary title="‹" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{ fontSize: 14, fontWeight: '600', color: palette.ink }}
          >
            {doc.name}
          </Text>
          <Text style={{ fontSize: 10, color: palette.secondary }}>
            {dirty ? 'Saving locally…' : 'Saved on this device'}
          </Text>
        </View>
        <Button
          compact
          secondary
          title="↶"
          disabled={!history?.past.length}
          onPress={() => useStudio.getState().undo(doc.id)}
        />
        <Button
          compact
          secondary
          title="↷"
          disabled={!history?.future.length}
          onPress={() => useStudio.getState().redo(doc.id)}
        />
        <Button
          compact
          secondary
          title="•••"
          onPress={() => setSheet('options')}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          padding: 10,
          gap: 6,
        }}
      >
        {(
          [
            { id: 'inside', label: 'Inside' },
            { id: 'overview', label: '3D view' },
            { id: 'plan', label: 'Floor plan' },
          ] as const
        ).map((tab) => (
          <Button
            key={tab.id}
            compact
            secondary={mode !== tab.id}
            title={tab.label}
            onPress={() => {
              setMode(tab.id);
              setCandidate(null);
            }}
          />
        ))}
      </View>
      <View
        ref={viewRef}
        collapsable={false}
        style={{ flex: 1, minHeight: 0, backgroundColor: '#eeeee7' }}
      >
        {mode === 'plan' ? (
          <PlanView
            ref={planRef}
            scene={scene}
            selectedId={selected}
            placingId={placing}
            candidate={candidate}
            onSelect={select}
            onMove={move}
            onPlace={pick}
            showGrid={grid}
          />
        ) : (
          <RecoverableBoundary
            key={`${mode}-${foreground}`}
            fallback={fallback}
          >
            <NativeScene
              onUnavailable={() => {
                setMode('plan');
                notify(
                  '3D could not start. Continue editing with the floor plan, or try 3D again.',
                );
              }}
              ref={nativeRef}
              scene={scene}
              mode={mode}
              selectedId={selected}
              placingId={placing}
              candidate={candidate}
              onSelect={select}
              onMove={move}
              onPlace={pick}
              reset={reset}
              eyeHeight={eyeHeight}
              showGrid={grid}
            />
          </RecoverableBoundary>
        )}
        {scene.items.length === 0 && !placing && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 15,
              left: 20,
              right: 20,
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Heading small>A blank canvas. All yours.</Heading>
            <Body>Add a piece and see your room take shape.</Body>
          </View>
        )}
      </View>
      {!libraryOpen && (
        <View
          style={{
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 7,
            gap: 8,
            borderTopWidth: 1,
            borderColor: palette.line,
            backgroundColor: palette.background,
          }}
        >
          {placing ? (
            <>
              <Body>
                {candidate
                  ? `Place ${scene.items.find((i) => i.id === placing)?.name ?? 'piece'} here?`
                  : 'Tap the floor, or drag a piece from the tray, to choose a position.'}
              </Body>
              {stageWarnings.map((w) => (
                <Text key={w} style={{ fontSize: 11, color: palette.warning }}>
                  {w}
                </Text>
              ))}
              <View style={styles.row}>
                <Button
                  title={
                    stageWarnings.length
                      ? 'Keep as a flagged draft'
                      : 'Place here'
                  }
                  disabled={!staged}
                  onPress={() => {
                    if (
                      staged &&
                      execute(doc.id, { type: 'place', placement: staged })
                    ) {
                      setSelected(placing);
                      setPlacing(null);
                      setCandidate(null);
                    }
                  }}
                />
                <Button
                  secondary
                  title="Cancel"
                  onPress={() => {
                    setPlacing(null);
                    setCandidate(null);
                  }}
                />
              </View>
            </>
          ) : item ? (
            <View
              style={[
                styles.row,
                { justifyContent: 'center', flexWrap: 'wrap' },
              ]}
            >
              <Button
                compact
                title={
                  placement && placementWarnings(scene, placement).length
                    ? 'Details · check fit'
                    : 'Details'
                }
                onPress={() => setSheet('details')}
              />
              <Button
                compact
                secondary
                title="Rotate"
                disabled={!placement || placement.locked}
                onPress={() => {
                  if (placement)
                    execute(doc.id, {
                      type: 'place',
                      placement: {
                        ...placement,
                        yawRad:
                          (placement.yawRad - Math.PI / 4) % (Math.PI * 2),
                      },
                    });
                }}
              />
              <Button
                compact
                secondary
                title="To tray"
                disabled={!item.movable || placement?.locked}
                onPress={() => {
                  if (execute(doc.id, { type: 'unplace', id: item.id })) {
                    setSelected(null);
                  }
                }}
              />
              <Button
                compact
                secondary
                title="✕"
                onPress={() => setSelected(null)}
              />
            </View>
          ) : (
            <Button
              testID="add-furniture"
              title="＋ Add furniture"
              onPress={() => {
                setSelected(null);
                setLibraryOpen(true);
                library.current?.snapToIndex(0);
              }}
            />
          )}
        </View>
      )}
      <FurnitureLibrary
        document={doc}
        sheetRef={library}
        onChoose={choose}
        onLongPress={(id) => {
          choose(id);
          longDrag.current = true;
        }}
        onClose={() => setLibraryOpen(false)}
      />
      <Sheet
        open={sheet === 'details'}
        title={item?.name ?? 'Piece details'}
        onClose={() => setSheet(null)}
      >
        {item && (
          <ItemDetails
            document={doc}
            itemId={item.id}
            onClose={() => {
              setSheet(null);
              setSelected(null);
            }}
          />
        )}
      </Sheet>
      <Sheet
        open={sheet === 'room'}
        title="Room dimensions & openings"
        onClose={() => setSheet(null)}
      >
        <RoomDetails document={doc} />
      </Sheet>
      <Sheet
        open={sheet === 'options'}
        title="Your room"
        onClose={() => setSheet(null)}
      >
        <Field
          label="Room name"
          defaultValue={doc.name}
          maxLength={100}
          onEndEditing={(e) =>
            useStudio.getState().rename(doc.id, e.nativeEvent.text)
          }
        />
        <Button
          secondary
          title="Dimensions, openings & finishes"
          onPress={() => setSheet('room')}
        />
        <Button
          secondary
          title="Room photos & extraction"
          onPress={() => {
            setSheet(null);
            router.push({
              pathname: '/capture',
              params: { projectId: doc.id },
            });
          }}
        />
        <Button
          secondary
          title="Saved layouts"
          onPress={() => setSheet('layouts')}
        />
        <Button
          secondary
          title="Review fit & circulation"
          onPress={() => setSheet('feedback')}
        />
        <Button
          secondary
          title="Export & share"
          onPress={() => setSheet('exports')}
        />
        <View style={styles.row}>
          <Button
            compact
            secondary
            title={grid ? 'Hide grid' : 'Show grid'}
            onPress={() => setGrid(!grid)}
          />
          <Button
            compact
            secondary
            title={snap ? 'Snap: 10 cm' : 'Snap: off'}
            onPress={() => setSnap(!snap)}
          />
          <Button
            compact
            secondary
            title="Reset view"
            onPress={() => setReset((n) => n + 1)}
          />
        </View>
        <NumberField
          label="Eye height (m)"
          value={eyeHeight}
          min={0.7}
          max={Math.min(2.1, scene.height.meters - 0.1)}
          onChange={setEyeHeight}
        />
        <Button
          secondary
          title="Return movable pieces to tray"
          onPress={() => {
            execute(doc.id, { type: 'empty-room' });
            setSelected(null);
            setSheet(null);
          }}
        />
        <Body>Fixed and locked pieces retain their placements.</Body>
        <Button
          secondary
          title="Sync this room when connected"
          onPress={() =>
            run(async () => {
              await enqueueSync(doc.id);
              notify('Sync queued. Conflicts preserve your local draft.');
            })
          }
        />
        <Button
          secondary
          title="Save a separate cloud copy"
          disabled={busy}
          onPress={() =>
            run(async () => {
              const copyId = await saveSeparateCloudCopy(doc.id);
              setSheet(null);
              router.replace({
                pathname: '/room/[id]',
                params: { id: copyId },
              });
              notify('A separate room copy was saved and queued for sync.');
            })
          }
        />
      </Sheet>
      <Sheet
        open={sheet === 'layouts'}
        title="Try another possibility"
        onClose={() => setSheet(null)}
      >
        <Body>
          Each layout has its own placements. Physical item dimensions and fixed
          fixtures are shared.
        </Body>
        <Field
          label="Name this arrangement"
          value={layoutName}
          maxLength={100}
          onChangeText={setLayoutName}
        />
        <Button
          title="Save arrangement"
          onPress={() => {
            if (
              execute(doc.id, {
                type: 'save-layout',
                name: layoutName.trim() || `Layout ${scene.layouts.length + 1}`,
              })
            )
              setLayoutName('');
          }}
        />
        {scene.layouts.map((l) => (
          <Panel key={l.id}>
            <Heading small>
              {l.name}
              {l.id === scene.activeLayoutId ? ' · active' : ''}
            </Heading>
            <View style={styles.row}>
              <Button
                secondary
                title="Open layout"
                disabled={l.id === scene.activeLayoutId}
                onPress={() => {
                  execute(doc.id, { type: 'load-layout', id: l.id });
                  setSelected(null);
                }}
              />
              <Button
                secondary
                title="Delete"
                disabled={scene.layouts.length === 1}
                onPress={() =>
                  execute(doc.id, { type: 'delete-layout', id: l.id })
                }
              />
            </View>
          </Panel>
        ))}
      </Sheet>
      <Sheet
        open={sheet === 'exports'}
        title="Take your ideas with you"
        onClose={() => setSheet(null)}
      >
        <Button
          title="Share editable project + photos"
          disabled={busy}
          onPress={() => run(() => exportPortable(doc))}
        />
        <Button
          secondary
          title="Share dimensioned floor plan"
          disabled={busy}
          onPress={() => run(() => exportPlan(doc))}
        />
        <Button
          secondary
          title="Share current view"
          disabled={busy}
          onPress={() =>
            run(async () => {
              setSheet(null);
              await new Promise((resolve) => setTimeout(resolve, 200));
              const native =
                mode !== 'plan' ? await nativeRef.current?.capture() : null;
              const uri =
                native ??
                (await captureRef(viewRef, {
                  format: 'png',
                  quality: 1,
                  result: 'tmpfile',
                  handleGLSurfaceViewOnAndroid: true,
                }));
              await shareFile(uri, 'image/png');
            })
          }
        />
        <Body>
          The project package contains editable scene data and persistent
          photos. Images of plans and views are flattened references.
        </Body>
      </Sheet>
      <Sheet
        open={sheet === 'feedback'}
        title="Check your arrangement"
        onClose={() => setSheet(null)}
      >
        <Panel>
          <Heading small>{feedback.area.toFixed(1)} m² floor area</Heading>
          <Body>
            {feedback.occupiedArea === null
              ? 'Area usage is unavailable while footprints overlap or leave the room.'
              : `${feedback.occupiedArea.toFixed(1)} m² furniture footprint · ${feedback.freeArea?.toFixed(1)} m² remaining`}
          </Body>
          <Body>
            {feedback.estimatedCount} pieces still have estimated or placeholder
            dimensions.
          </Body>
        </Panel>
        {feedback.warnings.map((w, i) => (
          <Button
            secondary
            key={`${w.itemId}-${i}`}
            title={`${scene.items.find((i) => i.id === w.itemId)?.name}: ${w.message}`}
            onPress={() => {
              setSelected(w.itemId);
              setSheet('details');
            }}
          />
        ))}
        {!feedback.warnings.length && (
          <Body>
            No footprint, boundary, ceiling, or door-clearance conflicts were
            found with the current proxy geometry.
          </Body>
        )}
        <NumberField
          label="Preferred passage width (m)"
          value={passageWidth}
          min={0.3}
          max={2}
          onChange={setPassageWidth}
        />
        <Button
          secondary
          title="Check center access from doorway"
          onPress={() => {
            const b = bounds(scene),
              door = scene.openings.find((o) => o.kind === 'door');
            if (!door) {
              notify('Add a doorway first.');
              return;
            }
            const a = scene.floorPolygonXZ[door.wallIndex],
              c =
                scene.floorPolygonXZ[
                  (door.wallIndex + 1) % scene.floorPolygonXZ.length
                ],
              length = Math.hypot(c[0] - a[0], c[1] - a[1]);
            const center: [number, number] = [
                b.minX + b.width / 2,
                b.minZ + b.depth / 2,
              ],
              mid: [number, number] = [
                a[0] +
                  ((c[0] - a[0]) / length) * (door.offsetM + door.widthM / 2),
                a[1] +
                  ((c[1] - a[1]) / length) * (door.offsetM + door.widthM / 2),
              ],
              dist = Math.hypot(center[0] - mid[0], center[1] - mid[1]);
            const start: [number, number] = [
              mid[0] +
                ((center[0] - mid[0]) / dist) * (passageWidth / 2 + 0.15),
              mid[1] +
                ((center[1] - mid[1]) / dist) * (passageWidth / 2 + 0.15),
            ];
            notify(circulation(scene, start, center, passageWidth).reason);
          }}
        />
        <Body>
          Clearance is a conservative planning preference using box footprints
          and a raster grid. It is not a building-code or accessibility
          certification.
        </Body>
      </Sheet>
    </SafeAreaView>
  );
}
