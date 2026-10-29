'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { CATALOG } from '@/domain/catalog';
import { ChevronUp, ChevronDown, Plus, Box, Search } from 'lucide-react';
import { furnitureGroups, matchesFurniture, typeEmoji, type FurnitureGroup } from '../furniture-icons';

export function FurnitureTray() {
  const { startPlacing, trayOpen, setTrayOpen, addCustomItem } = useAppStore();
  const project = useAppStore((s) => s.activeProject());
  const unplaced = project?.items.filter((i) => !i.placed) ?? [];
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('Custom object');
  const [customW, setCustomW] = useState(0.8);
  const [customD, setCustomD] = useState(0.6);
  const [customH, setCustomH] = useState(0.8);
  const [customColor, setCustomColor] = useState('#A4A8B8');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<FurnitureGroup>('All');
  const entries = CATALOG.filter((entry) => entry.type !== 'custom' && matchesFurniture(entry.type, entry.name, query, group));

  if (!trayOpen) return null;

  return (
    <div
      className="bottom-sheet animate-slide-up"
      role="region"
      aria-label="Furniture library"
    >
      {/* Handle */}
      <button
        className="w-full flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing"
        onClick={() => setTrayOpen(!trayOpen)}
      >
        <div className="bottom-sheet-handle" />
        <div className="flex items-center gap-2 text-xs text-surface-500">
          {trayOpen ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
          <span>
            Furniture{' '}
            {unplaced.length > 0 ? `(${unplaced.length} in tray)` : ''}
          </span>
        </div>
      </button>

      {/* Content */}
      <div
        className="px-4 pb-6 overflow-y-auto"
        style={{ maxHeight: 'calc(70vh - 3.5rem)' }}
      >
        {/* Unplaced items */}
        {unplaced.length > 0 && (
          <div className="mb-4">
            <h4 className="label mb-2">In Tray</h4>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {unplaced.map((item) => (
                <button
                  key={item.id}
                  className="tray-card flex-shrink-0 w-32 bg-surface-50 rounded-xl p-3 text-center hover:bg-brand-50 transition-colors border border-surface-200"
                  aria-label={`Place ${item.name}`}
                  onClick={() => {
                    const project = useAppStore.getState().activeProject();
                    if (project) {
                      useAppStore.setState({
                        placingItem: item,
                        placingType: item.type,
                        selectedItemId: null,
                        selectedId: null,
                      });
                      setTrayOpen(false);
                    }
                  }}
                >
                  <div className="text-2xl mb-1" aria-hidden="true">{typeEmoji[item.type]}</div>
                  <div className="text-xs font-medium leading-4 break-words">
                    {item.name}
                  </div>
                  <div className="text-[9px] text-surface-500">
                    {(item.width * 100).toFixed(0)}×
                    {(item.depth * 100).toFixed(0)}×{(item.height * 100).toFixed(0)} cm
                  </div>
                  <div className="mt-1 text-[10px] text-surface-500">{item.mounting ?? 'floor'} placement</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Catalog */}
        <h4 className="label mb-2">Add Furniture</h4>
        <p className="mb-3 text-xs text-surface-500">Library dimensions are estimates. Check your own width, depth and height before planning.</p>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-3 w-4 h-4 text-surface-400" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search furniture"
            placeholder="Search furniture, e.g. almirah, study table, AC"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="input-field pl-9 text-sm"
          />
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Furniture groups">
          {(Object.keys(furnitureGroups) as FurnitureGroup[]).map((name) => (
            <button
              key={name}
              aria-pressed={group === name}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${group === name ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'}`}
              onClick={() => setGroup(name)}
            >{name}</button>
          ))}
        </div>
        <p className="mb-2 text-[10px] text-surface-500">{entries.length} {entries.length === 1 ? 'piece' : 'pieces'} · W × D × H in cm</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {entries.map((entry) => (
            <button
              key={entry.type}
              className="tray-card flex flex-col items-center gap-1 p-3 rounded-xl bg-surface-50 hover:bg-brand-50 transition-colors border border-surface-200 hover:border-brand-200"
              aria-label={`Add ${entry.name}, ${entry.mounting ?? 'floor'} placement`}
              onClick={() => startPlacing(entry.type)}
            >
              <div className="text-2xl" aria-hidden="true">{typeEmoji[entry.type]}</div>
              <div className="text-xs font-medium leading-4 min-h-8 flex items-center text-center break-words">
                {entry.name}
              </div>
              <div className="text-[10px] text-surface-500">
                {(entry.width * 100).toFixed(0)}×
                {(entry.depth * 100).toFixed(0)}×{(entry.height * 100).toFixed(0)}
              </div>
              <span className="mt-1 rounded-full bg-white px-2 py-0.5 text-[9px] capitalize text-surface-600">{entry.mounting ?? 'floor'}</span>
            </button>
          ))}
        </div>
        {entries.length === 0 && <p role="status" className="rounded-xl border border-dashed border-surface-200 p-4 text-sm text-surface-500">No library pieces match. Try another search or add your own object below.</p>}

        {/* Custom Object */}
        <div className="mt-4">
          <button
            className="w-full btn-secondary text-xs flex items-center justify-center gap-2"
            onClick={() => setShowCustom(!showCustom)}
          >
            <Box className="w-3.5 h-3.5" />
            {showCustom ? 'Cancel' : 'Add Custom Object'}
          </button>

          {showCustom && (
            <div className="mt-3 bg-surface-50 rounded-xl p-4 space-y-3 animate-slide-down">
              <p className="text-xs text-surface-500">Use a cuboid for any unusual object. Start with a box or a thin board, then enter your own dimensions (0.01–12 m).</p>
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" onClick={() => { setCustomName('Custom box'); setCustomW(0.8); setCustomD(0.6); setCustomH(0.8); }}>Box preset</button>
                <button className="btn-ghost text-xs" onClick={() => { setCustomName('Custom board'); setCustomW(1); setCustomD(0.03); setCustomH(0.8); }}>Board preset</button>
              </div>
              <input
                className="input-field text-sm"
                placeholder="Object name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-surface-500">W (m)</span>
                  <input
                    className="input-field text-sm"
                    type="number"
                    step={0.01}
                    min={0.01}
                    max={12}
                    value={customW}
                    onChange={(e) => setCustomW(Number(e.target.value))}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-surface-500">D (m)</span>
                  <input
                    className="input-field text-sm"
                    type="number"
                    step={0.01}
                    min={0.01}
                    max={12}
                    value={customD}
                    onChange={(e) => setCustomD(Number(e.target.value))}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-surface-500">H (m)</span>
                  <input
                    className="input-field text-sm"
                    type="number"
                    step={0.01}
                    min={0.01}
                    max={12}
                    value={customH}
                    onChange={(e) => setCustomH(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer"
                />
                <button
                  className="btn-primary text-xs flex-1"
                  onClick={() => {
                    addCustomItem(
                      customName,
                      customW,
                      customD,
                      customH,
                      customColor,
                    );
                    if (
                      customName.trim() &&
                      [customW, customD, customH].every(
                        (v) => Number.isFinite(v) && v >= 0.01 && v <= 12,
                      )
                    )
                      setShowCustom(false);
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1 inline" /> Add to tray
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
