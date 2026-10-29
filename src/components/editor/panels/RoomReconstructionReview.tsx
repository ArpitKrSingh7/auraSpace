'use client';

import { useEffect, useRef, useState } from 'react';
import { mapFloorPoint, type PointXZ } from '../../../../packages/scene-domain/src/index';
import type { Photo } from '@/domain/types';
import { useAppStore } from '@/store/useAppStore';
import { reviewedRoomForWeb, roomReviewSignature } from '@/services/reconstruction-core';

export function RoomReconstructionReview({ photo, projectId, disabled = false }: {
  photo: Photo; projectId: string; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''),
    [error, setError] = useState(''), [points, setPoints] = useState<PointXZ[]>([]),
    [length, setLength] = useState(''), [width, setWidth] = useState(''),
    [depth, setDepth] = useState(''), [height, setHeight] = useState(''),
    [overwriteMeasured, setOverwriteMeasured] = useState(false),
    [replaceOpenings, setReplaceOpenings] = useState(false),
    [applied, setApplied] = useState(false),
    [openingKinds, setOpeningKinds] = useState<Record<string, 'door' | 'window' | ''>>({});
  const currentProject = useAppStore((s) => s.projects.find((p) => p.id === projectId));
  const alive = useRef(true), baseline = useRef('');
  const proposal = photo.roomProposal;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const project = useAppStore.getState().projects.find((p) => p.id === projectId);
    baseline.current = project ? roomReviewSignature(project) : '';
    setPoints([]); setLength(''); setWidth(''); setDepth(''); setHeight('');
    setOpeningKinds({}); setReplaceOpenings(false); setOverwriteMeasured(false); setError(''); setApplied(false);
  }, [photo.id, proposal, projectId]);

  const analyze = async () => {
    if (busy || disabled) return;
    setBusy(true); setError('');
    try {
      const { analyzeRoomPhoto } = await import('@/services/vision.web');
      const result = await analyzeRoomPhoto(photo, (text) => { if (alive.current) setMessage(text); });
      useAppStore.getState().updatePhotoInProject(projectId, photo.id, { roomProposal: result });
      if (alive.current) setMessage(result.status === 'estimated'
        ? 'Draft ready. Review its boundaries and scale before applying.'
        : 'This view could not support a room draft. Try a view with more visible floor and wall corners.');
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Room reconstruction could not finish.');
    } finally { if (alive.current) setBusy(false); }
  };

  const prepare = (current: NonNullable<typeof currentProject>) => {
      const measured = (value: string) => {
        if (!value.trim()) return undefined;
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) throw new Error('Measurements must be positive numbers in meters.');
        return n;
      };
      let scaleAnchor: { pointsPx: [PointXZ, PointXZ]; lengthM: number } | undefined;
      if (points.length || length.trim()) {
        const lengthM = measured(length);
        if (points.length !== 2 || lengthM === undefined)
          throw new Error('Choose two points on the floor and enter their measured separation, or clear the reference.');
        scaleAnchor = { pointsPx: points as [PointXZ, PointXZ], lengthM };
      }
      const selected = Object.entries(openingKinds).filter(([, kind]) => kind !== '');
      return reviewedRoomForWeb(current, photo.id, {
        scaleAnchor, widthM: measured(width), depthM: measured(depth), heightM: measured(height),
        overwriteMeasured, replaceOpenings,
        selectedOpeningIds: selected.map(([id]) => id),
        openingKinds: Object.fromEntries(selected) as Record<string, 'door' | 'window'>,
      });
  };
  const apply = () => {
    setError('');
    try {
      const store = useAppStore.getState(), current = store.projects.find((p) => p.id === projectId);
      if (!current || store.activeProjectId !== projectId)
        throw new Error('Open the original room to apply its draft.');
      if (roomReviewSignature(current) !== baseline.current)
        throw new Error('The room or furniture changed during review. Refresh the draft review before applying.');
      const result = prepare(current);
      store.updateRoom(result.room);
      const updated = useAppStore.getState().activeProject();
      if (updated) baseline.current = roomReviewSignature(updated);
      setApplied(true);
      setMessage('Room draft applied. Open 2D or 3D to adjust its dimensions, doors and windows. Furniture positions were kept.');
      store.addToast('Room draft applied. Review the space in 2D or 3D.', 'success');
      if (result.warnings.length) store.addToast(result.warnings[0], 'warning');
    } catch (e) { setError(e instanceof Error ? e.message : 'Review the draft before applying.'); }
  };

  const usable = proposal?.status === 'estimated' && proposal.source === 'model-estimated';
  const stale = currentProject && roomReviewSignature(currentProject) !== baseline.current;
  let preview: ReturnType<typeof reviewedRoomForWeb> | undefined, previewError = '';
  if (usable && currentProject && !stale && !applied) {
    try { preview = prepare(currentProject); }
    catch (e) { previewError = e instanceof Error ? e.message : 'Review the draft before applying.'; }
  }
  const fitWarnings = preview?.warnings.filter((w) => !proposal?.warnings.includes(w)) ?? [];
  const floor = proposal?.floorPolygonXZ;
  const minX = floor ? Math.min(...floor.map((p) => p[0])) : 0,
    minZ = floor ? Math.min(...floor.map((p) => p[1])) : 0,
    spanX = floor ? Math.max(...floor.map((p) => p[0])) - minX : 1,
    spanZ = floor ? Math.max(...floor.map((p) => p[1])) - minZ : 1;
  const mapped = points.map((p) => proposal?.imageToFloor ? mapFloorPoint(proposal.imageToFloor, p) : null);
  const baselineM = mapped.length === 2 && mapped[0] && mapped[1]
    ? Math.hypot(mapped[0][0] - mapped[1][0], mapped[0][1] - mapped[1][1]) : null;

  return (
    <section className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4" aria-label="Room reconstruction" onChange={() => setApplied(false)}>
      <div>
        <h3 className="text-sm font-semibold">Build the room from this photo</h3>
        <p className="mt-1 text-xs leading-relaxed text-surface-600">
          Estimate the visible floor and walls, check the scale, then use the draft in your planner.
          Hidden boundaries need your review.
        </p>
      </div>
      <button type="button" className="btn-primary w-full text-sm" disabled={busy || disabled} onClick={analyze}>
        {busy ? 'Building room draft…' : proposal ? 'Analyze room again' : 'Build room from photo'}
      </button>
      {message && <p role="status" className="text-xs text-surface-600">{message}</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {proposal && (
        <>
          <p className="text-xs font-medium">
            {usable ? 'Partial room draft' : 'More evidence needed'} · {proposal.confidence} confidence
          </p>
          {usable && <p className="text-sm">
            {proposal.widthM?.toFixed(2)} m × {proposal.depthM?.toFixed(2)} m
            {proposal.heightM ? ` × ${proposal.heightM.toFixed(2)} m high` : ' · height needs a measurement'}
          </p>}
          {usable && floor && spanX > 0 && spanZ > 0 && (
            <div className="rounded-lg bg-white p-3">
              <svg viewBox={`${minX - .15} ${minZ - .15} ${spanX + .3} ${spanZ + .3}`} className="h-36 w-full" role="img" aria-label="Estimated floor outline with observed walls and uncertain edges">
                <polygon points={floor.map((p) => p.join(',')).join(' ')} fill="#edf5ef" />
                {floor.map((p, i) => <line key={i} x1={p[0]} y1={p[1]} x2={floor[(i + 1) % floor.length][0]} y2={floor[(i + 1) % floor.length][1]}
                  stroke={proposal.boundaryEdges?.[i] === 'observed-wall' ? '#457457' : '#a97636'}
                  strokeWidth=".035" strokeDasharray={proposal.boundaryEdges?.[i] === 'observed-wall' ? undefined : '.12 .08'} />)}
              </svg>
              <p className="text-[11px] text-surface-500">Solid green: observed wall. Dashed amber: view limit; extend or correct it.</p>
            </div>
          )}
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-amber-900">
            {proposal.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
          </ul>
          {usable && (
            <>
              {proposal.imageToFloor && (
                <details className="rounded-lg bg-white p-3" open>
                  <summary className="cursor-pointer text-xs font-semibold">Check scale with a measured floor length</summary>
                  <p className="my-2 text-xs text-surface-500">Tap two visible points on the floor, such as tile corners. Measure the distance between those same points.</p>
                  <svg viewBox={`0 0 ${photo.width} ${photo.height}`} className="w-full touch-manipulation rounded-lg" role="img" aria-label="Choose two floor reference points"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const point: PointXZ = [(event.clientX - rect.left) / rect.width * photo.width, (event.clientY - rect.top) / rect.height * photo.height];
                      setPoints((prev) => prev.length === 2 ? [point] : [...prev, point]);
                      setApplied(false);
                    }}>
                    <image href={photo.uri} width={photo.width} height={photo.height} />
                    {points.length === 2 && <line x1={points[0][0]} y1={points[0][1]} x2={points[1][0]} y2={points[1][1]} stroke="#fde047" strokeWidth={photo.width * .004} />}
                    {points.map(([x, y], i) => <g key={i}>
                      <circle cx={x} cy={y} r={photo.width * .018} fill="#166534" stroke="white" strokeWidth={photo.width * .003} />
                      <text x={x} y={y} dy=".35em" textAnchor="middle" fontSize={photo.width * .024} fill="white">{i + 1}</text>
                    </g>)}
                  </svg>
                  <div className="mt-2 flex items-end gap-2">
                    <label className="flex-1 text-xs">Measured separation (m)
                      <input className="input-field mt-1 w-full" type="number" inputMode="decimal" min="0.01" step="0.01" value={length} onChange={(e) => setLength(e.target.value)} placeholder="e.g. 1.20" />
                    </label>
                    <button type="button" className="btn-secondary text-xs" onClick={() => { setPoints([]); setLength(''); setApplied(false); }}>Clear</button>
                  </div>
                  <p className="mt-2 text-[11px] text-surface-500">{points.length}/2 points selected{baselineM !== null ? ` · estimated separation ${baselineM.toFixed(2)} m before calibration` : ''}. Keep both points on the estimated floor.</p>
                </details>
              )}
              <fieldset className="space-y-2 rounded-lg bg-white p-3">
                <legend className="text-xs font-semibold">Known room measurements (optional)</legend>
                <div className="grid grid-cols-3 gap-2">
                  {([['Width', width, setWidth], ['Depth', depth, setDepth], ['Height', height, setHeight]] as const).map(([label, value, setter]) => (
                    <label key={label} className="text-xs">{label} (m)
                      <input className="input-field mt-1 w-full" type="number" inputMode="decimal" min="0.1" step="0.01" value={value} onChange={(e) => setter(e.target.value)} placeholder="Measured" />
                    </label>
                  ))}
                </div>
                <label className="flex items-start gap-2 text-xs text-surface-600"><input type="checkbox" checked={overwriteMeasured} onChange={(e) => setOverwriteMeasured(e.target.checked)} />Replace previously measured room dimensions</label>
                <p className="text-[11px] text-surface-500">Existing measurements take precedence. A floor reference improves the estimate; it does not measure hidden room edges.</p>
              </fieldset>
              {!!proposal.openings?.length && (
                <fieldset className="space-y-2 rounded-lg bg-white p-3">
                  <legend className="text-xs font-semibold">Review possible openings</legend>
                  <p className="text-xs text-surface-500">Rectangles can also be pictures or furniture. Select only a door or window you recognize.</p>
                  <svg viewBox={`0 0 ${photo.width} ${photo.height}`} className="w-full rounded-lg" role="img" aria-label="Numbered possible openings">
                    <image href={photo.uri} width={photo.width} height={photo.height} />
                    {proposal.openings.map((o, i) => <g key={o.id}>
                      <rect x={o.boxPx[0]} y={o.boxPx[1]} width={o.boxPx[2]} height={o.boxPx[3]} fill="none" stroke="#facc15" strokeWidth={photo.width * .004} />
                      <text x={o.boxPx[0]} y={o.boxPx[1] + photo.width * .035} fontSize={photo.width * .035} fill="#facc15" stroke="#111" strokeWidth={photo.width * .0008}>{i + 1}</text>
                    </g>)}
                  </svg>
                  {proposal.openings.map((o, i) => <label key={o.id} className="flex items-center justify-between gap-2 text-xs">Candidate {i + 1} · {o.widthM.toFixed(2)} m wide
                    <select className="input-field text-xs" value={openingKinds[o.id] ?? ''} onChange={(e) => setOpeningKinds({ ...openingKinds, [o.id]: e.target.value as 'door' | 'window' | '' })}>
                      <option value="">Ignore</option><option value="door">Door</option><option value="window">Window</option>
                    </select>
                  </label>)}
                </fieldset>
              )}
              <label className="flex items-start gap-2 text-xs text-surface-600"><input type="checkbox" checked={replaceOpenings} onChange={(e) => setReplaceOpenings(e.target.checked)} />Replace existing doors and windows with my reviewed choices (removes them if none are selected)</label>
              {preview && <p className="text-xs font-medium">Room after applying: {preview.room.width.toFixed(2)} × {preview.room.depth.toFixed(2)} × {preview.room.height.toFixed(2)} m.</p>}
              {fitWarnings.slice(0, 4).map((warning, i) => <p key={i} className="text-xs text-amber-900">{warning}</p>)}
              {previewError && <p className="text-xs text-amber-900">{previewError}</p>}
              {stale && <div className="space-y-2 text-xs text-amber-900">
                <p>The room or furniture changed during review. Refresh the preview and check its new dimensions.</p>
                <button type="button" className="btn-secondary text-xs" onClick={() => {
                  baseline.current = roomReviewSignature(currentProject!); setError(''); setMessage('Review refreshed. Check the updated room dimensions before applying.'); setApplied(false);
                }}>Refresh draft review</button>
              </div>}
              <button type="button" className="btn-primary w-full text-sm" disabled={busy || disabled || applied || !!stale || !preview} onClick={apply}>{applied ? 'Room draft applied' : 'Use this room draft'}</button>
              <p className="text-[11px] text-surface-500">Changes the room boundary. Your furniture keeps its dimensions and positions. You can undo this change.</p>
            </>
          )}
          {!usable && <p className="text-xs text-surface-600">Try another photo showing the floor and two wall corners. You can enter dimensions in Room settings while keeping all your furniture.</p>}
          <details className="text-[11px] text-surface-500"><summary className="cursor-pointer">How this draft was made</summary>
            <p className="mt-1">{proposal.method} · camera: {proposal.camera?.source === 'provided' ? 'provided intrinsics' : 'assumed field of view'}. Single-photo geometry remains approximate.</p>
          </details>
        </>
      )}
    </section>
  );
}
