import type { Detection, Photo } from '../domain/types';
import {
  applyPixelOperation,
  approximateSurfaceFill,
  clampBox,
  compositeRemovalPixels,
  furnitureType,
  MAX_IMAGE_PIXELS,
  parseDetections,
  postVision,
  VisionError,
} from './vision-core';
import type { ImageOperation, Progress } from './vision-core';
import { mapRoomProposalToSource } from './reconstruction-core';
import type { RoomReconstructionProposal } from '../../packages/scene-domain/src/index';
import { parseRoomViewsResponse } from './multi-photo-core';
import { drawRemovalMask, scaleRemovalMask, type RemovalMask } from './removal-mask';
import { scaledPhotoHints } from './photo-hints';
export { VisionError } from './vision-core';

const endpoint = process.env.NEXT_PUBLIC_VISION_API_URL
  ? '/api/vision'
  : undefined;
type Detector = {
  detect: (
    input: HTMLCanvasElement,
    maxBoxes?: number,
    minScore?: number,
  ) => Promise<
    Array<{
      class: string;
      score: number;
      bbox: [number, number, number, number];
    }>
  >;
};
let detectorPromise: Promise<Detector> | null = null;
let inferenceTail: Promise<unknown> = Promise.resolve();

export const modelStatus =
  'On-device COCO-SSD detection. Dimensions are editable estimates.';

async function serviceEndpoint(): Promise<string | undefined> {
  if (endpoint) return endpoint;
  // Server-only configuration is sufficient; do not require a public backend URL.
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(12_000) });
    const health = await response.json();
    if (health.services?.vision === 'connected') return '/api/vision';
  } catch { /* Local image tools remain available. */ }
  return undefined;
}

async function canvasFor(
  photo: Photo,
  maxSide = 1600,
): Promise<HTMLCanvasElement> {
  const image = new Image();
  if (!photo.uri.startsWith('data:') && !photo.uri.startsWith('blob:'))
    image.crossOrigin = 'anonymous';
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(
        new VisionError(
          'This photo could not be opened. Import it again.',
          'invalid-image',
        ),
      );
  });
  image.src = photo.uri;
  await loaded;
  if (
    !image.naturalWidth ||
    image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS
  )
    throw new VisionError(
      'Please choose a photo below 20 megapixels.',
      'image-too-large',
    );
  const scale = Math.min(
    1,
    maxSide / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context)
    throw new VisionError('Image processing is not supported by this browser.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function getDetector(progress?: Progress): Promise<Detector> {
  if (!detectorPromise)
    detectorPromise = (async () => {
      progress?.(
        'Loading the furniture detector. The first run downloads model weights.',
      );
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      if (!tf.getBackend()) await tf.setBackend('cpu');
      const coco = await import('@tensorflow-models/coco-ssd');
      return await coco.load({ base: 'lite_mobilenet_v2' });
    })().catch(() => {
      detectorPromise = null;
      throw new VisionError(
        'The furniture model could not load. Check your connection, or outline an item manually.',
        'model-unavailable',
      );
    });
  return detectorPromise;
}

export async function analyzePhoto(
  photo: Photo,
  onProgress?: Progress,
  browserOnly = false,
): Promise<Detection[]> {
  const canvas = await canvasFor(photo, 1280);
  const service = browserOnly ? undefined : await serviceEndpoint();
  if (service) {
    onProgress?.('Analyzing furniture…');
    const result = await postVision(service, 'analyze', {
      image: canvas.toDataURL('image/jpeg', 0.84),
      include_artifacts: false,
    });
    return parseDetections(result.detections, canvas.width, canvas.height).map(
      (d) => ({
        ...d,
        ...(d.maskPolygon ? { maskPolygon: d.maskPolygon.map(([x, y]): [number, number] => [x * photo.width / canvas.width, y * photo.height / canvas.height]) } : {}),
        box: [
          (d.box[0] * photo.width) / canvas.width,
          (d.box[1] * photo.height) / canvas.height,
          (d.box[2] * photo.width) / canvas.width,
          (d.box[3] * photo.height) / canvas.height,
        ],
      }),
    );
  }
  const detector = await getDetector(onProgress);
  onProgress?.('Finding furniture on your device…');
  const task = inferenceTail
    .catch(() => undefined)
    .then(() => detector.detect(canvas, 50, 0.3));
  inferenceTail = task;
  let predictions: Awaited<typeof task>;
  try {
    predictions = await task;
  } catch {
    throw new VisionError(
      'The detector could not finish on this device. Try a smaller photo or add items manually.',
    );
  }
  return predictions.flatMap((prediction, index) => {
    const type = furnitureType(prediction.class);
    const box = clampBox(
      [
        (prediction.bbox[0] * photo.width) / canvas.width,
        (prediction.bbox[1] * photo.height) / canvas.height,
        (prediction.bbox[2] * photo.width) / canvas.width,
        (prediction.bbox[3] * photo.height) / canvas.height,
      ],
      photo.width,
      photo.height,
    );
    return type && box
      ? [
          {
            id: `${photo.id}-det-${index}`,
            label: prediction.class,
            type,
            score: prediction.score,
            box,
            source: 'model' as const,
          },
        ]
      : [];
  });
}

