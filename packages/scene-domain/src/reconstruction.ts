import { mapFloorPoint } from './calibration';
import { bounds, clone, evidence, type Outcome } from './scene';
import { projectDocumentSchema, roomReconstructionProposalSchema, type Dimension, type Opening, type PointXZ, type ProjectDocument } from './schema';
import { placementWarnings, pointInPolygon } from './spatial';

export interface ApplyRoomReconstructionOptions {
  scaleAnchor?: { pointsPx: [PointXZ, PointXZ]; lengthM: number };
  /** Explicit tape/laser measurements. An estimate scaled by an anchor is not a measurement. */
  widthM?: number;
  depthM?: number;
  heightM?: number;
  selectedOpeningIds?: string[];
  openingKinds?: Record<string, 'door' | 'window'>;
  replaceOpenings?: boolean;
  /** Callers must obtain the user's explicit choice before replacing measurements. */
  overwriteMeasured?: boolean;
  expectedRevision?: number;
}

/** Applies only an explicitly reviewed proposal. It never resizes or moves furniture. */
export function applyRoomReconstruction(
  document: ProjectDocument,
  captureId: string,
  options: ApplyRoomReconstructionOptions = {},
): Outcome<ProjectDocument> {
  const failure = (message: string): Outcome<ProjectDocument> => ({ ok: false, message });
  if (options.expectedRevision !== undefined && options.expectedRevision !== document.scene.revision)
    return failure('The room changed during review. Review the latest room before applying this estimate.');
  const capture = document.scene.captures.find((c) => c.id === captureId);
  if (!capture) return failure('This photograph is no longer in the room.');
  const parsed = roomReconstructionProposalSchema.safeParse(capture.roomProposal);
  if (!parsed.success || parsed.data.status !== 'estimated' || parsed.data.source !== 'model-estimated')
    return failure('This photograph has no usable room estimate. Analyze another view or enter measured dimensions.');
  const proposal = parsed.data;
  for (const [name, value] of Object.entries({ width: options.widthM, depth: options.depthM, height: options.heightM }))
    if (value !== undefined && (!Number.isFinite(value) || value <= 0 || value > 100))
      return failure(`Enter a finite, positive ${name} in meters (at most 100).`);
  const rawFloor: PointXZ[] = proposal.floorPolygonXZ ?? [
    [0, 0], [proposal.widthM!, 0], [proposal.widthM!, proposal.depthM!], [0, proposal.depthM!],
  ];
  const proposedBounds = bounds({ floorPolygonXZ: rawFloor });
  if (![proposedBounds.width, proposedBounds.depth].every((n) => Number.isFinite(n) && n > 1e-6))
    return failure('The estimated floor has no usable area. Analyze another view or enter measured dimensions.');
  let scale = 1;
  if (options.scaleAnchor) {
    const { pointsPx, lengthM } = options.scaleAnchor;
    if (!Number.isFinite(lengthM) || lengthM <= 0 || lengthM > 100 ||
      !Array.isArray(pointsPx) || pointsPx.length !== 2 ||
      !pointsPx.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) &&
        p[0] >= 0 && p[1] >= 0 && p[0] <= capture.width && p[1] <= capture.height))
      return failure('Choose two floor points inside the source photograph and enter their positive measured distance.');
    if (!proposal.imageToFloor)
      return failure('This estimate has no image-to-floor mapping. Enter room dimensions directly or analyze another view.');
    const a = mapFloorPoint(proposal.imageToFloor, pointsPx[0]),
      b = mapFloorPoint(proposal.imageToFloor, pointsPx[1]);
    if (!a || !b || !pointInPolygon(a, rawFloor) || !pointInPolygon(b, rawFloor))
      return failure('Both reference points must lie on the estimated visible floor. Choose points closer to its center.');
    const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (!Number.isFinite(distance) || distance < 1e-6)
      return failure('The reference points are too close together. Choose two distinct floor points.');
    scale = lengthM / distance;
    if (!Number.isFinite(scale) || scale <= 0)
      return failure('The floor reference could not calibrate this estimate. Choose another pair of floor points.');
  }
  const next = clone(document), scene = next.scene, currentBounds = bounds(scene),
    source: Dimension['source'] = options.scaleAnchor ? 'calibrated-estimate' : 'model-estimated',
    warnings = [...proposal.warnings],
    preserveBoundary = ['user-measured', 'product-specification'].includes(scene.boundarySource) && !options.overwriteMeasured;
  const chooseDimension = (name: 'width' | 'depth' | 'height', proposed: number | undefined, explicit: number | undefined): Dimension | undefined => {
    const current = name === 'height' ? scene.height : scene.dimensionEvidence[name];
    const currentMeters = name === 'height' ? scene.height.meters : currentBounds[name];
    const protectedMeasurement = !options.overwriteMeasured &&
      ((current && ['user-measured', 'product-specification'].includes(current.source)) || (name !== 'height' && preserveBoundary));
    if (protectedMeasurement) {
      if (explicit !== undefined && Math.abs(explicit - currentMeters) > 1e-6)
        throw new Error(`The ${name} is already measured. Confirm replacing measured dimensions before changing it.`);
      warnings.push(`Existing measured ${name} was preserved.`);
      return current && ['user-measured', 'product-specification'].includes(current.source)
        ? current : evidence(currentMeters, scene.boundarySource, true, [captureId]);
    }
    if (explicit !== undefined) return evidence(explicit, 'user-measured', true, [captureId]);
    return proposed === undefined ? current : evidence(proposed * scale, source, true, [captureId]);
  };
  try {
    const width = chooseDimension('width', proposedBounds.width, options.widthM)!,
      depth = chooseDimension('depth', proposedBounds.depth, options.depthM)!,
      height = chooseDimension('height', proposal.heightM, options.heightM),
      sx = width.meters / proposedBounds.width,
      sz = depth.meters / proposedBounds.depth;
    if (!preserveBoundary) {
      scene.floorPolygonXZ = rawFloor.map(([x, z]) => [x * sx, z * sz]);
      scene.boundarySource = source;
    }
    scene.dimensionEvidence = { ...scene.dimensionEvidence, width, depth };
    if (height) scene.height = height;
    const selected = options.selectedOpeningIds ?? [];
    if (!Array.isArray(selected) || new Set(selected).size !== selected.length)
      return failure('Review each opening candidate once before applying it.');
    if (options.replaceOpenings) scene.openings = [];
    for (const candidateId of selected) {
      const candidate = proposal.openings?.find((o) => o.id === candidateId),
        kind = options.openingKinds?.[candidateId];
      if (!candidate) return failure('An opening candidate is no longer available. Review the latest estimate.');
      if (kind !== 'door' && kind !== 'window')
        return failure('Label each selected opening as a door or window before applying it.');
      const rawA = rawFloor[candidate.wallIndex], rawB = rawFloor[(candidate.wallIndex + 1) % rawFloor.length],
        a = scene.floorPolygonXZ[candidate.wallIndex], b = scene.floorPolygonXZ[(candidate.wallIndex + 1) % scene.floorPolygonXZ.length];
      if (!rawA || !rawB || !a || !b || preserveBoundary)
        return failure('This opening cannot be attached to the preserved room boundary. Review the room boundary and add it manually.');
      const edgeScale = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.hypot(rawB[0] - rawA[0], rawB[1] - rawA[1]),
        opening: Opening = {
          id: `reconstruction-${captureId}-${candidate.id}`.slice(0, 128), kind,
          wallIndex: candidate.wallIndex, offsetM: candidate.offsetM * edgeScale,
          widthM: candidate.widthM * edgeScale, heightM: candidate.heightM * scale,
          sillHeightM: kind === 'door' ? 0 : candidate.sillHeightM * scale,
          source, hingeSide: 'start', swingDirection: 'inward', openAngleDeg: 0,
        };
      if (scene.openings.some((o) => o.id === opening.id))
        return failure('This opening was already added. Keep the existing opening, or explicitly replace openings before applying it again.');
      scene.openings.push(opening);
    }
    for (const opening of scene.openings) {
      const a = scene.floorPolygonXZ[opening.wallIndex],
        b = scene.floorPolygonXZ[(opening.wallIndex + 1) % scene.floorPolygonXZ.length];
      if (!a || !b || opening.offsetM + opening.widthM > Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-6 ||
        opening.heightM + opening.sillHeightM > scene.height.meters + 1e-6)
        return failure('An existing or selected opening would extend beyond the resized room. Keep the current room size, adjust the opening, or explicitly replace openings.');
    }
    const reviewedCapture = scene.captures.find((c) => c.id === captureId)!;
    if (!preserveBoundary && proposal.imageToFloor && proposal.floorCornersPx.length === 4) {
      reviewedCapture.floorReview = {
        cornersPx: clone(proposal.floorCornersPx), reviewed: true,
        ...(options.widthM === undefined ? {} : { widthM: width.meters }),
        ...(options.depthM === undefined ? {} : { depthM: depth.meters }),
        homography: proposal.imageToFloor.map((v, i) => i < 3 ? v * sx : i < 6 ? v * sz : v),
      };
    }
    scene.revision += 1;
    next.updatedAt = new Date().toISOString();
    const valid = projectDocumentSchema.safeParse(next);
    if (!valid.success)
      return failure(`The room estimate could not be applied: ${valid.error.issues[0]?.message ?? 'invalid geometry'}. Review the outline and dimensions.`);
    // Report conflicts while preserving every item and every saved placement.
    for (const layout of scene.layouts) {
      const layoutScene = { ...scene, activeLayoutId: layout.id };
      for (const placement of layout.placements) {
        const item = scene.items.find((i) => i.id === placement.physicalItemId)!;
        warnings.push(...placementWarnings(layoutScene, placement).map((message) => `${item.name}: ${message}`));
      }
    }
    return { ok: true, value: valid.data, warnings: [...new Set(warnings)] };
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Review the room estimate before applying it.');
  }
}
