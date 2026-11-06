'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Check, Plus, RotateCcw } from 'lucide-react';
import { CATALOG, newId } from '@/domain/catalog';
import { getCorners } from '@/domain/geometry';
import type { Detection, FurnitureType, Photo } from '@/domain/types';
import { buildPhotoLayout, photoLayoutObservations } from '@/services/photo-layout';
import { useAppStore } from '@/store/useAppStore';
import { readOriginal } from '@/services/studio-storage';
import { FloorEvidenceReview } from './FloorEvidenceReview';

const names: Partial<Record<FurnitureType, string>> = { bed: 'Bed', chair: 'Chair', table: 'Table', desk: 'Desk', wardrobe: 'Wardrobe', sofa: 'Sofa', plant: 'Plant', fridge: 'Fridge' };

export function RoomReconstructionReview({ photo, projectId, disabled = false, onDone, onAnchorChange }: {
  photo: Photo; projectId: string; disabled?: boolean; onDone?: () => void; onAnchorChange?: (id: string) => void;
}) {
  const project = useAppStore((s) => s.projects.find((p) => p.id === projectId));
  const observations = useMemo(() => project ? photoLayoutObservations(project, photo.id) : [], [project, photo.id]);
  const [viewId, setViewId] = useState(photo.id);
  const visiblePhoto = project?.photos.find((p) => p.id === viewId) ?? photo;
  const views = photo.roomProposal?.multiView?.views;
  const [selected, setSelected] = useState(() => observations.filter((o) => o.defaultSelected).map((o) => o.key));
  const [width, setWidth] = useState(''), [length, setLength] = useState('');
  const [unit, setUnit] = useState<'m' | 'ft'>('m');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false), [kind, setKind] = useState<FurnitureType>('table');
  const [first, setFirst] = useState<[number, number] | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [referencePoints, setReferencePoints] = useState<[number, number][]>(photo.roomProposal?.scaleAnchor?.pointsPx ?? []);
  const [referenceLength, setReferenceLength] = useState(photo.roomProposal?.scaleAnchor ? String(photo.roomProposal.scaleAnchor.lengthM) : '');
  const [preservePoses, setPreservePoses] = useState(true);
  const [useGeometry, setUseGeometry] = useState(!photo.roomProposal?.geometryRejected);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setSelected(project ? photoLayoutObservations(project, photo.id).filter((o) => o.defaultSelected).map((o) => o.key) : []); }, [photo.roomProposal]);
  const factor = unit === 'ft' ? .3048 : 1;
  const options = useMemo(() => ({ selectedIds: selected, preserveObservedPoses: preservePoses, useEstimatedGeometry: useGeometry,
    ...(referencePoints.length === 2 && referenceLength.trim() ? { scaleAnchor: { pointsPx: referencePoints as [[number, number], [number, number]], lengthM: Number(referenceLength) } } : { scaleAnchor: null }),
    widthM: width.trim() ? Number(width) * factor : undefined,
    depthM: length.trim() ? Number(length) * factor : undefined }), [selected, width, length, factor, referencePoints, referenceLength, preservePoses, useGeometry]);
  const { preview, previewError } = useMemo(() => {
    if (project) {
      if ((referencePoints.length || referenceLength.trim()) && (referencePoints.length !== 2 || !referenceLength.trim())) return { preview: undefined, previewError: 'Choose two floor points and enter their measured distance, or clear calibration.' };
      try { return { preview: buildPhotoLayout(project, photo.id, options), previewError: '' }; }
      catch (e) { return { preview: undefined, previewError: e instanceof Error ? e.message : 'Check the room size.' }; }
    }
    return { preview: undefined, previewError: '' };
  }, [project, photo.id, options, observations.length, selected.length, referencePoints, referenceLength]);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const analyze = async () => {
    if (busy || disabled) return;
    setBusy(true); setError(''); setMessage('Finding furniture and estimating its position…');
    try {
      const { analyzeRoomViews } = await import('@/services/vision.web');
      const live = useAppStore.getState().projects.find((p) => p.id === projectId);
      const group = live?.photos.filter((p) => !views ? p.id === photo.id : views.some((v) => v.photoId === p.id)) ?? [photo];
      const result = await analyzeRoomViews(group, (text) => { if (alive.current) setMessage(text); });
      for (const update of result.updates) {
        const manual = useAppStore.getState().projects.find((p) => p.id === projectId)?.photos.find((p) => p.id === update.photoId)?.detections.filter((d) => d.source === 'manual') ?? [];
        useAppStore.getState().updatePhotoInProject(projectId, update.photoId, {
          detections: [...update.detections.filter((d) => d.source !== 'manual'), ...manual], analysisStatus: update.analyzed ? 'complete' : 'idle',
          roomProposal: update.photoId === result.anchorPhotoId ? result.roomProposal : undefined,
        });
      }
      if (alive.current) onAnchorChange?.(result.anchorPhotoId);
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
    if ((!adding && !calibrating) || disabled || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point: [number, number] = [(event.clientX - bounds.left) / bounds.width * visiblePhoto.width, (event.clientY - bounds.top) / bounds.height * visiblePhoto.height];
    if (calibrating) { setReferencePoints((points) => points.length < 2 ? [...points, point] : [point]); return; }
    if (!first) { setFirst(point); return; }
    const x = Math.max(0, Math.min(first[0], point[0])), y = Math.max(0, Math.min(first[1], point[1]));
    const w = Math.min(visiblePhoto.width - x, Math.abs(point[0] - first[0])), h = Math.min(visiblePhoto.height - y, Math.abs(point[1] - first[1]));
    if (w < 8 || h < 8) { setError('Choose two opposite corners farther apart.'); setFirst(null); return; }
    const detection: Detection = { id: newId('manual'), type: kind, label: names[kind] ?? kind, score: 1, source: 'manual', box: [x, y, w, h] };
    const current = useAppStore.getState().projects.find((p) => p.id === projectId)?.photos.find((p) => p.id === visiblePhoto.id);
    if (!current) return;
    useAppStore.getState().updatePhotoInProject(projectId, visiblePhoto.id, { detections: [...current.detections, detection] });
    setSelected((ids) => [...ids, `${visiblePhoto.id}:${detection.id}`]); setFirst(null); setAdding(false); setError('');
  };
  return (
    <section aria-label="Room reconstruction" className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Your room, ready to arrange</h3>
        <p className="mt-1 text-xs leading-relaxed text-surface-500">Check your furniture, then build an editable room.</p>
      </div>
      {!photo.roomProposal && <button type="button" className="btn-primary w-full text-sm" disabled={busy || disabled} onClick={analyze}>{busy ? 'Analyzing your photo…' : 'Analyze photo'}</button>}
      {(message || error) && <p role={error ? 'alert' : 'status'} className={`text-xs ${error ? 'text-red-700' : 'text-surface-600'}`}>{error || message}</p>}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">1. Check your furniture · {selected.length} selected</span>
          {photo.roomProposal && <button type="button" className="flex items-center gap-1 text-xs text-brand-700" disabled={busy || disabled} onClick={analyze}><RotateCcw size={12} />Scan again</button>}
        </div>
        {views && <div className="mb-3 rounded-xl bg-surface-50 p-3">
          <p className="text-xs font-medium">{views.filter((v) => v.status === 'aligned').length ? `${views.filter((v) => v.status !== 'reference').length} views aligned for this draft` : 'Starting from the clearest usable view'}</p>

          <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Room photo views">
            {views.map((v, i) => {
              const source = project?.photos.find((p) => p.id === v.photoId);
              return source && <button key={v.photoId} type="button" aria-pressed={viewId === v.photoId}
                className={`w-20 shrink-0 rounded-lg border-2 p-1 text-[10px] ${viewId === v.photoId ? 'border-brand-500' : 'border-transparent'}`}
                onClick={() => { setViewId(v.photoId); setFirst(null); setAdding(false); setCalibrating(false); }}>
                <img src={source.uri} alt={`Room view ${i + 1}`} className="h-14 w-full rounded object-cover" />
                <span className="mt-1 block">Photo {i + 1} · {v.status === 'anchor' ? 'Starting view' : v.status === 'aligned' ? 'Aligned' : 'Reference'}</span>
              </button>;
            })}
          </div>
          <p className="mt-1 text-[11px] text-surface-500">{views.find((v) => v.photoId === viewId)?.message}</p>
        </div>}
        <div className="mx-auto max-w-[300px] overflow-hidden rounded-xl border border-surface-200">
          <svg width={visiblePhoto.width} height={visiblePhoto.height} viewBox={`0 0 ${visiblePhoto.width} ${visiblePhoto.height}`} className={`block h-auto w-full ${adding ? 'cursor-crosshair touch-manipulation' : ''}`} role="img" aria-label={adding ? 'Mark two opposite corners of the missing furniture' : 'Photo with detected furniture'} onClick={mark}>
            <image href={visiblePhoto.uri} width={visiblePhoto.width} height={visiblePhoto.height} />
            {observations.filter((o) => o.photo.id === visiblePhoto.id).map(({ detection: d, key }) => <g key={d.id} opacity={selected.includes(key) ? 1 : .35}>
              <rect x={d.box[0]} y={d.box[1]} width={d.box[2]} height={d.box[3]} fill="none" stroke={selected.includes(key) ? '#a3e635' : '#d1d5db'} strokeWidth={visiblePhoto.width * .004} />
              <rect x={d.box[0]} y={d.box[1]} width={visiblePhoto.width * .055} height={visiblePhoto.width * .055} fill="#244638" />
              <text x={d.box[0] + visiblePhoto.width * .0275} y={d.box[1] + visiblePhoto.width * .038} fontSize={visiblePhoto.width * .035} textAnchor="middle" fill="white">{observations.findIndex((o) => o.key === key) + 1}</text>
            </g>)}
            {visiblePhoto.id === photo.id && referencePoints.map(([x,y], i) => <circle key={i} cx={x} cy={y} r={visiblePhoto.width * .012} fill="#facc15" stroke="#111" />)}
            {first && <circle cx={first[0]} cy={first[1]} r={visiblePhoto.width * .018} fill="#facc15" stroke="#111" strokeWidth={visiblePhoto.width * .003} />}
          </svg>
        </div>
        {visiblePhoto.originalAssetId && <button type="button" className="mt-2 text-sm text-brand-700 underline" onClick={async () => {
          try {
            const blob = await readOriginal(visiblePhoto.originalAssetId!);
            if (!blob) throw new Error('The original is no longer stored on this device.');
            const url = URL.createObjectURL(blob), link = document.createElement('a');
            link.href = url; link.download = visiblePhoto.name; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          } catch (e) { setError(e instanceof Error ? e.message : 'The original could not be opened.'); }
        }}>Download original</button>}
        <div className="mt-3 max-h-44 space-y-1 overflow-y-auto">
          {observations.map(({ detection: d, photo: sourcePhoto, key, reference }, index) => {
            const sized = preview?.items.find((item) => item.photoId === sourcePhoto.id && item.detectionId === d.id);
            return <label key={key} className="flex items-start gap-2 rounded-lg bg-surface-50 px-3 py-2 text-xs">
              <input type="checkbox" className="mt-0.5 accent-[#3e6658]" checked={selected.includes(key)} onChange={() => toggle(key)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 font-medium">{index + 1}. <select aria-label={`Furniture type for item ${index + 1}`} className="min-w-0 max-w-40 bg-transparent" value={d.type} disabled={busy || disabled} onChange={(event) => {
                    const type = event.target.value as FurnitureType;
                    const current = useAppStore.getState().projects.find((p) => p.id === projectId)?.photos.find((p) => p.id === sourcePhoto.id);
                    if (current) useAppStore.getState().updatePhotoInProject(projectId, sourcePhoto.id, { detections: current.detections.map((item) => item.id === d.id ? { ...item, type, label: CATALOG.find((entry) => entry.type === type)?.name ?? type, source: 'manual' } : item) });
                  }}>{CATALOG.map((entry) => <option key={entry.type} value={entry.type}>{entry.name}</option>)}</select></span>
                  <span className="text-[10px] text-surface-500">{reference ? 'Reference · position manually' : d.source === 'manual' ? 'Added by you' : d.score < .65 ? 'Please check' : 'Detected'}</span>
                </span>
                {sized && <span className="mt-1 block text-[11px] text-surface-600">
                  Estimated size: {(sized.width / factor).toFixed(2)} × {(sized.depth / factor).toFixed(2)} × {(sized.height / factor).toFixed(2)} {unit}
                </span>}
              </span>
            </label>;
          })}
        </div>
        {!observations.length && <p className="mt-2 text-xs text-surface-600">No furniture recognized. Mark an item in a photo, or open the room and add it from the library.</p>}
        <p className="mt-2 text-sm text-surface-500">Select each real item once. Uncheck incorrect or repeated detections.</p>

        <div className="mt-2 flex items-center gap-2">
          <select aria-label="Type of missing furniture" className="input-field flex-1 text-xs" value={kind} onChange={(e) => { setKind(e.target.value as FurnitureType); setFirst(null); }}>
            {CATALOG.map((entry) => <option key={entry.type} value={entry.type}>{entry.name}</option>)}
          </select>
          <button type="button" className="btn-secondary whitespace-nowrap !px-3 text-xs" onClick={() => { setAdding(!adding); setCalibrating(false); setFirst(null); }}><Plus size={13} />{adding ? 'Cancel' : 'Mark missing item'}</button>
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
        <p className="mt-2 text-sm text-surface-500">Room size changes the boundary. Furniture scale is calibrated separately.</p>
      </div>
      <FloorEvidenceReview key={visiblePhoto.id} photo={visiblePhoto} busy={busy || disabled} onRefine={async (hints) => {
        useAppStore.getState().updatePhotoInProject(projectId, visiblePhoto.id, { analysisHints: hints, roomProposal: undefined });
        if (visiblePhoto.id !== photo.id) useAppStore.getState().updatePhotoInProject(projectId, photo.id, { roomProposal: undefined });
        setReferencePoints([]); setReferenceLength(''); setUseGeometry(true);
        await analyze();
      }} />
      {photo.roomProposal?.status === 'estimated' && <label className="flex gap-2 text-sm"><input type="checkbox" checked={useGeometry} onChange={(e) => {
        setUseGeometry(e.target.checked); if (!e.target.checked) { setReferencePoints([]); setReferenceLength(''); setCalibrating(false); }
      }} />Use estimated floor geometry</label>}
      {useGeometry && photo.roomProposal?.imageToFloor && <details className="rounded-xl border border-surface-200 p-3 space-y-2 text-sm">
        <summary className="cursor-pointer font-semibold">Calibrate furniture scale</summary>
        <p>Choose two visible floor points in the starting photo, then enter their real distance. Avoid furniture surfaces and hidden floor.</p>
        <button type="button" className="btn-secondary text-xs" disabled={busy || disabled} onClick={() => { setViewId(photo.id); setAdding(false); setFirst(null); setCalibrating(!calibrating); }}>{calibrating ? 'Finish choosing points' : 'Choose floor reference points'}</button>
        <p role="status">{referencePoints.length} of 2 points selected</p>
        <label className="block">Measured distance (metres)<input aria-label="Measured floor distance in metres" type="number" min="0.01" step="0.01" className="input-field" value={referenceLength} onChange={(e) => setReferenceLength(e.target.value)} /></label>
        <button type="button" className="btn-ghost text-xs" onClick={() => { setReferencePoints([]); setReferenceLength(''); setCalibrating(false); }}>Clear calibration</button>
      </details>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={preservePoses} onChange={(e) => setPreservePoses(e.target.checked)} />Keep photo arrangement</label>
      {preview && <div className="rounded-xl bg-surface-50 p-3">
        <div className="mb-2 flex justify-between gap-2 text-xs"><span className="font-semibold">3. Your starting layout</span><span>{preview.room.width.toFixed(2)} × {preview.room.depth.toFixed(2)} m</span></div>
        <svg viewBox={`-.1 -.1 ${preview.room.width + .2} ${preview.room.depth + .2}`} className="h-40 w-full" role="img" aria-label="Furnished room draft preview">
          <rect width={preview.room.width} height={preview.room.depth} fill="white" stroke="#3e6658" strokeWidth=".035" />
          {preview.added.map((item) => <g key={item.id}><polygon points={getCorners(item).map((p) => `${p.x},${p.z}`).join(' ')} fill={item.color} fillOpacity=".7" stroke="#3e6658" strokeWidth=".02" /><text x={item.x} y={item.z} textAnchor="middle" dominantBaseline="middle" fontSize=".16" fill="#172b22">{observations.findIndex((o) => o.photo.id === item.photoId && o.detection.id === item.detectionId) + 1}</text></g>)}
        </svg>
        <p className="mt-2 text-sm text-surface-500">{preview.projectedCount ? 'Estimated layout. Check sizes and fit before use.' : 'Suggested arrangement from the photo. Check positions and sizes.'}</p>
        {preview.warnings.some((w) => /overlaps|boundary/i.test(w)) && <p className="mt-2 text-xs text-amber-800">Some items need adjustment to fit. You can move, rotate and resize them in the room.</p>}
      </div>}
      {previewError && <p role="alert" className="text-xs text-red-700">{previewError}</p>}
      <button type="button" className="btn-primary w-full text-sm" disabled={busy || disabled || !preview} onClick={apply}><Check size={16} />Build my room</button>
      <details className="text-sm text-surface-500"><summary className="cursor-pointer">What changes when I build?</summary><p className="mt-2">Selected suggestions replace earlier suggestions from this photo group. Your edited, manual, measured and locked items are kept, along with furniture from other photo groups. You can undo the build.</p></details>
      {photo.roomProposal && <details className="text-sm text-surface-500"><summary className="cursor-pointer">Estimate details</summary><ul className="mt-2 list-disc space-y-1 pl-4">{photo.roomProposal.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
    </section>
  );
}
