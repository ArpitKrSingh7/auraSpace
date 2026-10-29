import {
  applyRoomReconstruction,
  bounds,
  evidence,
  floorHomography,
  mapFloorPoint,
  type Capture,
  type PointXZ,
  type ProjectDocument,
  type RoomReconstructionProposal,
} from '@auraspace/scene-domain';
import React from 'react';
import { PanResponder, Pressable, Switch, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
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
  onRetake,
}: {
  document: ProjectDocument;
  captureId: string;
  onRetake?: () => void;
}) {
  const capture = doc.scene.captures.find((c) => c.id === captureId),
    proposal = capture?.roomProposal,
    proposalKey = JSON.stringify(proposal),
    [manualOpen, setManualOpen] = React.useState(false),
    [scaleOpen, setScaleOpen] = React.useState(false),
    [anchorPoints, setAnchorPoints] = React.useState<PointXZ[]>([]),
    [anchorLength, setAnchorLength] = React.useState(''),
    [width, setWidth] = React.useState(''),
    [depth, setDepth] = React.useState(''),
    [height, setHeight] = React.useState(''),
    [openingKinds, setOpeningKinds] = React.useState<Record<string, 'door' | 'window'>>({}),
    [replaceOpenings, setReplaceOpenings] = React.useState(false),
    [overwriteMeasured, setOverwriteMeasured] = React.useState(false),
    [reviewedRevision, setReviewedRevision] = React.useState(doc.scene.revision),
    [busy, setBusy] = React.useState(false),
    [applied, setApplied] = React.useState(false),
    applying = React.useRef(false);
  React.useEffect(() => {
    setScaleOpen(false);
    setAnchorPoints([]);
    setAnchorLength('');
    setWidth('');
    setDepth('');
    setHeight('');
    setOpeningKinds({});
    setReplaceOpenings(false);
    setOverwriteMeasured(false);
    setReviewedRevision(doc.scene.revision);
    setApplied(false);
    // A new proposal starts a fresh review; unrelated edits require explicit refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureId, proposalKey]);
  if (!capture) return <Body>This photograph is no longer in the room.</Body>;
  const estimated = proposal?.status === 'estimated' && proposal.source === 'model-estimated',
    stale = reviewedRevision !== doc.scene.revision,
    number = (value: string) => Number(value.trim().replace(',', '.')),
    anchorUsed = anchorPoints.length > 0 || !!anchorLength.trim(),
    lengthM = number(anchorLength),
    dimensionError = [width, depth, height].some(
      (value) => !!value.trim() && (!Number.isFinite(number(value)) || number(value) <= 0 || number(value) > 100),
    ) ? 'Enter positive measurements up to 100 m, or leave unknown values blank.' : null,
    anchorError = anchorUsed && (anchorPoints.length !== 2 || !Number.isFinite(lengthM) || lengthM <= 0 || lengthM > 100)
      ? 'Choose two floor points and enter their known distance in metres, or clear the scale anchor.' : null,
    options = {
      ...(anchorUsed && !anchorError ? {
        scaleAnchor: { pointsPx: anchorPoints as [PointXZ, PointXZ], lengthM },
      } : {}),
      ...(width.trim() ? { widthM: number(width) } : {}),
      ...(depth.trim() ? { depthM: number(depth) } : {}),
      ...(height.trim() ? { heightM: number(height) } : {}),
      selectedOpeningIds: Object.keys(openingKinds),
      openingKinds,
      replaceOpenings,
      overwriteMeasured,
      expectedRevision: reviewedRevision,
    },
    preview = estimated && !dimensionError && !anchorError && !stale && !applied
      ? applyRoomReconstruction(doc, captureId, options) : null,
    previewBounds = preview?.ok ? bounds(preview.value.scene) : null,
    applyWarnings = preview?.ok ? (preview.warnings ?? []).filter((warning) => !proposal?.warnings.includes(warning)) : [],
    measuredDimensions = doc.scene.boundarySource === 'user-measured' || [
      doc.scene.dimensionEvidence.width,
      doc.scene.dimensionEvidence.depth,
      doc.scene.height,
    ].some((value) => value && ['user-measured', 'product-specification'].includes(value.source)),
    projectedPoints = proposal?.imageToFloor && anchorPoints.length === 2
      ? anchorPoints.map((p) => mapFloorPoint(proposal.imageToFloor!, p)) : [],
    baseline = projectedPoints.length === 2 && projectedPoints[0] && projectedPoints[1]
      ? Math.hypot(projectedPoints[1][0] - projectedPoints[0][0], projectedPoints[1][1] - projectedPoints[0][1]) : null;
  const apply = async () => {
    if (applying.current || !preview?.ok || applied) return;
    applying.current = true;
    setBusy(true);
    try {
      const studio = useStudio.getState();
      await studio.flush();
      const latest = useStudio.getState().projects.find((p) => p.id === doc.id);
      if (!latest) throw new Error('This room is no longer available.');
      const result = applyRoomReconstruction(latest, captureId, options);
      if (!result.ok) throw new Error(result.message);
      if (await useStudio.getState().put(result.value)) {
        await useStudio.getState().flush();
        setReviewedRevision(result.value.scene.revision);
        setApplied(true);
        useStudio.getState().notify('Room draft applied. Check furniture fit and confirm any estimated dimensions.');
      }
    } catch (error) {
      useStudio.getState().notify(error instanceof Error ? error.message : 'The room draft could not be saved. Please retry.');
    } finally {
      applying.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 18 }}>
      <Panel>
        <Heading small>1. Review draft</Heading>
        <Body>
          {proposal?.source === 'placeholder'
            ? 'Legacy placeholder · no reconstructed room geometry'
            : estimated
              ? `Model estimated · ${proposal.confidence} confidence · ${proposal.partial ? 'partial visible floor' : 'visible room estimate'}`
              : proposal ? 'Insufficient evidence · no room draft to apply' : 'No room draft yet'}
        </Body>
        {proposal && <Body>Method: {proposal.method?.replaceAll('-', ' ') ?? 'legacy starting guide'}</Body>}
        {estimated ? (
          <>
            <Body>
              Estimated width {proposal.widthM?.toFixed(2) ?? 'unavailable'} m · depth {proposal.depthM?.toFixed(2) ?? 'unavailable'} m · height {proposal.heightM?.toFixed(2) ?? 'unavailable'} m
            </Body>
            <Body>
              This reconstructs the visible floor and supported wall boundaries. Hidden corners and surfaces remain unverified; a partial floor is not a complete room scan.
            </Body>
            {proposal.camera && (
              <Body>
                Camera: {proposal.camera.source === 'fov-assumption' ? 'lens estimated from an assumed field of view' : 'provided lens parameters'}. Depth and room size remain estimates until checked against a measurement.
              </Body>
            )}
          </>
        ) : (
          <>
            <Body>
              {proposal?.source === 'placeholder'
                ? 'Older saved corners were a manual starting guide. Build a new draft from the photo, or mark the floor yourself.'
                : 'Build a draft from the photo review screen. If analysis cannot identify a stable floor plane, take another photo with more floor and a wall junction visible, or mark the floor manually.'}
            </Body>
            {onRetake && <Button secondary title="Take another room photo" disabled={busy} onPress={onRetake} />}
            <Button secondary title="Mark floor manually" disabled={busy} onPress={() => setManualOpen(true)} />
          </>
        )}
        {proposal?.warnings.map((warning, i) => <Body key={i}>{warning}</Body>)}
        {estimated && (
          <>
            <FloorDraftPhoto
              capture={capture}
              anchorPoints={anchorPoints}
            />
            <FloorDraftPlan proposal={proposal} />
            <Body>Solid green edges: observed wall. Dashed amber edges: view limit, not a confirmed wall.</Body>
            {!!proposal.openings?.length && (
              <>
                <Heading small>Possible openings · review each one</Heading>
                <Body>Numbered boxes are unclassified candidates. Only candidates you label here are added.</Body>
                {proposal.openings.map((opening, i) => (
                  <View key={opening.id} style={{ gap: 8 }}>
                    <Body>
                      Candidate {i + 1} · wall {opening.wallIndex + 1} · estimated {opening.widthM.toFixed(2)} × {opening.heightM.toFixed(2)} m
                    </Body>
                    <View style={[styles.row, { justifyContent: 'flex-start', flexWrap: 'wrap' }]}>
                      {(['door', 'window'] as const).map((kind) => (
                        <Button key={kind} compact secondary={openingKinds[opening.id] !== kind}
                          title={kind === 'door' ? 'Use as door' : 'Use as window'} disabled={busy}
                          onPress={() => {
                            setOpeningKinds((previous) => ({ ...previous, [opening.id]: kind }));
                            setApplied(false);
                          }} />
                      ))}
                      <Button compact secondary title="Skip" disabled={busy} onPress={() => {
                        setOpeningKinds((previous) => {
                          const next = { ...previous };
                          delete next[opening.id];
                          return next;
                        });
                        setApplied(false);
                      }} />
                    </View>
                  </View>
                ))}
              </>
            )}
            {doc.scene.openings.length > 0 && (
              <View style={styles.row}>
                <View style={{ flex: 1 }}><Body>Replace existing doors and windows with reviewed choices. Removes them if no candidates are selected; you can add openings in Room details.</Body></View>
                <Switch value={replaceOpenings} disabled={busy} trackColor={{ true: palette.brand }}
                  onValueChange={(value) => { setReplaceOpenings(value); setApplied(false); }} />
              </View>
            )}
          </>
        )}
      </Panel>
      {estimated && (
        <>
          <Panel>
            <Heading small>2. Set scale, optional</Heading>
            <Body>Leave unknown measurements blank. Existing measured dimensions are kept by default.</Body>
            <Button secondary title={scaleOpen ? 'Hide scale anchor controls' : 'Choose two floor points for scale'}
              disabled={busy || !proposal.imageToFloor} onPress={() => setScaleOpen(!scaleOpen)} />
            {!proposal.imageToFloor && <Body>This draft has no usable photo-to-floor mapping. Enter a measured room dimension below instead.</Body>}
            {scaleOpen && (
              <>
                <Body>Tap the two ends of a known distance on the visible floor below. A third tap starts a new pair. Use floor points, not furniture or wall surfaces.</Body>
                <FloorDraftPhoto capture={capture} anchorPoints={anchorPoints}
                  onPoint={busy ? undefined : (p) => {
                    setAnchorPoints((points) => points.length === 2 ? [p] : [...points, p]);
                    setApplied(false);
                  }} />
                <Body>{anchorPoints.length} of 2 floor points selected{baseline !== null && Number.isFinite(baseline) ? ` · draft baseline ${baseline.toFixed(2)} m` : ''}</Body>
                <Field label="Known distance between markers (m)" value={anchorLength} keyboardType="decimal-pad"
                  editable={!busy} onChangeText={(value) => { setAnchorLength(value); setApplied(false); }} />
                <Button compact secondary title="Clear scale anchor" disabled={busy} onPress={() => {
                  setAnchorPoints([]); setAnchorLength(''); setApplied(false);
                }} />
                <Body>A known distance calibrates the estimate; it does not verify unseen boundaries or ceiling height.</Body>
              </>
            )}
            <View style={styles.row}>
              <Field label="Measured width (m), optional" value={width} keyboardType="decimal-pad" editable={!busy}
                onChangeText={(value) => { setWidth(value); setApplied(false); }} />
              <Field label="Measured depth (m), optional" value={depth} keyboardType="decimal-pad" editable={!busy}
                onChangeText={(value) => { setDepth(value); setApplied(false); }} />
            </View>
            <Field label="Measured height (m), optional" value={height} keyboardType="decimal-pad" editable={!busy}
              onChangeText={(value) => { setHeight(value); setApplied(false); }} />
            {measuredDimensions && (
              <>
                <Body>Current width: {doc.scene.dimensionEvidence.width?.source.replaceAll('-', ' ') ?? 'boundary estimate'} · depth: {doc.scene.dimensionEvidence.depth?.source.replaceAll('-', ' ') ?? 'boundary estimate'} · height: {doc.scene.height.source.replaceAll('-', ' ')}</Body>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}><Body>Allow this draft to replace existing measured dimensions</Body></View>
                  <Switch value={overwriteMeasured} disabled={busy} trackColor={{ true: palette.brand }}
                    onValueChange={(value) => { setOverwriteMeasured(value); setApplied(false); }} />
                </View>
              </>
            )}
            {dimensionError && <Body>{dimensionError}</Body>}
            {anchorError && <Body>{anchorError}</Body>}
          </Panel>
          <Panel>
            <Heading small>3. Apply</Heading>
            {preview?.ok && previewBounds && (
              <Body>
                Room after applying: {previewBounds.width.toFixed(2)} × {previewBounds.depth.toFixed(2)} × {preview.value.scene.height.meters.toFixed(2)} m. Width: {preview.value.scene.dimensionEvidence.width?.source.replaceAll('-', ' ') ?? 'boundary estimate'} · depth: {preview.value.scene.dimensionEvidence.depth?.source.replaceAll('-', ' ') ?? 'boundary estimate'} · height: {preview.value.scene.height.source.replaceAll('-', ' ')}.
              </Body>
            )}
            <Body>Furniture keeps its current size and position. Check any pieces outside the new floor or above the ceiling after applying. Existing doors and windows are kept unless you explicitly choose replacement.</Body>
            {applyWarnings.slice(0, 4).map((warning, i) => <Body key={i}>{warning}</Body>)}
            {applyWarnings.length > 4 && <Body>{applyWarnings.length - 4} more review notes. Check room feedback after applying.</Body>}
            {preview && !preview.ok && <Body>{preview.message}</Body>}
            {applied && <Body>This draft is saved in your room. Review room feedback before arranging furniture.</Body>}
            {stale && (
              <>
                <Body>The room changed during this review. Refresh the preview and check the dimensions before applying.</Body>
                <Button secondary title="Refresh draft review" disabled={busy} onPress={() => {
                  setReviewedRevision(doc.scene.revision); setApplied(false);
                }} />
              </>
            )}
            <Button title={busy ? 'Saving room draft…' : applied ? 'Room draft applied' : 'Use this room draft'}
              disabled={busy || applied || stale || !preview?.ok} onPress={() => { void apply(); }} />
          </Panel>
        </>
      )}
      <Panel>
        <Button secondary title={manualOpen ? 'Hide manual floor reference' : 'Mark floor manually'}
          disabled={busy} onPress={() => setManualOpen(!manualOpen)} />
        {manualOpen && <ManualFloorReview key={captureId} document={doc} captureId={captureId}
          operationLock={applying} onBusyChange={setBusy} disabled={busy} />}
      </Panel>
    </View>
  );
}

