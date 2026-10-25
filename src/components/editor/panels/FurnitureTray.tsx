'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { CATALOG } from '@/domain/catalog';
import { ChevronUp, ChevronDown, Plus, Box } from 'lucide-react';
import { typeEmoji } from '../furniture-icons';

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
                  className="tray-card flex-shrink-0 w-24 bg-surface-50 rounded-xl p-3 text-center hover:bg-brand-50 transition-colors border border-surface-200"
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
                  <div className="text-2xl mb-1">{typeEmoji[item.type]}</div>
                  <div className="text-[10px] font-medium truncate">
                    {item.name}
                  </div>
                  <div className="text-[9px] text-surface-500">
                    {(item.width * 100).toFixed(0)}×
                    {(item.depth * 100).toFixed(0)} cm
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Catalog */}
        <h4 className="label mb-2">Add Furniture</h4>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {CATALOG.map((entry) => (
            <button
              key={entry.type}
              className="tray-card flex flex-col items-center p-3 rounded-xl hover:bg-brand-50 transition-colors border border-transparent hover:border-brand-200"
              onClick={() => startPlacing(entry.type)}
            >
              <div className="text-2xl mb-1">{typeEmoji[entry.type]}</div>
              <div className="text-[10px] font-medium">
                {entry.name.split(' ')[0]}
              </div>
              <div className="text-[9px] text-surface-400">
                {(entry.width * 100).toFixed(0)}×
                {(entry.depth * 100).toFixed(0)}
              </div>
            </button>
          ))}
        </div>

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
                    step={0.1}
                    min={0.1}
                    value={customW}
                    onChange={(e) => setCustomW(Number(e.target.value))}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-surface-500">D (m)</span>
                  <input
                    className="input-field text-sm"
                    type="number"
                    step={0.1}
                    min={0.1}
                    value={customD}
                    onChange={(e) => setCustomD(Number(e.target.value))}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-surface-500">H (m)</span>
                  <input
                    className="input-field text-sm"
                    type="number"
                    step={0.1}
                    min={0.1}
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
