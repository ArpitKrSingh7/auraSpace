'use client';

import React from 'react';
import type { ViewMode } from '@/src/domain/types';

interface ViewModeSwitchProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const modes: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
  {
    value: 'inside',
    label: 'Inside',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    value: 'overview',
    label: 'Overview',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      </svg>
    ),
  },
  {
    value: 'plan',
    label: 'Plan',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" />
      </svg>
    ),
  },
];

export function ViewModeSwitch({ value, onChange }: ViewModeSwitchProps) {
  return (
    <div className="flex items-center bg-white/10 rounded-btn p-0.5 gap-0.5">
      {modes.map(mode => (
        <button
          key={mode.value}
          onClick={() => onChange(mode.value)}
          className={[
            'flex items-center gap-1 px-2 py-1 rounded-[6px] text-xs font-medium transition-all duration-200',
            value === mode.value
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-white/50 hover:text-white/80',
          ].join(' ')}
          aria-label={mode.label}
        >
          {mode.icon}
          <span className="hidden sm:inline">{mode.label}</span>
        </button>
      ))}
    </div>
  );
}
