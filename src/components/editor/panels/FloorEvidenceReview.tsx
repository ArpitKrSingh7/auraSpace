'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import type { Photo } from '@/domain/types';
import { validatePhotoHints } from '@/services/photo-hints';

/** Evidence is separate from the rectangular planning envelope. */
export function FloorEvidenceReview({ photo, busy, onRefine }: {
  photo: Photo; busy: boolean; onRefine: (hints: NonNullable<Photo['analysisHints']>) => Promise<void>;
}) {
  const [points, setPoints] = useState<[number, number][]>(photo.analysisHints?.floorRegionPx ?? []);
  const [marking, setMarking] = useState(false), [error, setError] = useState('');
  const [camera, setCamera] = useState(() => Object.fromEntries((['fx', 'fy', 'cx', 'cy'] as const).map((key) => [key, String(photo.analysisHints?.intrinsics?.[key] ?? '')])));
  const supportPath = useMemo(() => {
    const s = photo.roomProposal?.floorSupport;
    if (!s) return '';
    return s.cells.map((cell) => {
      const x = s.originPx[0] + cell % s.columns * s.stepPx[0] - s.stepPx[0] / 2;
      const y = s.originPx[1] + Math.floor(cell / s.columns) * s.stepPx[1] - s.stepPx[1] / 2;
      return `M${x},${y}h${s.stepPx[0]}v${s.stepPx[1]}h${-s.stepPx[0]}z`;
    }).join('');
  }, [photo.roomProposal?.floorSupport]);
  const mark = (event: MouseEvent<SVGSVGElement>) => {
    if (!marking || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point: [number, number] = [(event.clientX - bounds.left) / bounds.width * photo.width, (event.clientY - bounds.top) / bounds.height * photo.height];
    setPoints((current) => current.length < 4 ? [...current, point] : [point]);
  };
  const refine = async () => {
    try {
      const keys = ['fx', 'fy', 'cx', 'cy'] as const;
      const anyCamera = keys.some((key) => camera[key].trim());
      if (anyCamera && keys.some((key) => !camera[key].trim())) throw new Error('Enter all four calibrated camera values or clear them.');
      const hints = validatePhotoHints({
        ...(points.length ? { floorRegionPx: points } : {}),
        ...(anyCamera ? { intrinsics: Object.fromEntries(keys.map((key) => [key, Number(camera[key])])) } : {}),
      }, photo);
      setError(''); setMarking(false); await onRefine(hints);
    } catch (e) { setError(e instanceof Error ? e.message : 'Check the selected floor patch.'); }
  };
  const edges = photo.roomProposal?.boundaryEdges;
  return <details className="rounded-xl border border-surface-200 p-3 text-sm space-y-3">
    <summary className="cursor-pointer font-semibold">Review floor and walls</summary>
    <p>{supportPath ? 'Green shows depth samples supporting the floor. Gaps have no floor evidence.' : 'This draft has no floor-evidence overlay. Refine the scan to request one.'}</p>
    <svg viewBox={`0 0 ${photo.width} ${photo.height}`} className={`w-full rounded-lg ${marking ? 'cursor-crosshair' : ''}`} role="img" aria-label="Floor evidence and selected floor patch" onClick={mark}>
      <image href={photo.uri} width={photo.width} height={photo.height} />
      <path d={supportPath} fill="#22c55e" opacity=".35" />
      {points.length > 1 && <polygon points={points.map((p) => p.join(',')).join(' ')} fill="#38bdf8" fillOpacity=".2" stroke="#38bdf8" strokeWidth={photo.width * .005} />}
      {points.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r={photo.width * .014} fill="#facc15" /><text x={x} y={y} dominantBaseline="middle" textAnchor="middle" fontSize={photo.width * .02}>{i + 1}</text></g>)}
    </svg>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => { setMarking(!marking); if (!marking) setPoints([]); }}>{marking ? 'Finish marking' : 'Mark a floor patch'}</button>
      <button type="button" className="btn-ghost text-sm" disabled={busy || !points.length} onClick={() => { setPoints([]); setMarking(false); }}>Clear patch</button>
    </div>
    {marking && <p role="status">{points.length}/4 corners. Choose a clear floor patch in order around its edges, avoiding furniture.</p>}
    {edges?.length === 4 && <div className="rounded-lg bg-surface-50 p-3">
      <svg viewBox="0 0 180 100" className="h-24 w-full" role="img" aria-label="Boundary evidence: solid detected walls and dashed unconfirmed edges">
        {[[20,15,160,15],[160,15,160,85],[160,85,20,85],[20,85,20,15]].map(([x1,y1,x2,y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={edges[i] === 'observed-wall' ? '#166534' : '#9ca3af'} strokeWidth="3" strokeDasharray={edges[i] === 'observed-wall' ? undefined : '6 5'} />)}
      </svg>
      <p>Solid: detected wall. Dashed: unconfirmed boundary. Diagram follows the draft’s axes.</p>
    </div>}
    <details><summary className="cursor-pointer">Calibrated camera values</summary>
      <p className="mt-2">Only use calibration for this {photo.width} × {photo.height} working image, in pixels.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">{(['fx','fy','cx','cy'] as const).map((key) => <label key={key}>{key}<input aria-label={`Camera ${key}`} type="number" step="any" className="input-field w-full" value={camera[key]} onChange={(e) => setCamera({...camera, [key]: e.target.value})} /></label>)}</div>
      <button type="button" className="btn-ghost mt-2 text-sm" onClick={() => setCamera({fx:'',fy:'',cx:'',cy:''})}>Clear camera values</button>
    </details>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button type="button" className="btn-secondary w-full text-sm" disabled={busy} onClick={refine}>{busy ? 'Refining…' : 'Refine scan'}</button>
  </details>;
}
