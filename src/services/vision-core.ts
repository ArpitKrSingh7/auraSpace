import type { Detection, FurnitureType } from '../domain/types';

export type ImageOperation = 'grayscale' | 'contrast' | 'edges';
export type Progress = (message: string) => void;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const MAX_REQUEST_CHARS = 3_500_000;

export class VisionError extends Error {
  constructor(message: string, public code: string = 'analysis-failed') {
    super(message); this.name = 'VisionError';
  }
}

export function furnitureType(label: string): FurnitureType | null {
  const names: Record<string, FurnitureType> = {
    couch: 'sofa', sofa: 'sofa', chair: 'chair', bed: 'bed',
    'dining table': 'table', table: 'table', 'potted plant': 'plant',
  };
  return names[label.toLowerCase()] ?? null;
}

export function clampBox(box: number[], width: number, height: number): [number, number, number, number] | null {
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return null;
  const left = Math.max(0, Math.min(width, box[0]));
  const top = Math.max(0, Math.min(height, box[1]));
  const right = Math.max(left, Math.min(width, box[0] + box[2]));
  const bottom = Math.max(top, Math.min(height, box[1] + box[3]));
  return right > left && bottom > top ? [left, top, right - left, bottom - top] : null;
}

export function parseDetections(value: unknown, width: number, height: number): Detection[] {
  if (!Array.isArray(value)) throw new VisionError('The image service returned an invalid response.', 'bad-response');
  return value.slice(0, 100).flatMap((entry, i) => {
    if (!entry || typeof entry !== 'object') return [];
    const d = entry as Record<string, unknown>;
    const label = typeof d.label === 'string' ? d.label : '';
    const type = furnitureType(label);
    const box = Array.isArray(d.box) ? clampBox(d.box, width, height) : null;
    const score = typeof d.score === 'number' ? d.score : NaN;
    if (!type || !box || !Number.isFinite(score) || score < 0 || score > 1) return [];
    return [{ id: typeof d.id === 'string' ? d.id.slice(0, 100) : `det-${i}`, label, type, score, box, source: 'model' as const }];
  });
}

export function applyPixelOperation(input: Uint8ClampedArray, width: number, height: number, operation: ImageOperation): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS || input.length !== width * height * 4) {
    throw new VisionError('This image has invalid dimensions.', 'invalid-image');
  }
  const output = new Uint8ClampedArray(input);
  const gray = new Float32Array(width * height);
  for (let p = 0; p < gray.length; p++) {
    const i = p * 4;
    gray[p] = 0.299 * input[i] + 0.587 * input[i + 1] + 0.114 * input[i + 2];
    if (operation === 'grayscale') output[i] = output[i + 1] = output[i + 2] = gray[p];
    if (operation === 'contrast') for (let c = 0; c < 3; c++) output[i + c] = 128 + (input[i + c] - 128) * 1.35;
  }
  if (operation === 'edges') {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const at = (dx: number, dy: number) => gray[Math.max(0, Math.min(height - 1, y + dy)) * width + Math.max(0, Math.min(width - 1, x + dx))];
      const gx = -at(-1,-1) + at(1,-1) - 2*at(-1,0) + 2*at(1,0) - at(-1,1) + at(1,1);
      const gy = -at(-1,-1) - 2*at(0,-1) - at(1,-1) + at(-1,1) + 2*at(0,1) + at(1,1);
      const i = (y * width + x) * 4;
      output[i] = output[i+1] = output[i+2] = Math.min(255, Math.hypot(gx, gy));
    }
  }
  return output;
}

/** Bounded, deterministic surface interpolation. This is a visual approximation, not generative inpainting. */
export function approximateSurfaceFill(input: Uint8ClampedArray, width: number, height: number, boxes: number[][]): Uint8ClampedArray {
  if (input.length !== width * height * 4 || width * height > MAX_IMAGE_PIXELS || width < 1 || height < 1) throw new VisionError('Invalid image dimensions.');
  const rectangles = boxes.map(b => clampBox(b, width, height)).filter((b): b is [number, number, number, number] => !!b)
    .map(([x,y,w,h]) => [Math.floor(x), Math.floor(y), Math.ceil(x+w), Math.ceil(y+h)]);
  if (!rectangles.length) throw new VisionError('Select furniture to remove first.', 'no-selection');
  const mask = new Uint8Array(width * height);
  for (const [x0,y0,x1,y1] of rectangles) for (let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) mask[y*width+x]=1;
  if (mask.every(Boolean)) throw new VisionError('Leave some wall or floor visible around the selection.', 'mask-too-large');
  const output = new Uint8ClampedArray(input);
  const sample = (x:number,y:number,dx:number,dy:number): number[] | null => {
    while (x>=0 && y>=0 && x<width && y<height) {
      if (!mask[y*width+x]) return Array.from(input.slice((y*width+x)*4,(y*width+x)*4+3));
      x+=dx; y+=dy;
    }
    return null;
  };
  for (const [x0,y0,x1,y1] of rectangles) {
    const top = Array.from({length:x1-x0},(_,i)=>sample(x0+i,y0-1,0,-1));
    const bottom = Array.from({length:x1-x0},(_,i)=>sample(x0+i,y1,0,1));
    const left = Array.from({length:y1-y0},(_,i)=>sample(x0-1,y0+i,-1,0));
    const right = Array.from({length:y1-y0},(_,i)=>sample(x1,y0+i,1,0));
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) {
      const candidates = [top[x-x0],bottom[x-x0],left[y-y0],right[y-y0]];
      const distances = [y-y0+1,y1-y,x-x0+1,x1-x];
      let weight=0; const color=[0,0,0];
      candidates.forEach((pixel,i)=>{ if(pixel){ const w=1/(distances[i]*distances[i]); weight+=w; for(let c=0;c<3;c++)color[c]+=pixel[c]*w; } });
      if(weight) for(let c=0;c<3;c++) output[(y*width+x)*4+c]=color[c]/weight;
    }
  }
  return output;
}

export async function postVision(endpoint: string, operation: string, payload: unknown): Promise<Record<string, unknown>> {
  const body = JSON.stringify(payload);
  if (body.length > MAX_REQUEST_CHARS) throw new VisionError('This photo is too large. Choose a smaller image.', 'image-too-large');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new VisionError(typeof result.error === 'string' ? result.error : typeof result.detail === 'string' ? result.detail : 'The image service is unavailable. You can add furniture manually.', 'service-unavailable');
    if (!result || typeof result !== 'object') throw new VisionError('Invalid response from image service.', 'bad-response');
    return result;
  } catch(error) {
    if (error instanceof VisionError) throw error;
    throw new VisionError(error instanceof Error && error.name === 'AbortError' ? 'Image analysis timed out. Retry or add furniture manually.' : 'Could not reach the image service. Your room and photo are saved.', 'network');
  } finally { clearTimeout(timeout); }
}
