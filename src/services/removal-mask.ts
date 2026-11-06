import { z } from 'zod';
import type { Detection } from '../domain/types';

const coordinate = z.number().finite().min(0).max(20_000_000);
const point = z.tuple([coordinate, coordinate]);
export const removalMaskSchema = z.object({
  polygons: z.array(z.array(point).min(3).max(1000)).max(100),
  strokes: z.array(z.object({
    tool: z.enum(['paint', 'erase']),
    radius: z.number().finite().min(1).max(500),
    points: z.array(point).min(1).max(3000),
  })).max(300),
  expansionPx: z.literal(0).default(0),
});
export type RemovalMask = z.infer<typeof removalMaskSchema>;
export type MaskStroke = RemovalMask['strokes'][number];

export function selectedRemovalMask(detections: Detection[], strokes: MaskStroke[] = []): RemovalMask {
  return { polygons: detections.map((d) => {
    if (d.maskPolygon?.length) return d.maskPolygon;
    const [x, y, w, h] = d.box;
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }), strokes, expansionPx: 0 };
}

export function scaleRemovalMask(mask: RemovalMask, source: { width: number; height: number }, target: { width: number; height: number }): RemovalMask {
  const parsed = removalMaskSchema.parse(mask);
  const sx = target.width / source.width, sy = target.height / source.height;
  if (![source.width, source.height, target.width, target.height].every((v) => Number.isFinite(v) && v > 0)) throw new Error('Invalid mask image dimensions.');
  const scale = ([x, y]: [number, number]): [number, number] => {
    if (x > source.width || y > source.height) throw new Error('The removal mask extends outside this photo.');
    return [x * sx, y * sy];
  };
  return { polygons: parsed.polygons.map((p) => p.map(scale)), strokes: parsed.strokes.map((s) => ({ ...s,
    radius: Math.max(1, Math.min(500, Math.round(s.radius * Math.min(sx, sy)))), points: s.points.map(scale),
  })), expansionPx: 0 };
}

/** Browser review and offline compositing use the same ordered brush operations. */
export function drawRemovalMask(context: CanvasRenderingContext2D, mask: RemovalMask, width: number, height: number, transparent = false) {
  context.globalCompositeOperation = 'source-over';
  context.clearRect(0, 0, width, height);
  if (!transparent) { context.fillStyle = '#000'; context.fillRect(0, 0, width, height); }
  context.fillStyle = '#fff';
  for (const polygon of mask.polygons) {
    context.beginPath();
    polygon.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath(); context.fill();
  }
  context.lineCap = 'round'; context.lineJoin = 'round';
  for (const stroke of mask.strokes) {
    context.globalCompositeOperation = transparent && stroke.tool === 'erase' ? 'destination-out' : 'source-over';
    context.strokeStyle = context.fillStyle = stroke.tool === 'paint' ? '#fff' : '#000';
    context.lineWidth = stroke.radius * 2;
    context.beginPath();
    stroke.points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
    context.stroke();
    for (const [x, y] of [stroke.points[0], stroke.points[stroke.points.length - 1]]) {
      context.beginPath(); context.arc(x, y, stroke.radius, 0, Math.PI * 2); context.fill();
    }
  }
  context.globalCompositeOperation = 'source-over';
}
