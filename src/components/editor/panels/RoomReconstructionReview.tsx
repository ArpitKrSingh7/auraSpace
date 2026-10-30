'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Check, Plus, RotateCcw } from 'lucide-react';
import { newId } from '@/domain/catalog';
import { getCorners } from '@/domain/geometry';
import type { Detection, FurnitureType, Photo } from '@/domain/types';
import { buildPhotoLayout, distinctPhotoDetections } from '@/services/photo-layout';
import { useAppStore } from '@/store/useAppStore';

const names: Partial<Record<FurnitureType, string>> = { bed: 'Bed', chair: 'Chair', table: 'Study table', desk: 'Desk', wardrobe: 'Wardrobe', sofa: 'Sofa', plant: 'Plant', fridge: 'Fridge' };

export function RoomReconstructionReview({ photo, projectId, disabled = false, onDone }: {
  photo: Photo; projectId: string; disabled?: boolean; onDone?: () => void;
}) {
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId));
  const [selected, setSelected] = useState(() => distinctPhotoDetections(photo.detections).map((d) => d.id));
  const [width, setWidth] = useState(''), [length, setLength] = useState('');
  const [unit, setUnit] = useState<'m' | 'ft'>('m');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false), [kind, setKind] = useState<FurnitureType>('table');
  const [first, setFirst] = useState<[number, number] | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setSelected(distinctPhotoDetections(photo.detections).map((d) => d.id)); }, [photo.roomProposal]);
  const factor = unit === 'ft' ? .3048 : 1;
  const options = { selectedIds: selected,
    widthM: width.trim() ? Number(width) * factor : undefined,
    depthM: length.trim() ? Number(length) * factor : undefined };
  let preview: ReturnType<typeof buildPhotoLayout> | undefined, previewError = '';
  if (project && selected.length) {
    try { preview = buildPhotoLayout(project, photo.id, options); }
    catch (e) { previewError = e instanceof Error ? e.message : 'Check the room size.'; }
  }
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const analyze = async () => {
    if (busy || disabled) return;
    setBusy(true); setError(''); setMessage('Finding furniture and estimating its position…');
    try {
      const { analyzeRoomScene } = await import('@/services/vision.web');
      const result = await analyzeRoomScene(photo);
      const manual = useAppStore.getState().projects.find((p) => p.id === projectId)?.photos.find((p) => p.id === photo.id)?.detections.filter((d) => d.source === 'manual') ?? [];
      useAppStore.getState().updatePhotoInProject(projectId, photo.id, { ...result, detections: [...result.detections, ...manual], analysisStatus: 'complete' });
      if (alive.current) setMessage('Ready. Check the highlighted items before opening your room.');
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Photo analysis could not finish. You can mark furniture below.');
    } finally { if (alive.current) setBusy(false); }
  };
  const apply = () => {
    try {
      const store = useAppStore.getState();
      if (store.activeProjectId !== projectId) throw new Error('Open the original room before applying this layout.');
      const result = store.buildRoomFromPhoto(photo.id, options);
      store.addToast(`${result.added.length} items placed. Your room is ready to adjust.`, 'success');
      onDone?.();
      if (!onDone) setMessage('Room built. Close this panel to explore it in 3D.');
    } catch (e) { setError(e instanceof Error ? e.message : 'The room could not be opened.'); }
  };
  const mark = (event: MouseEvent<SVGSVGElement>) => {
    if (!adding || disabled || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point: [number, number] = [(event.clientX - bounds.left) / bounds.width * photo.width, (event.clientY - bounds.top) / bounds.height * photo.height];
    if (!first) { setFirst(point); return; }
    const x = Math.max(0, Math.min(first[0], point[0])), y = Math.max(0, Math.min(first[1], point[1]));
    const w = Math.min(photo.width - x, Math.abs(point[0] - first[0])), h = Math.min(photo.height - y, Math.abs(point[1] - first[1]));
    if (w < 8 || h < 8) { setError('Choose two opposite corners farther apart.'); setFirst(null); return; }
    const detection: Detection = { id: newId('manual'), type: kind, label: names[kind] ?? kind, score: 1, source: 'manual', box: [x, y, w, h] };
    const current = useAppStore.getState().projects.find((p) => p.id === projectId)?.photos.find((p) => p.id === photo.id);
    if (!current) return;
    useAppStore.getState().updatePhotoInProject(projectId, photo.id, { detections: [...current.detections, detection] });
    setSelected((ids) => [...ids, detection.id]); setFirst(null); setAdding(false); setError('');
  };
  return (
    <section aria-label="Room reconstruction" className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Your room, ready to arrange</h3>
        <p className="mt-1 text-xs leading-relaxed text-surface-500">Check the furniture, add a room size if you know it, then open a furnished draft. Everything stays editable.</p>
      </div>
      {!photo.roomProposal && <button type="button" className="btn-primary w-full text-sm" disabled={busy || disabled} onClick={analyze}>{busy ? 'Analyzing your photo…' : 'Analyze photo'}</button>}
      {(message || error) && <p role={error ? 'alert' : 'status'} className={`text-xs ${error ? 'text-red-700' : 'text-surface-600'}`}>{error || message}</p>}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">1. Check your furniture · {selected.length} selected</span>
          {photo.roomProposal && <button type="button" className="flex items-center gap-1 text-xs text-brand-700" disabled={busy || disabled} onClick={analyze}><RotateCcw size={12} />Scan again</button>}
        </div>
        <div className="mx-auto max-w-[300px] overflow-hidden rounded-xl border border-surface-200">
          <svg width={photo.width} height={photo.height} viewBox={`0 0 ${photo.width} ${photo.height}`} className={`block h-auto w-full ${adding ? 'cursor-crosshair touch-manipulation' : ''}`} role="img" aria-label={adding ? 'Mark two opposite corners of the missing furniture' : 'Photo with detected furniture'} onClick={mark}>
            <image href={photo.uri} width={photo.width} height={photo.height} />
            {photo.detections.map((d, index) => <g key={d.id} opacity={selected.includes(d.id) ? 1 : .35}>
              <rect x={d.box[0]} y={d.box[1]} width={d.box[2]} height={d.box[3]} fill="none" stroke={selected.includes(d.id) ? '#a3e635' : '#d1d5db'} strokeWidth={photo.width * .004} />
              <rect x={d.box[0]} y={d.box[1]} width={photo.width * .055} height={photo.width * .055} fill="#244638" />
              <text x={d.box[0] + photo.width * .0275} y={d.box[1] + photo.width * .038} fontSize={photo.width * .035} textAnchor="middle" fill="white">{index + 1}</text>
            </g>)}
            {first && <circle cx={first[0]} cy={first[1]} r={photo.width * .018} fill="#facc15" stroke="#111" strokeWidth={photo.width * .003} />}
          </svg>
        </div>
        <div className="mt-3 max-h-44 space-y-1 overflow-y-auto">
          {photo.detections.map((d, index) => {
            const sized = preview?.items.find((item) => item.photoId === photo.id && item.detectionId === d.id);
            return <label key={d.id} className="flex items-start gap-2 rounded-lg bg-surface-50 px-3 py-2 text-xs">
              <input type="checkbox" className="mt-0.5 accent-[#3e6658]" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{index + 1}. {names[d.type] ?? d.label}</span>
                  <span className="text-[10px] text-surface-500">{d.source === 'manual' ? 'Added by you' : d.score < .65 ? 'Please check' : 'Detected'}</span>
                </span>
                {sized && <span className="mt-1 block text-[11px] text-surface-600">
                  Estimated size: {(sized.width / factor).toFixed(2)} × {(sized.depth / factor).toFixed(2)} × {(sized.height / factor).toFixed(2)} {unit}
                </span>}
              </span>
            </label>;
          })}
        </div>
        <p className="mt-2 text-[11px] text-surface-500">Uncheck wrong or repeated boxes. A bed should have one box for each separate bed.</p>
        {!!preview?.added.length && <p className="mt-1 text-[11px] leading-relaxed text-surface-500">Sizes are width × length × height. We estimate them from depth where usable and use typical sizes for missing or cropped parts. You can resize each item in the room.</p>}
        <div className="mt-2 flex items-center gap-2">
          <select aria-label="Type of missing furniture" className="input-field flex-1 text-xs" value={kind} onChange={(e) => { setKind(e.target.value as FurnitureType); setFirst(null); }}>
            {(['table', 'bed', 'chair', 'wardrobe', 'sofa', 'desk'] as const).map((type) => <option key={type} value={type}>{names[type]}</option>)}
          </select>
          <button type="button" className="btn-secondary whitespace-nowrap !px-3 text-xs" onClick={() => { setAdding(!adding); setFirst(null); }}><Plus size={13} />{adding ? 'Cancel' : 'Mark missing item'}</button>
        </div>
        {adding && <p role="status" className="mt-2 rounded-lg bg-brand-50 p-2 text-xs text-brand-800">Tap two opposite corners of the {names[kind]?.toLowerCase()} in the photo. {first ? 'Now tap the opposite corner.' : 'Start with one corner.'}</p>}
      </div>
      <div className="rounded-xl border border-surface-200 p-3">
        <div className="flex items-center justify-between"><span className="text-xs font-semibold">2. Room size <span className="font-normal text-surface-500">(optional)</span></span>
          <select aria-label="Room measurement unit" className="bg-transparent text-xs" value={unit} onChange={(event) => {
            const next = event.target.value as 'm' | 'ft', nextFactor = next === 'ft' ? .3048 : 1;
            if (width.trim()) setWidth(String(Number((Number(width) * factor / nextFactor).toFixed(3))));
            if (length.trim()) setLength(String(Number((Number(length) * factor / nextFactor).toFixed(3))));
            setUnit(next);
          }}><option value="m">Metres</option><option value="ft">Feet</option></select>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">{([['Width', width, setWidth], ['Length', length, setLength]] as const).map(([label, value, setter]) => <label key={label} className="text-xs text-surface-600">{label} ({unit})
          <input type="number" inputMode="decimal" min={unit === 'ft' ? 3.3 : 1} max={unit === 'ft' ? 131 : 40} step="0.1" placeholder={unit === 'ft' ? 'e.g. 10' : 'e.g. 3.05'} value={value} onChange={(e) => setter(e.target.value)} className="input-field mt-1 w-full text-sm" />
        </label>)}</div>
        <p className="mt-2 text-[11px] leading-relaxed text-surface-500">A rough measurement helps a lot. The visible floor in a photo is often smaller than the whole room.</p>
      </div>
      {preview && <div className="rounded-xl bg-surface-50 p-3">
        <div className="mb-2 flex justify-between gap-2 text-xs"><span className="font-semibold">3. Your starting layout</span><span>{preview.room.width.toFixed(2)} × {preview.room.depth.toFixed(2)} m</span></div>
        <svg viewBox={`-.1 -.1 ${preview.room.width + .2} ${preview.room.depth + .2}`} className="h-40 w-full" role="img" aria-label="Furnished room draft preview">
          <rect width={preview.room.width} height={preview.room.depth} fill="white" stroke="#3e6658" strokeWidth=".035" />
          {preview.added.map((item) => <g key={item.id}><polygon points={getCorners(item).map((p) => `${p.x},${p.z}`).join(' ')} fill={item.color} fillOpacity=".7" stroke="#3e6658" strokeWidth=".02" /><text x={item.x} y={item.z} textAnchor="middle" dominantBaseline="middle" fontSize=".16" fill="#172b22">{photo.detections.findIndex((d) => d.id === item.detectionId) + 1}</text></g>)}
        </svg>
        <p className="mt-2 text-[11px] leading-relaxed text-surface-500">{preview.projectedCount ? 'Furniture positions use estimated depth, with adjustments to fit the room.' : 'Positions follow the photo composition as a starting guess; reliable floor depth was unavailable.'} Sizes and hidden boundaries need your review.</p>
        {preview.warnings.some((w) => /overlaps|boundary/i.test(w)) && <p className="mt-2 text-xs text-amber-800">Some items need adjustment to fit. You can move, rotate and resize them in the room.</p>}
      </div>}
      {previewError && <p role="alert" className="text-xs text-red-700">{previewError}</p>}
      <button type="button" className="btn-primary w-full text-sm" disabled={busy || disabled || !preview} onClick={apply}><Check size={16} />Build my room</button>
      <p className="text-[11px] text-surface-500">Opens the room with selected furniture already sized and placed. Replaces previous photo suggestions while keeping manually added, measured and locked items. Undo is available.</p>
      {photo.roomProposal && <details className="text-[11px] text-surface-500"><summary className="cursor-pointer">Estimate details</summary><ul className="mt-2 list-disc space-y-1 pl-4">{photo.roomProposal.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    </section>
  );
}
