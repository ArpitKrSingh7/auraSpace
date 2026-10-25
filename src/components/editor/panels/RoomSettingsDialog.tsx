'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Dialog } from '@/components/ui/Dialog';

export function RoomSettingsDialog({ onClose }: { onClose: () => void }) {
  const { updateRoom } = useAppStore();
  const project = useAppStore((s) => s.activeProject());
  const [w, setW] = useState(project!.room.width);
  const [d, setD] = useState(project!.room.depth);
  const [h, setH] = useState(project!.room.height);
  const [wallColor, setWallColor] = useState(project!.room.wallColor);
  const [floorColor, setFloorColor] = useState(project!.room.floorColor);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Room dimensions & colors"
      maxWidth="max-w-sm"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateRoom({ width: w, depth: d, height: h, wallColor, floorColor });
          onClose();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="label mb-1 block">Width (m)</label>
            <input
              className="input-field text-sm"
              type="number"
              step={0.1}
              min={1}
              max={40}
              value={w}
              onChange={(e) => setW(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label mb-1 block">Depth (m)</label>
            <input
              className="input-field text-sm"
              type="number"
              step={0.1}
              min={1}
              max={40}
              value={d}
              onChange={(e) => setD(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label mb-1 block">Height (m)</label>
            <input
              className="input-field text-sm"
              type="number"
              step={0.1}
              min={1.5}
              max={12}
              value={h}
              onChange={(e) => setH(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="label mb-1 block">Wall Color</label>
            <input
              type="color"
              value={wallColor}
              onChange={(e) => setWallColor(e.target.value)}
              className="w-full h-10 rounded-lg cursor-pointer"
            />
          </div>
          <div className="flex-1">
            <label className="label mb-1 block">Floor Color</label>
            <input
              type="color"
              value={floorColor}
              onChange={(e) => setFloorColor(e.target.value)}
              className="w-full h-10 rounded-lg cursor-pointer"
            />
          </div>
        </div>
        <div className="bg-surface-50 rounded-xl p-3 text-center">
          <span className="text-xl font-light text-brand-500">
            {(w * d).toFixed(1)} m²
          </span>
          <span className="text-xs text-surface-500 ml-2">floor area</span>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="btn-secondary flex-1 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1 text-sm">
            Apply
          </button>
        </div>
      </form>
    </Dialog>
  );
}
