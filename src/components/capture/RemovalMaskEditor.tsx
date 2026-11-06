'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Photo } from '@/domain/types';
import { drawRemovalMask, scaleRemovalMask, type MaskStroke, type RemovalMask } from '@/services/removal-mask';

export function RemovalMaskEditor({ photo, mask, onChange }: {
  photo: Photo; mask: RemovalMask; onChange: (strokes: MaskStroke[]) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pending = useRef<MaskStroke | null>(null);
  const [tool, setTool] = useState<'paint' | 'erase'>('erase');
  const [radius, setRadius] = useState(15);
  const [draft, setDraft] = useState<MaskStroke | null>(null);
  const scale = Math.min(1, 1280 / Math.max(photo.width, photo.height));
  const width = Math.max(1, Math.round(photo.width * scale)), height = Math.max(1, Math.round(photo.height * scale));
  const frame = useRef<number | null>(null);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    drawRemovalMask(context, scaleRemovalMask({ ...mask, strokes: [...mask.strokes, ...(draft ? [draft] : [])] }, photo, {width, height}), width, height, true);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = 'rgba(244, 63, 94, .49)'; context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  }, [mask, draft, photo.width, photo.height, width, height]);
  const point = (event: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(photo.width, (event.clientX - bounds.left) / bounds.width * photo.width)),
      Math.max(0, Math.min(photo.height, (event.clientY - bounds.top) / bounds.height * photo.height))];
  };
  const finish = () => {
    if (pending.current) onChange([...mask.strokes, pending.current]);
    pending.current = null; setDraft(null);
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {(['paint', 'erase'] as const).map((value) => <button key={value} type="button" aria-pressed={tool === value}
        className={tool === value ? 'btn-primary text-sm' : 'btn-secondary text-sm'} onClick={() => setTool(value)}>{value === 'paint' ? 'Paint removal' : 'Keep area'}</button>)}
      <label className="flex items-center gap-2 text-sm">Brush<input aria-label="Removal brush size" type="range" min="2" max="100" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></label>
      <button type="button" className="btn-secondary text-sm" disabled={!mask.strokes.length} onClick={() => onChange(mask.strokes.slice(0, -1))}>Undo brush</button>
      <button type="button" className="btn-secondary text-sm" disabled={!mask.strokes.length} onClick={() => onChange([])}>Reset mask</button>
    </div>
    <p className="text-sm text-surface-600">Pink areas will be removed. Brush over areas to correct the selection.</p>
    <div className="relative overflow-hidden rounded-xl border border-surface-200">
      <img src={photo.uri} alt="Removal source" className="block h-auto w-full" />
      <canvas ref={canvas} width={width} height={height} aria-label="Removal mask: paint or keep areas" className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary || mask.strokes.length >= 300) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pending.current = { tool, radius, points: [point(e)] }; setDraft({ ...pending.current });
        }}
        onPointerMove={(e) => {
          const stroke = pending.current;
          if (!stroke || stroke.points.length >= 3000) return;
          const next = point(e), last = stroke.points[stroke.points.length - 1];
          if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 2) return;
          stroke.points.push(next);
          if (frame.current === null) frame.current = requestAnimationFrame(() => {
            frame.current = null;
            if (pending.current) setDraft({ ...pending.current, points: [...pending.current.points] });
          });
        }} onPointerUp={finish} onPointerCancel={() => { pending.current = null; setDraft(null); }} onLostPointerCapture={finish} />
    </div>
    {mask.strokes.length >= 300 && <p role="status" className="text-sm">Brush limit reached. Undo or reset to continue.</p>}
  </div>;
}