function FloorDraftPlan({ proposal }: { proposal: RoomReconstructionProposal }) {
  const floor = proposal.floorPolygonXZ;
  if (!floor?.length) return null;
  const minX = Math.min(...floor.map((p) => p[0])), minZ = Math.min(...floor.map((p) => p[1])),
    width = Math.max(...floor.map((p) => p[0])) - minX,
    depth = Math.max(...floor.map((p) => p[1])) - minZ;
  return <Svg width="100%" height={180} viewBox={`${minX - .15} ${minZ - .15} ${width + .3} ${depth + .3}`}
    accessible accessibilityLabel="Draft floor plan. Solid green edges are observed walls; dashed amber edges are view limits.">
    <Polygon points={floor.map((p) => p.join(',')).join(' ')} fill={palette.brand} fillOpacity={.12} />
    {floor.map(([x, z], i) => {
      const end = floor[(i + 1) % floor.length], observed = proposal.boundaryEdges?.[i] === 'observed-wall';
      return <Line key={i} x1={x} y1={z} x2={end[0]} y2={end[1]} stroke={observed ? palette.brand : palette.warning}
        strokeWidth={.035} strokeDasharray={observed ? undefined : '.12 .08'} />;
    })}
  </Svg>;
}

function FloorDraftPhoto({ capture, anchorPoints, onPoint }: {
  capture: Capture;
  anchorPoints: PointXZ[];
  onPoint?: (point: PointXZ) => void;
}) {
  const size = React.useRef({ width: 1, height: 1 }),
    proposal = capture.roomProposal!,
    corners = proposal.floorCornersPx;
  return (
    <Pressable accessibilityRole={onPoint ? 'button' : 'image'}
      accessibilityLabel={onPoint ? 'Photo: tap two floor points to set scale' : 'Room reconstruction over the source photograph'}
      onLayout={(event) => { size.current = event.nativeEvent.layout; }}
      onPress={onPoint ? (event) => onPoint([
        Math.max(0, Math.min(capture.width, event.nativeEvent.locationX / size.current.width * capture.width)),
        Math.max(0, Math.min(capture.height, event.nativeEvent.locationY / size.current.height * capture.height)),
      ]) : undefined}
      style={{ aspectRatio: capture.width / capture.height, width: '100%', overflow: 'hidden', borderRadius: 12 }}>
      <MediaImage assetId={capture.originalAssetId} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      <Svg pointerEvents="none" style={{ position: 'absolute', inset: 0 }} width="100%" height="100%"
        viewBox={`0 0 ${capture.width} ${capture.height}`}>
        {corners.length >= 3 && <Polygon points={corners.map((point) => point.join(',')).join(' ')}
          fill={palette.brand} fillOpacity={0.2} />}
        {corners.map(([x, y], i) => {
          const end = corners[(i + 1) % corners.length],
            observed = proposal.boundaryEdges?.[i] === 'observed-wall';
          return <Line key={i} x1={x} y1={y} x2={end[0]} y2={end[1]}
            stroke={observed ? palette.brand : palette.warning} strokeWidth={capture.width * 0.006}
            strokeDasharray={observed ? undefined : `${capture.width * 0.02} ${capture.width * 0.012}`} />;
        })}
        {proposal.openings?.map((opening, i) => <React.Fragment key={opening.id}>
          <Rect x={opening.boxPx[0]} y={opening.boxPx[1]} width={opening.boxPx[2]} height={opening.boxPx[3]}
            fill="none" stroke={palette.warning} strokeWidth={capture.width * 0.004} />
          <SvgText x={opening.boxPx[0]} y={opening.boxPx[1] + capture.width * 0.035}
            fontSize={capture.width * 0.035} fill={palette.warning} stroke="white" strokeWidth={0.5}>{i + 1}</SvgText>
        </React.Fragment>)}
        {anchorPoints.length === 2 && <Line x1={anchorPoints[0][0]} y1={anchorPoints[0][1]}
          x2={anchorPoints[1][0]} y2={anchorPoints[1][1]} stroke="white" strokeWidth={capture.width * 0.006} />}
        {anchorPoints.map(([x, y], i) => <React.Fragment key={i}>
          <Circle cx={x} cy={y} r={capture.width * 0.022} fill={palette.brand} stroke="white" strokeWidth={capture.width * 0.004} />
          <SvgText x={x} y={y + capture.width * 0.01} textAnchor="middle" fontSize={capture.width * 0.025} fill="white">{i + 1}</SvgText>
        </React.Fragment>)}
      </Svg>
    </Pressable>
  );
}

