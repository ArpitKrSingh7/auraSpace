'use client';

import React, { useEffect, useRef, useState } from 'react';

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: React.ReactNode;
  peekHeight?: number;
}

export function BottomSheet({
  open,
  onOpenChange,
  expanded,
  onExpandedChange,
  children,
  peekHeight = 180,
}: BottomSheetProps) {
  const drag = useRef<{ y: number; delta: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  useEffect(() => {
    const resize = () => setViewportHeight(window.innerHeight);
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    drag.current = null;
    setOffset(0);
  }, [open, expanded]);
  const height = expanded ? viewportHeight * 0.65 : peekHeight;
  if (!open) return null;
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 rounded-t-2xl bg-surface shadow-elevated safe-bottom"
      style={{
        height,
        transform: `translateY(${Math.max(0, offset)}px)`,
        transition: drag.current
          ? 'none'
          : 'transform .2s ease, height .2s ease',
      }}
    >
      <button
        aria-label={
          expanded ? 'Collapse furniture panel' : 'Expand furniture panel'
        }
        aria-expanded={expanded}
        className="flex h-8 w-full touch-none items-center justify-center cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, delta: 0 };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          drag.current.delta = e.clientY - drag.current.y;
          setOffset(drag.current.delta);
        }}
        onPointerUp={(e) => {
          const delta = drag.current?.delta ?? 0;
          drag.current = null;
          setOffset(0);
          e.currentTarget.releasePointerCapture(e.pointerId);
          if (expanded && delta > height * 0.4) onOpenChange(false);
          else if (delta > 40)
            expanded ? onExpandedChange(false) : onOpenChange(false);
          else if (delta < -40) onExpandedChange(true);
          else if (Math.abs(delta) < 5) onExpandedChange(!expanded);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setOffset(0);
        }}
      >
        <span className="bottom-sheet-handle" />
      </button>
      <div className="h-[calc(100%-2rem)] overflow-y-auto overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