/** Geometry needs learned metric depth on the vision service; COCO-SSD cannot supply it. */
export async function analyzeRoomPhoto(
  photo: Photo,
  onProgress?: Progress,
): Promise<RoomReconstructionProposal> {
  return (await analyzeRoomScene(photo, onProgress)).roomProposal;
}

/** Keep furniture indices and poses from the same inference request. */
export async function analyzeRoomScene(photo: Photo, onProgress?: Progress): Promise<{ detections: Detection[]; roomProposal: RoomReconstructionProposal }> {
  const canvas = await canvasFor(photo, 1280);
  onProgress?.('Finding furniture and building your room layout…');
  let result: Record<string, unknown>;
  try { result = await postVision('/api/vision', 'analyze', {
    image: canvas.toDataURL('image/jpeg', 0.84),
    // include_room fits raw depth independently. Display/raw PNGs are not
    // consumed here and can exceed the hosted proxy's response-size budget.
    include_depth: false,
    include_room: true,
    include_artifacts: false,
    include_diagnostics: false,
    ...scaledPhotoHints(photo, canvas),
  }); } catch (error) {
    if (!(error instanceof VisionError) || !['service-unavailable', 'network'].includes(error.code)) throw error;
    onProgress?.('Room depth is unavailable. Finding furniture on your device…');
    const detections = await analyzePhoto(photo, onProgress, true);
    return { detections, roomProposal: { status: 'insufficient-evidence', source: 'unavailable',
      method: 'browser-detection-photo-layout', partial: true, confidence: 'low', floorCornersPx: [],
      warnings: ['Server depth was unavailable. This starting layout uses photo composition and editable furniture defaults. Enter room width and length for better scale.'] } };
  }
  try {
    const detections = parseDetections(result.detections, canvas.width, canvas.height).map((d) => ({
      ...d, box: [d.box[0] * photo.width / canvas.width, d.box[1] * photo.height / canvas.height,
        d.box[2] * photo.width / canvas.width, d.box[3] * photo.height / canvas.height] as Detection['box'],
      ...(d.maskPolygon ? { maskPolygon: d.maskPolygon.map(([x, y]): [number, number] => [x * photo.width / canvas.width, y * photo.height / canvas.height]) } : {}),
    }));
    return { detections, roomProposal: mapRoomProposalToSource(result.room_proposal, canvas, photo) };
  } catch {
    throw new VisionError('The service did not return a usable room proposal. Check its version or try another view.');
  }
}

/** A single bounded batch; optional alignment never blocks a best-view draft. */
export async function analyzeRoomViews(photos: Photo[], onProgress?: Progress) {
  if (!photos.length || photos.length > 5) throw new VisionError('Choose between one and five photos.');
  if (photos.length === 1) {
    const result = await analyzeRoomScene(photos[0], onProgress);
    return { anchorPhotoId: photos[0].id, roomProposal: result.roomProposal,
      updates: [{ photoId: photos[0].id, detections: result.detections, analyzed: true }] };
  }
  onProgress?.(`Finding furniture across ${photos.length} photos. This usually takes a minute or two…`);
  let maxSide = 1280, quality = .82;
  let payload: { id: string; image: string }[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    payload = [];
    for (const photo of photos) {
      const canvas = await canvasFor(photo, maxSide);
      payload.push({ id: photo.id, image: canvas.toDataURL('image/jpeg', quality), ...scaledPhotoHints(photo, canvas) });
    }
    if (JSON.stringify({ photos: payload }).length < 3_400_000) break;
    maxSide = Math.round(maxSide * .8); quality -= .08;
  }
  try {
    const raw = await postVision('/api/vision', 'reconstruct', { photos: payload });
    return parseRoomViewsResponse(raw, photos);
  } catch {
    onProgress?.('Multi-photo analysis is unavailable. Building from one photo; keeping the others as references…');
    // Keep the upload usable on older/offline deployments too.
    for (const photo of photos) {
      try {
        const result = await analyzeRoomScene(photo, onProgress);
        const roomProposal: RoomReconstructionProposal = { ...result.roomProposal,
          multiView: { anchorPhotoId: photo.id, views: photos.map((p) => ({ photoId: p.id,
            status: p.id === photo.id ? 'anchor' as const : 'reference' as const,
            message: p.id === photo.id ? 'Starting view for your draft.' : 'Kept as a reference; multi-photo analysis was unavailable.' })) } };
        return { anchorPhotoId: photo.id, roomProposal,
          updates: photos.map((p) => ({ photoId: p.id, detections: p.id === photo.id ? result.detections : p.detections, analyzed: p.id === photo.id })) };
      } catch { /* A broken view must not discard the other photos. */ }
    }
    throw new VisionError('Analysis could not finish. Your photos are saved; mark furniture to continue.');
  }
}

