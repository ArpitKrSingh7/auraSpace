'use client';

import React from 'react';

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  suffix = '',
}: SliderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-secondary">
          {label}
        </label>
        <span className="text-xs font-mono text-text-muted tabular-nums">
          {value.toFixed(step < 1 ? 1 : 0)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-surface-dim rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-soft
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
          [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
          [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2
          [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-soft"
      />
    </div>
  );
}
