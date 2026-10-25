import {
  id,
  maskSchema,
  observationSchema,
  projectDocumentSchema,
  roomSceneSchema,
} from '@auraspace/scene-domain';
import { z } from 'zod';
export {
  maskSchema,
  observationSchema,
  projectDocumentSchema,
  roomSceneSchema,
};
export const jobStage = z.enum([
  'validation',
  'furniture-observations',
  'room-draft',
  'removal',
  'image-processing',
  'complete',
]);
export const jobStatus = z.enum([
  'queued',
  'running',
  'review',
  'complete',
  'failed',
  'cancelled',
]);
export const createJobSchema = z
  .object({
    kind: z.enum(['analyze', 'inpaint', 'process']),
    captureImageIds: z.array(id).min(1).max(30),
    inputRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(128),
    maskRevisions: z.record(z.number().int().nonnegative()).optional(),
    observationIds: z.array(id).max(100).optional(),
    operation: z
      .enum([
        'grayscale',
        'contrast',
        'edges',
        'clahe',
        'contours',
        'histogram',
      ])
      .optional(),
    includeDepth: z.boolean().default(false),
  })
  .refine(
    (v) => v.kind !== 'process' || !!v.operation,
    'Choose an image-processing operation',
  );
export const uploadSchema = z
  .object({
    captureImageId: id,
    name: z.string().min(1).max(180),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    byteLength: z.number().int().positive().max(12_000_000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
  })
  .refine(
    (v) => v.width * v.height <= 20_000_000,
    'Image is larger than 20 megapixels',
  );
export const sceneWriteSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  scene: roomSceneSchema,
});
export const jobResponseSchema = z.object({
  id,
  projectId: id,
  kind: z.enum(['analyze', 'inpaint', 'process']),
  inputRevision: z.number().int().nonnegative(),
  status: jobStatus,
  stage: jobStage,
  attempt: z.number().int().nonnegative(),
  completedStages: z.array(jobStage),
  error: z.string().nullable(),
  result: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CreateJob = z.infer<typeof createJobSchema>;
export type JobRecord = z.infer<typeof jobResponseSchema>;
export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        retryable: boolean;
        requestId?: string;
        details?: unknown;
      };
    };
export type MediaManifestEntry = {
  id: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  label?: string;
  kind:
    | 'source'
    | 'thumbnail'
    | 'mask'
    | 'preview'
    | 'depth'
    | 'processing'
    | 'export';
};
export interface AnalysisProposal {
  captureImageId: string;
  inputRevision: number;
  observations: z.infer<typeof observationSchema>[];
  roomEstimate?: {
    floorCornersPx: Array<[number, number]>;
    widthM?: number;
    depthM?: number;
    heightM?: number;
    source: 'model-estimated' | 'placeholder';
    warnings: string[];
  };
  artifacts: MediaManifestEntry[];
  warnings: string[];
  modelVersions: Record<string, string>;
  timings: Record<string, number>;
}