export async function inspectPhoto(photo: Photo, operation: 'clahe' | 'contours' | 'histogram') {
  const canvas = await canvasFor(photo, 1280);
  const result = await postVision('/api/vision', 'process', { image: canvas.toDataURL('image/jpeg', .88), operation });
  if (typeof result.uri !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(result.uri)) throw new VisionError('Invalid processing result.');
  return { uri: result.uri, metadata: result.metadata as { histogram?: Record<string, number[]> } | undefined };
}

export async function processPhoto(
  photo: Photo,
  operation: ImageOperation,
): Promise<string> {
  const canvas = await canvasFor(photo);
  const context = canvas.getContext('2d')!;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  pixels.data.set(
    applyPixelOperation(pixels.data, canvas.width, canvas.height, operation),
  );
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function removeFurniture(
  photo: Photo,
  detections: Detection[],
  onProgress?: Progress,
  reviewedMask?: RemovalMask,
): Promise<{ uri: string; method: string }> {
  if (!detections.length && !reviewedMask?.strokes.some((s) => s.tool === 'paint'))
    throw new VisionError(
      'Select or outline furniture to remove first.',
      'no-selection',
    );
  const canvas = await canvasFor(photo);
  const mask = reviewedMask ? scaleRemovalMask(reviewedMask, photo, canvas) : undefined;
  const maskCanvas = mask ? document.createElement('canvas') : undefined;
  if (maskCanvas && mask) {
    maskCanvas.width = canvas.width; maskCanvas.height = canvas.height;
    drawRemovalMask(maskCanvas.getContext('2d')!, mask, canvas.width, canvas.height);
    const pixels = maskCanvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let selected = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 127) selected++;
    if (!selected || selected === canvas.width * canvas.height) throw new VisionError('Paint furniture to remove and leave some surrounding wall or floor visible.');
  }
  const boxes = detections.map((d) => [
    (d.box[0] * canvas.width) / photo.width,
    (d.box[1] * canvas.height) / photo.height,
    (d.box[2] * canvas.width) / photo.width,
    (d.box[3] * canvas.height) / photo.height,
  ]);
  const service = await serviceEndpoint();
  if (service) {
    onProgress?.('Preparing an approximate empty-room preview…');
    const result = await postVision(service, 'inpaint', {
      image: canvas.toDataURL('image/jpeg', 0.88),
      boxes,
      ...(mask ? { masks: [mask] } : {}),
    });
    if (
      typeof result.uri !== 'string' ||
      !/^data:image\/(png|jpeg);base64,/.test(result.uri) ||
      typeof result.mask_uri !== 'string' || !/^data:image\/png;base64,/.test(result.mask_uri)
    )
      throw new VisionError('The image service returned an invalid preview.');
    const generated = await canvasFor({ ...photo, uri: result.uri });
    const responseMask = await canvasFor({ ...photo, uri: result.mask_uri });
    if ([generated, responseMask].some((c) => c.width !== canvas.width || c.height !== canvas.height))
      throw new VisionError('The removal preview has different image coordinates. Retry with the original photo.', 'bad-response');
    const context = canvas.getContext('2d')!;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const composed = compositeRemovalPixels(pixels.data,
      generated.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data,
      responseMask.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data);
    pixels.data.set(maskCanvas ? compositeRemovalPixels(pixels.data, composed,
      maskCanvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data) : composed);
    context.putImageData(pixels, 0, 0);
    return {
      uri: canvas.toDataURL('image/png'),
      method:
        typeof result.method === 'string'
          ? result.method
          : 'Service-generated preview',
    };
  }
  onProgress?.(
    'Blending surrounding surfaces. Hidden details are approximate.',
  );
  // Yield so the UI paints the progress state before a bounded pixel operation.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const context = canvas.getContext('2d')!;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  if (maskCanvas) {
    const maskPixels = maskCanvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let x0 = canvas.width, y0 = canvas.height, x1 = 0, y1 = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (maskPixels[(y * canvas.width + x) * 4] <= 127) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
    }
    const generated = approximateSurfaceFill(pixels.data, canvas.width, canvas.height, [[x0, y0, x1-x0, y1-y0]]);
    pixels.data.set(compositeRemovalPixels(pixels.data, generated, maskPixels));
  } else pixels.data.set(approximateSurfaceFill(pixels.data, canvas.width, canvas.height, boxes));
  context.putImageData(pixels, 0, 0);
  return {
    uri: canvas.toDataURL('image/png'),
    method: 'Approximate surface fill',
  };
}
