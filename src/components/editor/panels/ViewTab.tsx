'use client';

import type { ViewMode } from '@/domain/types';
import type React from 'react';

export function ViewTab({
  mode,
  current,
  label,
  icon: Icon,
  onClick,
}: {
  mode: ViewMode;
  current: ViewMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: (mode: ViewMode) => void;
}) {
  const active = mode === current;
  return (
    <button
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-lg text-xs font-medium transition-all ${
        active
          ? 'bg-white text-brand-600 shadow-sm'
          : 'text-surface-500 hover:text-brand-600 hover:bg-white/60'
      }`}
      aria-pressed={active}
      onClick={() => onClick(mode)}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