function ManualFloorReview({
  document: doc,
  captureId,
  operationLock,
  onBusyChange,
  disabled,
}: {
  document: ProjectDocument;
  captureId: string;
  operationLock: React.MutableRefObject<boolean>;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}) {
  const capture = doc.scene.captures.find((c) => c.id === captureId)!;
  const fallback: PointXZ[] = [
      [capture.width * 0.15, capture.height * 0.55],
      [capture.width * 0.85, capture.height * 0.55],
      [capture.width * 0.98, capture.height * 0.98],
      [capture.width * 0.02, capture.height * 0.98],
    ],
    initial =
      capture.floorReview?.cornersPx ?? fallback;
  const [corners, setCorners] = React.useState<PointXZ[]>(
      initial.length === 4 ? initial : fallback,
    ),
    [width, setWidth] = React.useState(''),
    [depth, setDepth] = React.useState(''),
    [busy, setBusy] = React.useState(false),
    [reviewedRevision, setReviewedRevision] = React.useState(doc.scene.revision),
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
  const save = async () => {
    if (operationLock.current) return;
    operationLock.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      await useStudio.getState().flush();
      const latest = useStudio.getState().projects.find((p) => p.id === doc.id);
      if (!latest?.scene.captures.some((c) => c.id === captureId))
        throw new Error('This photograph is no longer in the room.');
      if (latest.scene.revision !== reviewedRevision)
        throw new Error('The room changed during manual review. Refresh this reference before saving.');
      const scene = latest.scene,
        currentBounds = bounds(scene),
        w = width.trim() ? Number(width.trim().replace(',', '.')) : currentBounds.width,
        d = depth.trim() ? Number(depth.trim().replace(',', '.')) : currentBounds.depth,
        result = floorHomography(corners, w, d);
      if (!result.ok) throw new Error(result.message);
      if (w > 100 || d > 100) throw new Error('Room measurements must be at most 100 m.');
      if (scene.floorPolygonXZ.length !== 4)
        throw new Error('Keep the custom floor outline, or use numeric boundary editing for this non-rectangular room.');
      const revision = scene.revision + 1,
        next = {
          ...latest,
          updatedAt: new Date().toISOString(),
          scene: {
            ...scene,
            revision,
            dimensionEvidence: {
              ...scene.dimensionEvidence,
              ...(width.trim() ? { width: evidence(w, 'user-measured', true, [captureId]) } : {}),
              ...(depth.trim() ? { depth: evidence(d, 'user-measured', true, [captureId]) } : {}),
            },
            floorPolygonXZ: [
              [0, 0], [w, 0], [w, d], [0, d],
            ] as PointXZ[],
            captures: scene.captures.map((c) => c.id === captureId ? {
              ...c,
              floorReview: {
                cornersPx: corners,
                widthM: width.trim() ? w : undefined,
                depthM: depth.trim() ? d : undefined,
                reviewed: true,
                homography: result.value,
              },
            } : c),
          },
        };
      if (await useStudio.getState().put(next)) {
        await useStudio.getState().flush();
        setReviewedRevision(revision);
        useStudio.getState().notify('Manual floor reference saved. Only entered measurements are marked as measured.');
      }
    } catch (error) {
      useStudio.getState().notify(error instanceof Error ? error.message : 'The manual floor reference could not be saved. Please retry.');
    } finally {
      operationLock.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <Panel>
      <Heading small>Manual floor reference</Heading>
      <Body>
        These handles are a manual starting guide, not detected room corners.
        Drag them around the visible floor in order. Hidden corners remain
        approximate. This does not measure unseen room dimensions.
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
        {...(disabled ? {} : responder.panHandlers)}
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
          editable={!disabled}
          onChangeText={setWidth}
          keyboardType="decimal-pad"
        />
        <Field
          label="Measured depth (m), optional"
          value={depth}
          editable={!disabled}
          onChangeText={setDepth}
          keyboardType="decimal-pad"
        />
      </View>
      <Body>
        Leave an unknown value blank to keep its current dimension and source.
        Furniture stays at its current size and position.
      </Body>
      {reviewedRevision !== doc.scene.revision && (
        <>
          <Body>The room changed during this review. Refresh and check the reference before saving.</Body>
          <Button secondary title="Refresh manual reference" disabled={disabled}
            onPress={() => setReviewedRevision(doc.scene.revision)} />
        </>
      )}
      <Button title={busy ? 'Saving manual reference…' : 'Save reviewed floor reference'}
        disabled={disabled || reviewedRevision !== doc.scene.revision} onPress={() => { void save(); }} />
    </Panel>
  );
}
