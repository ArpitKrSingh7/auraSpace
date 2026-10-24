'use client';

import React from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { CATALOG } from '@/src/domain/catalog';
import type { FurnitureType } from '@/src/domain/types';

const typeIcons: Record<FurnitureType, string> = {
  sofa: '🛋️',
  chair: '💺',
  bed: '🛏️',
  table: '🪑',
  cabinet: '🗄️',
  plant: '🪴',
  rug: '🧶',
  custom: '📦',
};

export function FurnitureTray() {
  const project = useAppStore(s => s.getActiveProject());
  const placingType = useAppStore(s => s.placingType);
  const setPlacing = useAppStore(s => s.setPlacing);
  const addItem = useAppStore(s => s.addItem);
  const settings = useAppStore(s => s.settings);
  const addToast = useAppStore(s => s.addToast);

  if (!project) return null;

  const formatDim = (m: number) => {
    if (settings.units === 'm') return `${m.toFixed(1)}m`;
    return `${Math.round(m * 100)}cm`;
  };

  const handleAdd = (entry: typeof CATALOG[0]) => {
    if (placingType === entry.type) {
      setPlacing(null);
      return;
    }
    // For non-custom items, directly add and place
    addItem(entry.type, {
      x: project.room.width / 2,
      z: project.room.depth / 2,
      placed: true,
    });
    addToast(`Added ${entry.name}`, 'success');
  };

  return (
    <div className="px-3 pb-2">
      {/* Title */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text">Furniture</h3>
        <span className="text-xs text-text-muted">
          {project.items.filter(i => i.placed).length} placed
        </span>
      </div>

      {/* Horizontal scroll */}
      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
        {CATALOG.map(entry => {
          const isActive = placingType === entry.type;
          return (
            <button
              key={entry.type}
              onClick={() => handleAdd(entry)}
              className={[
                'flex-shrink-0 flex flex-col items-center p-3 rounded-card border-2 transition-all duration-200',
                'w-[100px]',
                isActive
                  ? 'border-primary bg-primary-50 shadow-soft'
                  : 'border-surface-dim bg-surface-warm hover:border-surface-dim hover:shadow-soft',
              ].join(' ')}
            >
              <span className="text-2xl mb-1">{typeIcons[entry.type]}</span>
              <span className={[
                'text-xs font-medium truncate w-full text-center',
                isActive ? 'text-primary' : 'text-text',
              ].join(' ')}>
                {entry.name}
              </span>
              <span className="text-[10px] text-text-muted mt-0.5">
                {formatDim(entry.width)} × {formatDim(entry.depth)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
