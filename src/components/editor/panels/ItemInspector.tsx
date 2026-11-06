'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import type { FurnitureItem } from '@/domain/types';
import { validatePlacement } from '@/domain/geometry';
import { ChevronDown, RotateCw, Trash2, Copy, Lock, Unlock, X, AlertTriangle } from 'lucide-react';
import { typeEmoji } from '../furniture-icons';
import { RotationControl } from '../RotationControl';

export function ItemInspector({
  item,
  onClose,
  onRotationPreview,
  onRotationEnd,
}: {
  item: FurnitureItem;
  onClose: () => void;
  onRotationPreview?: (angle: number) => void;
  onRotationEnd?: () => void;
}) {
  const {
    rotateItem,
    resizeItem,
    recolorItem,
    lockItem,
    unlockItem,
    duplicateItem,
    removeItem,
    returnToTray,
    moveItem,
    updateItem,
  } = useAppStore();
  const project = useAppStore((s) => s.activeProject());
  const warnings = project
    ? validatePlacement(item, project.room, project.items)
    : [];

  const mounting = item.mounting ?? 'floor';

  return (
    <div className="bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeEmoji[item.type]}</span>
          <div>
            <h3 className="text-sm font-semibold">{item.name}</h3>
            <span
              className={`text-xs ${item.source === 'measured' ? 'text-emerald-600' : 'text-amber-600'}`}
            >
              {item.source === 'measured'
                ? '📏 Measured'
                : item.source === 'estimated'
                  ? '🔍 Estimated'
                  : '📐 Sample'}
            </span>
          </div>
        </div>
        <button
          className="p-2 rounded-lg hover:bg-surface-100"
          onClick={onClose}
          aria-label="Close item details"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
          {warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-xs text-amber-700"
            >
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">
        {/* Dimensions */}
        <div>
          <label className="label mb-2 block">Dimensions (meters)</label>
          <div className="grid grid-cols-3 gap-2">
            {(['width', 'depth', 'height'] as const).map((axis) => (
              <label key={`${item.id}-${axis}`} className="text-xs capitalize text-surface-500">{axis}
                <DraftNumber value={item[axis]} label={`${axis} (meters)`} min={0.01} max={12} step={0.05} disabled={item.locked}
                  onCommit={(value) => resizeItem(item.id, axis === 'width' ? value : item.width, axis === 'depth' ? value : item.depth, axis === 'height' ? value : item.height)} />
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="label mb-2">Placement surface</p>
          <div className="grid grid-cols-3 gap-2">
            {(['floor', 'wall', 'ceiling'] as const).map((surface) => (
              <button
                key={surface}
                disabled={item.locked}
                aria-pressed={mounting === surface}
                className={`rounded-lg border py-2 text-xs capitalize disabled:opacity-40 ${mounting === surface ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-surface-200 text-surface-600'}`}
                onClick={() => updateItem(item.id, { mounting: surface })}
              >{surface}</button>
            ))}
          </div>
          {mounting === 'ceiling' ? (
            <p className="mt-2 text-xs text-surface-500">Bottom: {Math.max(0, (project?.room.height ?? 0) - item.height).toFixed(2)} m</p>
          ) : (
            <label className="mt-3 block text-xs text-surface-500">
              Bottom height (m)
              <DraftNumber key={item.id} value={item.elevationM ?? 0} label="Height above floor, to bottom (meters)"
                min={0} max={Math.max(0, (project?.room.height ?? 12) - item.height)} step={0.05} disabled={item.locked}
                onCommit={(value) => updateItem(item.id, { elevationM: value })} />
            </label>
          )}

        </div>

        {/* Position */}
        {item.placed && (
          <div>
            <label className="label mb-2 block">Position</label>
            <div className="grid grid-cols-2 gap-2">
              {(['x', 'z'] as const).map((axis) => (
                <label key={`${item.id}-${axis}`} className="text-xs uppercase text-surface-500">{axis} (m)
                  <DraftNumber value={item[axis]} label={`Position ${axis} (meters)`} min={0}
                    max={axis === 'x' ? project?.room.width ?? 30 : project?.room.depth ?? 30} step={0.1} disabled={item.locked}
                    onCommit={(value) => moveItem(item.id, axis === 'x' ? value : item.x, axis === 'z' ? value : item.z)} />
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-surface-200 bg-surface-50 p-3">
          <p className="label mb-3">Rotation</p>
          <RotationControl value={item.rotation} disabled={item.locked || mounting === 'wall'}
            onPreview={onRotationPreview} onCancel={onRotationEnd}
            onCommit={(rotation) => {
              if (rotation !== item.rotation) updateItem(item.id, { rotation });
              onRotationEnd?.();
            }} />

        </div>

        {/* Color */}
        <div>
          <label className="label mb-2 block">Color</label>
          <div className="flex items-center gap-2">
            <input
              aria-label="Furniture color"
              type="color"
              value={item.color}
              onChange={(e) => recolorItem(item.id, e.target.value)}
              className="w-10 h-10 rounded-lg border border-surface-200 cursor-pointer"
            />
            <span className="text-xs text-surface-500 font-mono">
              {item.color}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-ghost text-xs flex items-center gap-1"
            disabled={item.locked || mounting === 'wall'}
            onClick={() => rotateItem(item.id, 45)}
          >
            <RotateCw className="w-3.5 h-3.5" /> Rotate 45°
          </button>
          <button
            className="btn-ghost text-xs flex items-center gap-1"
            disabled={item.locked || mounting === 'wall'}
            onClick={() => rotateItem(item.id, 90)}
          >
            <RotateCw className="w-3.5 h-3.5" /> 90°
          </button>
          <button
            className="btn-ghost text-xs flex items-center gap-1"
            onClick={() => duplicateItem(item.id)}
          >
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </button>
          <button
            className="btn-ghost text-xs flex items-center gap-1"
            onClick={() =>
              item.locked ? unlockItem(item.id) : lockItem(item.id)
            }
          >
            {item.locked ? (
              <Unlock className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            {item.locked ? 'Unlock' : 'Lock'}
          </button>
          {item.placed && (
            <button
              className="btn-ghost text-xs flex items-center gap-1 text-amber-600"
              disabled={item.locked}
              onClick={() => returnToTray(item.id)}
            >
              <ChevronDown className="w-3.5 h-3.5" /> To Tray
            </button>
          )}
          <button
            className="btn-ghost text-xs flex items-center gap-1 text-red-500"
            onClick={() => {
              removeItem(item.id);
              onClose();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// Keep incomplete input local. A confirmed field change creates one undo step.
function DraftNumber({ value, label, min, max, step, disabled, onCommit }: {
  value: number; label: string; min: number; max: number; step: number; disabled?: boolean; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  return <input type="number" className="input-field mt-1 text-sm disabled:opacity-50" aria-label={label}
    min={min} max={max} step={step} disabled={disabled} value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.value = String(value); e.currentTarget.blur(); }
      if (e.key === 'Enter') e.currentTarget.blur();
    }}
    onBlur={(e) => {
      const raw = e.currentTarget.value, next = Number(raw);
      setDraft(String(Number(value.toFixed(3))));
      if (raw.trim() && Number.isFinite(next) && next >= min && next <= max && next !== value) onCommit(next);
    }} />;
}
