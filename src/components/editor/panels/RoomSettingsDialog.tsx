'use client';

import { useEffect, useMemo, useState } from 'react';
import { DoorOpen, Plus, Trash2, Square } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { Dialog } from '@/components/ui/Dialog';
import { getRoomOpenings } from '@/domain/geometry';
import { newId } from '@/domain/catalog';
import { validateRoom } from '@/domain/validation';
import type { Room, RoomOpening } from '@/domain/types';

const walls = ['back', 'right', 'front', 'left'] as const;
const wallNames = { back: 'Back wall', right: 'Right wall', front: 'Front wall', left: 'Left wall' };
const wallLength = (room: Room, wall: RoomOpening['wall']) => wall === 'front' || wall === 'back' ? room.width : room.depth;

export function RoomSettingsDialog({ onClose, onPreview, initialOpeningId }: {
  onClose: () => void;
  onPreview?: (room: Room | null) => void;
  initialOpeningId?: string | null;
}) {
  const project = useAppStore((state) => state.activeProject());
  const [room, setRoom] = useState<Room>(() => ({ ...project!.room, openings: getRoomOpenings(project!.room) }));
  const [tab, setTab] = useState<'room' | 'openings'>(initialOpeningId ? 'openings' : 'room');
  const [selected, setSelected] = useState<string | null>(initialOpeningId ?? room.openings?.[0]?.id ?? null);
  const [error, setError] = useState('');
  const openings = room.openings ?? [];
  const opening = openings.find((candidate) => candidate.id === selected);
  const names = useMemo(() => {
    const counts = { door: 0, window: 0 };
    return new Map(openings.map((item) => [item.id, `${item.kind === 'door' ? 'Door' : 'Window'} ${++counts[item.kind]}`]));
  }, [openings]);
  useEffect(() => {
    try { validateRoom(room); onPreview?.(room); }
    catch { onPreview?.(null); }
  }, [room, onPreview]);
  const change = (patch: Partial<Room>) => {
    setError('');
    setRoom((current) => {
      const next = { ...current, ...patch };
      for (const name of ['width', 'depth', 'height'] as const)
        if (patch[name] !== undefined)
          next.dimensionSources = { ...next.dimensionSources, [name]: 'user-measured' };
      // The old single-door field stays valid for older exports even though
      // explicit openings are now the room's authoritative opening list.
      const length = wallLength(next, next.door.wall);
      const width = Math.min(next.door.width, length);
      next.door = { ...next.door, width, offset: Math.max(0, Math.min(next.door.offset, length - width)) };
      return next;
    });
  };
  const edit = (patch: Partial<RoomOpening>) => {
    setError('');
    setRoom((current) => ({ ...current, openings: current.openings!.map((item) => item.id === selected ? { ...item, ...patch } : item) }));
  };
  const add = (kind: RoomOpening['kind']) => {
    for (const wall of walls) {
      const length = wallLength(room, wall);
      const width = Math.min(kind === 'door' ? 0.9 : 1.2, length - 0.2);
      let offset = 0.1;
      for (const used of openings.filter((item) => item.wall === wall).sort((a, b) => a.offset - b.offset)) {
        if (offset + width <= used.offset - 0.1) break;
        offset = Math.max(offset, used.offset + used.width + 0.1);
      }
      if (width >= 0.1 && offset + width <= length - 0.05) {
        const item: RoomOpening = {
          id: newId('opening'), kind, wall, offset, width,
          height: Math.min(kind === 'door' ? 2.1 : 1.1, room.height - (kind === 'door' ? 0 : 1)),
          sillHeight: kind === 'door' ? 0 : 1,
          hingeSide: 'start', swingDirection: 'inward', openAngleDeg: 0,
        };
        change({ openings: [...openings, item] });
        setSelected(item.id);
        return;
      }
    }
    setError('There is no free wall span. Move or resize an existing opening first.');
  };
  const numeric = (label: string, value: number, onChange: (value: number) => void, min = 0, max = 40) => (
    <label className="block min-w-0 text-xs font-medium text-surface-600">
      {label}
      <input className="input-field mt-1 w-full text-sm" type="number" step={0.01} min={min} max={max}
        value={Number.isFinite(value) ? value : ''} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
  const line = (item: RoomOpening) => {
    const x = 30, y = 18, w = 180, h = 116;
    const length = wallLength(room, item.wall);
    const start = item.offset / length;
    const end = (item.offset + item.width) / length;
    if (item.wall === 'back' || item.wall === 'front') {
      const py = item.wall === 'back' ? y : y + h;
      return { x1: x + w * start, y1: py, x2: x + w * end, y2: py };
    }
    const px = item.wall === 'left' ? x : x + w;
    return { x1: px, y1: y + h * start, x2: px, y2: y + h * end };
  };
  return (
    <Dialog open onClose={onClose} title="Your room" maxWidth="max-w-lg">
      <form className="space-y-4 px-5 pb-5" onSubmit={(event) => {
        event.preventDefault();
        try {
          const checked = validateRoom(room);
          useAppStore.getState().updateRoom(checked);
          onPreview?.(null);
          onClose();
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check room measurements.'); }
      }}>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-100 p-1">
          <button type="button" className={`rounded-lg px-3 py-2 text-sm ${tab === 'room' ? 'bg-white shadow-soft' : 'text-surface-500'}`} onClick={() => setTab('room')}>Dimensions & finishes</button>
          <button type="button" className={`rounded-lg px-3 py-2 text-sm ${tab === 'openings' ? 'bg-white shadow-soft' : 'text-surface-500'}`} onClick={() => setTab('openings')}>Doors & windows ({openings.length})</button>
        </div>
        {tab === 'room' ? <>
          <div className="grid grid-cols-3 gap-3">
            {numeric('Width (m)', room.width, (width) => change({ width }), 1)}
            {numeric('Depth (m)', room.depth, (depth) => change({ depth }), 1)}
            {numeric('Height (m)', room.height, (height) => change({ height }), 1.5, 12)}
          </div>
          <p className="text-xs leading-relaxed text-surface-500">Use measured dimensions for reliable fit. Furniture stays at its actual size when you edit the room.</p>
          <div className="grid grid-cols-2 gap-4">
            {(['wallColor', 'floorColor'] as const).map((surface) => <label key={surface} className="block text-xs font-medium text-surface-600">
              {surface === 'wallColor' ? 'Wall finish' : 'Floor finish'}
              <input type="color" aria-label={surface === 'wallColor' ? 'Wall finish' : 'Floor finish'} value={room[surface]} onChange={(event) => change({ [surface]: event.target.value })} className="mt-2 h-10 w-full cursor-pointer rounded-lg" />
            </label>)}
          </div>
          <div className="rounded-xl bg-surface-50 p-4 text-center"><span className="text-2xl font-light text-brand-600">{(room.width * room.depth).toFixed(1)} m²</span><span className="ml-2 text-xs text-surface-500">floor area</span></div>
          <button className="btn-secondary w-full text-sm" type="button" onClick={() => setTab('openings')}>Edit doors & windows →</button>
        </> : <>
          <div className="flex items-center gap-3 rounded-xl border border-surface-200 bg-surface-50 p-2">
            <svg viewBox="0 0 240 155" className="h-32 w-48 shrink-0 max-[400px]:w-36" aria-label="Opening positions on room walls" role="img">
              <rect x="30" y="18" width="180" height="116" rx="2" fill="#f6f3ec" stroke="#a4afa4" strokeWidth="3" />
              <text x="120" y="82" textAnchor="middle" fill="#798776" fontSize="11">Your room</text>
              <text x="120" y="11" textAnchor="middle" fill="#798776" fontSize="8">BACK</text>
              <text x="120" y="148" textAnchor="middle" fill="#798776" fontSize="8">FRONT</text>
              {openings.map((item) => <line key={item.id} {...line(item)} stroke={selected === item.id ? '#355e4e' : item.kind === 'window' ? '#81acba' : '#c49871'} strokeWidth={selected === item.id ? 8 : 6} strokeLinecap="round" />)}
            </svg>
            <p className="text-xs leading-relaxed text-surface-500">Choose an opening below. Position is measured from the left end of a horizontal wall, or the back end of a side wall.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {openings.map((item) => <button key={item.id} type="button" aria-pressed={selected === item.id} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${selected === item.id ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-surface-200 text-surface-500'}`} onClick={() => setSelected(item.id)}>
              {item.kind === 'door' ? <DoorOpen size={14} /> : <Square size={14} />}{names.get(item.id)}
            </button>)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={openings.length >= 40} onClick={() => add('door')} className="btn-secondary text-xs"><Plus size={14} /> Add door</button>
            <button type="button" disabled={openings.length >= 40} onClick={() => add('window')} className="btn-secondary text-xs"><Plus size={14} /> Add window</button>
          </div>
          {opening ? <div className="space-y-3 rounded-xl border border-surface-200 p-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{names.get(opening.id)}</h3><button type="button" aria-label={`Remove ${names.get(opening.id)}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => { const remaining = openings.filter((item) => item.id !== opening.id); change({ openings: remaining }); setSelected(remaining[0]?.id ?? null); }}><Trash2 size={15} /></button></div>
            <label className="block text-xs font-medium text-surface-600">Wall<select aria-label="Opening wall" className="input-field mt-1 w-full text-sm" value={opening.wall} onChange={(event) => edit({ wall: event.target.value as RoomOpening['wall'] })}>{walls.map((wall) => <option key={wall} value={wall}>{wallNames[wall]}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3">
              {numeric('Position along wall (m)', opening.offset, (offset) => edit({ offset }), 0, wallLength(room, opening.wall))}
              {numeric('Width (m)', opening.width, (width) => edit({ width }), 0.1, 10)}
              {numeric('Height (m)', opening.height, (height) => edit({ height }), 0.1, room.height)}
              {numeric('Height above floor (m)', opening.sillHeight, (sillHeight) => edit({ sillHeight }), 0, room.height)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-surface-600">Hinge side<select className="input-field mt-1 w-full text-sm" value={opening.hingeSide} onChange={(event) => edit({ hingeSide: event.target.value as 'start' | 'end' })}><option value="start">Start edge</option><option value="end">End edge</option></select></label>
              <label className="block text-xs font-medium text-surface-600">Opens toward<select className="input-field mt-1 w-full text-sm" value={opening.swingDirection} onChange={(event) => edit({ swingDirection: event.target.value as 'inward' | 'outward' })}><option value="inward">Inside room</option><option value="outward">Outside room</option></select></label>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <div className="mb-2 flex items-center justify-between"><label className="text-xs font-medium" htmlFor="opening-angle">Opening angle</label><span className="text-sm font-semibold tabular-nums text-brand-700">{opening.openAngleDeg}°</span></div>
              <input id="opening-angle" aria-label="Opening angle" type="range" min={0} max={opening.kind === 'door' ? 170 : 90} step={1} value={opening.openAngleDeg} onChange={(event) => edit({ openAngleDeg: Number(event.target.value) })} className="w-full accent-[#3e6658]" />
              <div className="mt-2 flex gap-2">{[0, 45, 90].map((angle) => <button key={angle} type="button" className="rounded-lg bg-white px-3 py-1.5 text-xs shadow-soft" onClick={() => edit({ openAngleDeg: angle })}>{angle === 0 ? 'Close' : angle === 90 ? 'Open' : '45°'}</button>)}<input aria-label="Exact opening angle" type="number" className="input-field ml-auto w-20 text-sm" min={0} max={opening.kind === 'door' ? 170 : 90} value={opening.openAngleDeg} onChange={(event) => edit({ openAngleDeg: Number(event.target.value) })} /></div>
            </div>
            <p className="text-[10px] leading-relaxed text-surface-500">Preview a side-hinged panel at any angle. Door clearance is an approximate planning check; the original photo cannot reveal hidden hinges or wall structure.</p>
          </div> : <p className="py-3 text-center text-sm text-surface-500">Add a door or window to start.</p>}
        </>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        <div className="flex gap-3 border-t border-surface-100 pt-3"><button type="button" className="btn-secondary flex-1 text-sm" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary flex-1 text-sm">Save room</button></div>
      </form>
    </Dialog>
  );
}
