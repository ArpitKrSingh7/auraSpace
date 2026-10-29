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

  const [width, setWidth] = useState(item.width);
  const [depth, setDepth] = useState(item.depth);
  const [height, setHeight] = useState(item.height);
  const [elevation, setElevation] = useState(item.elevationM ?? 0);
  const mounting = item.mounting ?? 'floor';

  useEffect(() => {
    setWidth(item.width);
    setDepth(item.depth);
    setHeight(item.height);
  }, [item.width, item.depth, item.height]);

  useEffect(() => {
    setElevation(item.elevationM ?? 0);
  }, [item.id, item.elevationM]);

  const applySize = () => {
    if (width > 0 && depth > 0 && height > 0) {
      resizeItem(item.id, width, depth, height);
    }
  };

  return (
    <div className="bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeEmoji[item.type]}</span>
          <div>
            <h3 className="text-sm font-semibold">{item.name}</h3>
            <span
              className={`text-[10px] ${item.source === 'measured' ? 'text-emerald-600' : 'text-amber-600'}`}
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
          {item.source !== 'measured' && <p className="mb-2 text-xs text-amber-700">These dimensions are estimates. Replace them with measurements of your piece.</p>}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] text-surface-500">Width</span>
              <input
                className="input-field text-sm"
                type="number"
                step={0.05}
                min={0.01}
                max={12}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                onBlur={applySize}
              />
            </div>
            <div>
              <span className="text-[10px] text-surface-500">Depth</span>
              <input
                className="input-field text-sm"
                type="number"
                step={0.05}
                min={0.01}
                max={12}
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                onBlur={applySize}
              />
            </div>
            <div>
              <span className="text-[10px] text-surface-500">Height</span>
              <input
                className="input-field text-sm"
                type="number"
                step={0.05}
                min={0.01}
                max={12}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                onBlur={applySize}
              />
            </div>
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
            <p className="mt-2 text-xs text-surface-500">Follows the ceiling. Bottom is {Math.max(0, (project?.room.height ?? 0) - item.height).toFixed(2)} m above the floor.</p>
          ) : (
            <label className="mt-3 block text-xs text-surface-500">
              Height above floor, to bottom (m)
              <input
                className="input-field mt-1 text-sm disabled:opacity-50"
                aria-label="Height above floor, to bottom (meters)"
                type="number"
                step={0.05}
                min={0}
                max={12}
                disabled={item.locked}
                value={elevation}
                onChange={(event) => setElevation(Number(event.target.value))}
                onBlur={() => {
                  if (Number.isFinite(elevation) && elevation >= 0 && elevation <= 12) updateItem(item.id, { elevationM: elevation });
                  else setElevation(item.elevationM ?? 0);
                }}
              />
            </label>
          )}
          {item.locked && <p className="mt-2 text-xs text-surface-500">Unlock this piece to change its placement.</p>}
        </div>

        {/* Position */}
        {item.placed && (
          <div>
            <label className="label mb-2 block">Position</label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] text-surface-500">X</span>
                <input
                  className="input-field text-sm"
                  type="number"
                  step={0.1}
                  value={item.x.toFixed(2)}
                  onChange={(e) =>
                    moveItem(item.id, Number(e.target.value), item.z)
                  }
                />
              </div>
              <div>
                <span className="text-[10px] text-surface-500">Z</span>
                <input
                  className="input-field text-sm"
                  type="number"
                  step={0.1}
                  value={item.z.toFixed(2)}
                  onChange={(e) =>
                    moveItem(item.id, item.x, Number(e.target.value))
                  }
                />
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-surface-200 bg-surface-50 p-3">
          <p className="label mb-3">Rotation</p>
          <RotationControl value={item.rotation} disabled={item.locked}
            onPreview={onRotationPreview} onCancel={onRotationEnd}
            onCommit={(rotation) => {
              if (rotation !== item.rotation) updateItem(item.id, { rotation });
              onRotationEnd?.();
            }} />
          {item.locked && <p className="mt-2 text-xs text-surface-500">Unlock this piece to rotate it.</p>}
        </div>

        {/* Color */}
        <div>
          <label className="label mb-2 block">Color</label>
          <div className="flex items-center gap-2">
            <input
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
            onClick={() => rotateItem(item.id, 45)}
          >
            <RotateCw className="w-3.5 h-3.5" /> Rotate 45°
          </button>
          <button
            className="btn-ghost text-xs flex items-center gap-1"
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
