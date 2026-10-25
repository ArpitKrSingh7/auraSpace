'use client';

import React from 'react';

const PRESET_COLORS = [
  '#8C9D88', '#C9977D', '#B58A60', '#C9B9A5', '#A7835E',
  '#557761', '#D6C5AA', '#A4A8B8', '#EDE7DE', '#C9A982',
  '#7C8A6B', '#D2B49A', '#9B8577', '#BDB8A7', '#6B7C72',
  '#E8CDB0', '#AA8866', '#BCAA99', '#708070', '#D4C4A8',
];

interface ColorPickerProps {
  label?: string;
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-text-secondary">{label}</label>}
      <div className="flex items-center gap-2">
        <div className="flex flex-wrap gap-1.5 flex-1">
          {PRESET_COLORS.map(color => (
            <button
              key={color}
              className={[
                'w-6 h-6 rounded-full border-2 transition-all duration-150',
                value === color ? 'border-primary scale-110 shadow-soft' : 'border-transparent hover:scale-105',
              ].join(' ')}
              style={{ backgroundColor: color }}
              onClick={() => onChange(color)}
              aria-label={`Color ${color}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-8 h-8 rounded-btn border border-surface-dim cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
