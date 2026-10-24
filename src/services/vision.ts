import type { Detection, Photo } from '../domain/types';
import { parseDetections, postVision, VisionError } from './vision-core';
import type { ImageOperation, Progress } from './vision-core';
export { VisionError } from './vision-core';

const endpoint = (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_VISION_API_URL || process.env.EXPO_PUBLIC_VISION_API_URL))?.replace(/\/$/, '');
export const modelStatus = 'Image service configured. Manual layout and detection always available.';

async function payload(photo: Photo): Promise<string> {
  if (photo.uri.startsWith('data:image/')) return photo.uri;
  if (typeof window !== 'undefined') {
    // In browser: fetch blob and convert to data URI
    const res = await fetch(photo.uri);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  return photo.uri;
}

function service(): string {
  if (!endpoint) {
    throw new VisionError(
      'Vision API endpoint not configured. You can use on-device browser detection or add furniture manually.',
      'not-configured'
    );
  }
  return endpoint;
}

export async function analyzePhoto(photo: Photo, onProgress?: Progress): Promise<Detection[]> {
  const url = service();
  onProgress?.('Analyzing furniture…');
  const result = await postVision(url, 'analyze', { image: await payload(photo) });
  return parseDetections(result.detections, photo.width, photo.height);
}

export async function processPhoto(photo: Photo, operation: ImageOperation): Promise<string> {
  const result = await postVision(service(), 'process', { image: await payload(photo), operation });
  if (typeof result.uri !== 'string' || !result.uri.startsWith('data:image/')) {
    throw new VisionError('Invalid processed photo.');
  }
  return result.uri;
}

export async function removeFurniture(
  photo: Photo,
  detections: Detection[],
  onProgress?: Progress
): Promise<{ uri: string; method: string }> {
  const url = service();
  if (!detections.length) throw new VisionError('Select furniture to remove first.', 'no-selection');
  onProgress?.('Preparing an approximate empty-room preview…');
  const result = await postVision(url, 'inpaint', {
    image: await payload(photo),
    boxes: detections.map((d) => d.box),
  });
  if (typeof result.uri !== 'string' || !result.uri.startsWith('data:image/')) {
    throw new VisionError('Invalid preview.');
  }
  return {
    uri: result.uri,
    method: typeof result.method === 'string' ? result.method : 'Approximate surface fill',
  };
}
