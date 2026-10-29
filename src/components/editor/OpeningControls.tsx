'use client';

import type { RoomOpening } from '@/domain/types';
import { DoorOpen, Settings2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function OpeningControls({ openings, selectedId, onSelect, onPreview, onCommit, onClose, onSettings }: {
  openings: RoomOpening[];
  selectedId: string;
  onSelect: (id: string) => void;
  onPreview: (angle: number | null) => void;
  onCommit: (patch: Partial<Pick<RoomOpening, 'openAngleDeg' | 'swingDirection'>>) => void;
  onClose: () => void;
  onSettings: () => void;
}) {
  const opening = openings.find((item) => item.id === selectedId);
  const [draft, setDraft] = useState(opening?.openAngleDeg ?? 0);
  const [text, setText] = useState(String(draft));
  const current = useRef(draft), committed = useRef(draft);
  const max = opening?.kind === 'window' ? 90 : 170;
  useEffect(() => {
    const angle = opening?.openAngleDeg ?? 0;
    current.current = committed.current = angle;
    setDraft(angle); setText(String(angle));
  }, [opening?.id, opening?.openAngleDeg]);
  if (!opening) return null;
  const preview = (angle: number) => {
    if (!Number.isFinite(angle)) return;
    const value = Math.max(0, Math.min(max, Math.round(angle)));
    current.current = value; setDraft(value); setText(String(value)); onPreview(value);
  };
  const commit = (angle = current.current) => {
    preview(angle);
    if (current.current !== committed.current) {
      committed.current = current.current;
      onCommit({ openAngleDeg: current.current });
    }
    onPreview(null);
  };
  const names = new Map<string, string>(), counts = { door: 0, window: 0 };
  for (const item of openings) names.set(item.id, `${item.kind === 'door' ? 'Door' : 'Window'} ${++counts[item.kind]}`);
  return (
    <section role="region" aria-label="Door and window controls" className="absolute bottom-24 left-1/2 z-30 w-[min(340px,calc(100%-24px))] -translate-x-1/2 space-y-3 rounded-2xl border border-surface-200 bg-white p-4 shadow-elevated">
      <div className="flex items-center gap-2">
        <DoorOpen size={18} className="shrink-0 text-brand-600" />
        <label className="flex-1">
          <span className="sr-only">Selected door or window</span>
          <select className="w-full bg-transparent text-sm font-semibold outline-none" value={opening.id} onChange={(event) => onSelect(event.target.value)}>
            {openings.map((item) => <option key={item.id} value={item.id}>{names.get(item.id)} · {item.wall} wall</option>)}
          </select>
        </label>
        <button type="button" className="rounded-lg p-1.5 hover:bg-surface-100" aria-label="Close door and window controls" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="flex gap-2">
        <button type="button" className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${draft === 0 ? 'bg-brand-100 text-brand-800' : 'bg-surface-100 text-surface-700'}`} aria-label={`Close ${opening.kind}`} onClick={() => commit(0)}>Close</button>
        <button type="button" className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${draft === 90 ? 'bg-brand-100 text-brand-800' : 'bg-surface-100 text-surface-700'}`} aria-label={`Open ${opening.kind}`} onClick={() => commit(90)}>Open 90°</button>
      </div>
      <div className="flex items-center justify-between text-xs">
        <label htmlFor="scene-opening-angle" className="font-medium">Opening angle</label>
        <span className="tabular-nums text-brand-700">{draft === 0 ? 'Closed' : `${draft}° open`}</span>
      </div>
      <input id="scene-opening-angle" aria-label="Door or window opening angle" type="range" min={0} max={max} step={1} value={draft}
        className="w-full touch-none accent-[#3e6658]" onChange={(event) => preview(Number(event.target.value))}
        onPointerUp={() => commit()} onKeyUp={(event) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commit(); }}
        onPointerCancel={() => { preview(committed.current); onPreview(null); }} onBlur={() => commit()} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-surface-600">Degrees
          <input type="number" inputMode="numeric" min={0} max={max} step={1} className="input-field mt-1 w-full text-sm" aria-label="Exact door or window angle" value={text}
            onChange={(event) => setText(event.target.value)} onBlur={() => { if (text.trim() && Number.isFinite(Number(text))) commit(Number(text)); else setText(String(draft)); }}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        </label>
        <label className="text-xs text-surface-600">Swing direction
          <select className="input-field mt-1 w-full text-sm" value={opening.swingDirection} onChange={(event) => onCommit({ swingDirection: event.target.value as 'inward' | 'outward' })}>
            <option value="inward">Inward</option><option value="outward">Outward</option>
          </select>
        </label>
      </div>
      <button type="button" className="flex items-center gap-1.5 text-xs font-medium text-brand-700" onClick={onSettings}><Settings2 size={14} />Position, size & hinge</button>
    </section>
  );
}
