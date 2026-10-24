'use client';

import React from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { validatePlacement } from '@/src/domain/geometry';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Slider } from '../ui/Slider';
import { ColorPicker } from '../ui/ColorPicker';

const sourceLabels: Record<string, string> = {
  estimated: '≈ Estimated',
  measured: '📏 Measured',
  sample: '📐 Sample',
};

export function ItemInspector() {
  const project = useAppStore(s => s.getActiveProject());
  const selectedId = useAppStore(s => s.selectedId);
  const select = useAppStore(s => s.select);
  const updateItem = useAppStore(s => s.updateItem);
  const removeItem = useAppStore(s => s.removeItem);
  const duplicateItem = useAppStore(s => s.duplicateItem);
  const lockItem = useAppStore(s => s.lockItem);
  const rotateItem = useAppStore(s => s.rotateItem);
  const resizeItem = useAppStore(s => s.resizeItem);
  const settings = useAppStore(s => s.settings);

  if (!project || !selectedId) return null;
  const item = project.items.find(i => i.id === selectedId);
  if (!item) return null;

  const warnings = validatePlacement(item, project.room, project.items);
  const formatDim = (m: number) => settings.units === 'm' ? m.toFixed(2) : Math.round(m * 100).toString();
  const parseDim = (val: string) => settings.units === 'm' ? parseFloat(val) || 0 : (parseFloat(val) || 0) / 100;

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text truncate">{item.name}</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted text-text-muted whitespace-nowrap">
            {sourceLabels[item.source] ?? item.source}
          </span>
        </div>
        <button
          onClick={() => select(null)}
          className="touch-target flex items-center justify-center text-text-muted hover:text-text"
          aria-label="Deselect"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-warning-light bg-warning/10 rounded-btn px-2 py-1.5">
              <span>⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Dimensions */}
      <div className="grid grid-cols-3 gap-2">
        <Input
          label={`W (${settings.units})`}
          type="number"
          value={formatDim(item.width)}
          onChange={e => {
            const v = parseDim(e.target.value);
            if (v > 0 && v <= 20) resizeItem(item.id, v, item.depth, item.height);
          }}
        />
        <Input
          label={`D (${settings.units})`}
          type="number"
          value={formatDim(item.depth)}
          onChange={e => {
            const v = parseDim(e.target.value);
            if (v > 0 && v <= 20) resizeItem(item.id, item.width, v, item.height);
          }}
        />
        <Input
          label={`H (${settings.units})`}
          type="number"
          value={formatDim(item.height)}
          onChange={e => {
            const v = parseDim(e.target.value);
            if (v > 0 && v <= 12) resizeItem(item.id, item.width, item.depth, v);
          }}
        />
      </div>

      {/* Rotation */}
      <Slider
        label="Rotation"
        value={item.rotation}
        onChange={r => updateItem(item.id, { rotation: Math.round(r) })}
        min={0}
        max={360}
        step={5}
        suffix="°"
      />

      {/* Quick rotation */}
      <div className="flex gap-1.5">
        {[45, 90, -45, -90].map(deg => (
          <Button
            key={deg}
            size="sm"
            variant="secondary"
            onClick={() => rotateItem(item.id, deg)}
          >
            {deg > 0 ? '+' : ''}{deg}°
          </Button>
        ))}
      </div>

      {/* Color */}
      <ColorPicker
        label="Color"
        value={item.color}
        onChange={c => updateItem(item.id, { color: c })}
      />

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant={item.locked ? 'primary' : 'secondary'}
          onClick={() => lockItem(item.id)}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {item.locked ? (
                <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></>
              ) : (
                <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 019.9-1" /></>
              )}
            </svg>
          }
          fullWidth
        >
          {item.locked ? 'Locked' : 'Lock'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => duplicateItem(item.id)} fullWidth>
          Duplicate
        </Button>
        <Button size="sm" variant="danger" onClick={() => removeItem(item.id)} fullWidth>
          Delete
        </Button>
      </div>
    </div>
  );
}
