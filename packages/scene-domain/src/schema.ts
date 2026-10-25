import { z } from 'zod';

export const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
export const finite = z.number().finite();
export const dimensionSources = [
  'user-measured',
  'product-specification',
  'sensor-estimated',
  'calibrated-estimate',
  'model-estimated',
  'category-prior',
  'placeholder',
] as const;
export const dimensionSchema = z.object({
  meters: finite.positive().max(100),
  source: z.enum(dimensionSources),
  reviewed: z.boolean(),
  evidenceIds: z.array(id).max(100).default([]),
  proposalId: id.optional(),
});
export const color = z.string().regex(/^#[a-f0-9]{6}$/i);
export const point = z
  .tuple([finite, finite])
  .transform(([x, z]): [number, number] => [x, z]);
export const brushStrokeSchema = z.object({
  tool: z.enum(['paint', 'erase']),
  radius: finite.min(1).max(500),
  points: z.array(point).min(1).max(3000),
});
export const maskSchema = z.object({
  revision: z.number().int().nonnegative(),
  artifactId: id.optional(),
  polygons: z.array(z.array(point).min(3).max(1000)).max(100).default([]),
  strokes: z.array(brushStrokeSchema).max(300).default([]),
  expansionPx: z.number().int().min(0).max(100).default(0),
});
export const observationSchema = z.object({
  id,
  captureImageId: id,
  originalLabel: z.string().min(1).max(100),
  category: z.enum([
    'sofa',
    'chair',
    'bed',
    'table',
    'cabinet',
    'plant',
    'rug',
    'custom',
  ]),
  score: finite.min(0).max(1).optional(),
  modelVersion: z.string().max(200).optional(),
  source: z.enum(['model', 'manual']),
  coordinateSpace: z.literal('oriented-source-image'),
  boxPx: z.tuple([
    finite.nonnegative(),
    finite.nonnegative(),
    finite.positive(),
    finite.positive(),
  ]),
  mask: maskSchema,
  rawMaskAssetId: id.optional(),
  label: z.string().trim().min(1).max(100).optional(),
  thumbnailAssetId: id.optional(),
  color: color.optional(),
  ignored: z.boolean().default(false),
  fixed: z.boolean().default(false),
  reviewed: z.boolean().default(false),
});
export const captureSchema = z
  .object({
    id,
    originalAssetId: id,
    analysisAssetId: id.optional(),
    name: z.string().min(1).max(180),
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
    createdAt: z.string().datetime(),
    contentHash: z.string().max(128).optional(),
    qualityWarnings: z.array(z.string().max(200)).max(20).default([]),
    mapping: z
      .object({
        scaleX: finite.positive(),
        scaleY: finite.positive(),
        offsetX: finite,
        offsetY: finite,
      })
      .default({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }),
    floorReview: z
      .object({
        cornersPx: z.array(point).length(4),
        widthM: finite.positive().max(100).optional(),
        depthM: finite.positive().max(100).optional(),
        reviewed: z.boolean(),
        homography: z.array(finite).length(9),
      })
      .optional(),
    roomProposal: z
      .object({
        floorCornersPx: z.array(point).max(4),
        source: z.enum(['model-estimated', 'placeholder']),
        warnings: z.array(z.string().max(500)).max(20),
      })
      .optional(),
    processingAssets: z
      .array(
        z.object({
          assetId: id,
          rawMaskAssetId: id.optional(),
          label: z.string().max(100),
          kind: z.enum(['depth', 'processing']),
        }),
      )
      .max(30)
      .optional(),
    processingEvidence: z
      .object({
        models: z.record(z.string().max(300)),
        timingsMs: z.record(finite.nonnegative()),
      })
      .optional(),
    previewAssetId: id.optional(),
    status: z
      .enum(['idle', 'queued', 'running', 'review', 'complete', 'failed'])
      .default('idle'),
    jobId: id.optional(),
    error: z.string().max(500).optional(),
  })
  .refine(
    (c) => c.width * c.height <= 20_000_000,
    'Image exceeds 20 megapixels',
  );
export const physicalItemSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  category: observationSchema.shape.category,
  observationIds: z.array(id).max(100),
  width: dimensionSchema,
  depth: dimensionSchema,
  height: dimensionSchema,
  representation: z.enum(['procedural', 'custom-box', 'approved-model']),
  color,
  movable: z.boolean(),
  assetKey: id.optional(),
});
export const placementSchema = z.object({
  physicalItemId: id,
  floorCenterXM: finite.min(-100).max(100),
  floorCenterZM: finite.min(-100).max(100),
  yawRad: finite.min(-Math.PI * 2).max(Math.PI * 2),
  locked: z.boolean(),
});
export const openingSchema = z.object({
  id,
  kind: z.enum(['door', 'window']),
  wallIndex: z.number().int().min(0).max(63),
  offsetM: finite.nonnegative(),
  widthM: finite.min(0.1).max(10),
  heightM: finite.min(0.1).max(12),
  sillHeightM: finite.nonnegative().max(12),
  source: z.enum(dimensionSources),
  doorSwing: z.enum(['inward-start', 'inward-end', 'outward']).optional(),
});
const layoutSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  placements: z.array(placementSchema).max(200),
  createdAt: z.string().datetime(),
});
export const roomSceneSchema = z
  .object({
    schemaVersion: z.literal(2),
    revision: z.number().int().nonnegative(),
    units: z.literal('meters'),
    floorPolygonXZ: z.array(point).min(3).max(64),
    height: dimensionSchema,
    boundarySource: z.enum(dimensionSources),
    dimensionEvidence: z.record(dimensionSchema),
    openings: z.array(openingSchema).max(40),
    wallColor: color,
    floorColor: color,
    items: z.array(physicalItemSchema).max(200),
    observations: z.array(observationSchema).max(1500),
    captures: z.array(captureSchema).max(30),
    layouts: z.array(layoutSchema).min(1).max(30),
    activeLayoutId: id,
  })
  .superRefine((s, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    for (const [label, values] of Object.entries({
      items: s.items,
      observations: s.observations,
      captures: s.captures,
      layouts: s.layouts,
      openings: s.openings,
    }))
      if (new Set(values.map((v) => v.id)).size !== values.length)
        issue(`Duplicate ${label} IDs`);
    if (!s.layouts.some((l) => l.id === s.activeLayoutId))
      issue('Active layout is missing');
    const obs = new Map(s.observations.map((o) => [o.id, o]));
    const captures = new Map(s.captures.map((c) => [c.id, c]));
    const items = new Map(s.items.map((i) => [i.id, i]));
    for (const o of s.observations) {
      const c = captures.get(o.captureImageId);
      if (!c) {
        issue('Observation refers to a missing capture');
        continue;
      }
      if (
        o.boxPx[0] + o.boxPx[2] > c.width + 1 ||
        o.boxPx[1] + o.boxPx[3] > c.height + 1
      )
        issue('Observation box extends outside the capture');
      for (const p of [
        ...o.mask.polygons.flat(),
        ...o.mask.strokes.flatMap((stroke) => stroke.points),
      ])
        if (p[0] < 0 || p[1] < 0 || p[0] > c.width || p[1] > c.height)
          issue('Mask coordinates extend outside the capture');
    }
    const linked = new Set<string>();
    for (const i of s.items)
      for (const oid of i.observationIds) {
        if (!obs.has(oid)) issue('Furniture refers to a missing observation');
        if (linked.has(oid))
          issue('An observation belongs to more than one physical item');
        linked.add(oid);
      }
    for (const l of s.layouts) {
      const ids = l.placements.map((p) => p.physicalItemId);
      if (new Set(ids).size !== ids.length)
        issue('An item appears twice in a layout');
      for (const p of l.placements)
        if (!items.has(p.physicalItemId))
          issue('Placement refers to missing furniture');
    }
    for (const item of s.items.filter((i) => !i.movable)) {
      const poses = s.layouts.map((l) =>
        l.placements.find((p) => p.physicalItemId === item.id),
      );
      if (
        poses.some((p) => !p || !p.locked) ||
        poses.some((p) => p && JSON.stringify(p) !== JSON.stringify(poses[0]))
      )
        issue(
          'Fixed furniture must retain the same locked placement in every layout',
        );
    }
    const floor = s.floorPolygonXZ;
    const orient = (a: number[], b: number[], c: number[]) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    let area = 0;
    for (let i = 0; i < floor.length; i++) {
      const a = floor[i],
        b = floor[(i + 1) % floor.length];
      area += a[0] * b[1] - b[0] * a[1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01)
        issue('Room boundary contains a zero-length edge');
      if (Math.abs(a[0]) > 100 || Math.abs(a[1]) > 100)
        issue('Room boundary is too large');
      for (let j = i + 1; j < floor.length; j++) {
        if (j === i + 1 || (i === 0 && j === floor.length - 1)) continue;
        const c = floor[j],
          d = floor[(j + 1) % floor.length];
        if (
          orient(a, b, c) * orient(a, b, d) < -1e-9 &&
          orient(c, d, a) * orient(c, d, b) < -1e-9
        )
          issue('Room boundary intersects itself');
      }
    }
    if (new Set(floor.map((p) => p.join(','))).size !== floor.length)
      issue('Room boundary repeats a corner');
    for (let i = 0; i < s.openings.length; i++)
      for (let j = i + 1; j < s.openings.length; j++) {
        const a = s.openings[i],
          b = s.openings[j];
        if (
          a.wallIndex === b.wallIndex &&
          Math.min(a.offsetM + a.widthM, b.offsetM + b.widthM) >
            Math.max(a.offsetM, b.offsetM) + 1e-6 &&
          Math.min(a.sillHeightM + a.heightM, b.sillHeightM + b.heightM) >
            Math.max(a.sillHeightM, b.sillHeightM) + 1e-6
        )
          issue('Openings overlap on the same wall');
      }
    if (Math.abs(area) / 2 < 1)
      issue('Room floor must cover at least one square meter');
    for (const o of s.openings) {
      const a = floor[o.wallIndex],
        b = floor[(o.wallIndex + 1) % floor.length];
      if (
        !a ||
        !b ||
        o.offsetM + o.widthM > Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-6 ||
        o.heightM + o.sillHeightM > s.height.meters + 1e-6
      )
        issue('Opening extends beyond its wall');
    }
  });
export const projectDocumentSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  favorite: z.boolean().default(false),
  sample: z.boolean().default(false),
  scene: roomSceneSchema,
});
export type Dimension = z.infer<typeof dimensionSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type Capture = z.infer<typeof captureSchema>;
export type PhysicalItem = z.infer<typeof physicalItemSchema>;
export type Placement = z.infer<typeof placementSchema>;
export type Opening = z.infer<typeof openingSchema>;
export type RoomScene = z.infer<typeof roomSceneSchema>;
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;
export type MaskEdit = z.infer<typeof maskSchema>;
export type PointXZ = [number, number];
