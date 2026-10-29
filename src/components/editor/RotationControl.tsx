'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';

const normalize = (angle: number) => ((Math.round(angle) % 360) + 360) % 360;

export function RotationControl({
  value, disabled = false, onPreview, onCommit, onCancel,
}: {
  value: number;
  disabled?: boolean;
  onPreview?: (angle: number) => void;
  onCommit: (angle: number) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(normalize(value));
  const [text, setText] = useState(String(normalize(value)));
  const current = useRef(draft);
  const dragging = useRef<number | null>(null);
  useEffect(() => {
    if (dragging.current !== null) return;
    const angle = normalize(value);
    setDraft(angle);
    setText(String(angle));
    current.current = angle;
  }, [value]);
  const preview = (angle: number) => {
    if (disabled) return;
    const next = normalize(angle);
    current.current = next;
    setDraft(next);
    setText(String(next));
    onPreview?.(next);
  };
  const commit = (angle = current.current) => {
    if (disabled || !Number.isFinite(angle)) return;
    const next = normalize(angle);
    preview(next);
    onCommit(next);
  };
  const pointAngle = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.atan2(event.clientY - rect.top - rect.height / 2,
      event.clientX - rect.left - rect.width / 2) * 180 / Math.PI + 90;
  };
  return (
    <div className="space-y-3" aria-label="Furniture rotation controls">
      <div className="flex items-center gap-4">
        <div
          role="slider"
          aria-label="Drag furniture rotation"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={draft}
          aria-valuetext={`${draft} degrees`}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          className={`relative h-24 w-24 shrink-0 touch-none rounded-full border border-brand-200 bg-brand-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${disabled ? 'opacity-40' : 'cursor-grab active:cursor-grabbing'}`}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            event.preventDefault();
            dragging.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            preview(pointAngle(event));
          }}
          onPointerMove={(event) => {
            if (dragging.current === event.pointerId) preview(pointAngle(event));
          }}
          onPointerUp={(event) => {
            if (dragging.current !== event.pointerId) return;
            preview(pointAngle(event));
            dragging.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
            commit();
          }}
          onPointerCancel={() => {
            dragging.current = null;
            current.current = normalize(value);
            setDraft(current.current);
            setText(String(current.current));
            onCancel?.();
          }}
          onKeyDown={(event) => {
            const increment = event.shiftKey ? 15 : 1;
            const steps = { ArrowRight: increment, ArrowUp: increment, ArrowLeft: -increment, ArrowDown: -increment };
            if (event.key in steps) {
              event.preventDefault();
              commit(draft + steps[event.key]);
            } else if (event.key === 'Home') {
              event.preventDefault();
              commit(0);
            }
          }}
        >
          <svg viewBox="0 0 96 96" className="pointer-events-none h-full w-full" aria-hidden="true">
            <circle cx="48" cy="48" r="35" fill="none" stroke="#b8c8bd" strokeDasharray="1 8" />
            <g transform={`rotate(${draft} 48 48)`}>
              <line x1="48" y1="48" x2="48" y2="14" stroke="#3e6658" strokeWidth="3" strokeLinecap="round" />
              <circle cx="48" cy="14" r="7" fill="#3e6658" stroke="white" strokeWidth="2" />
              <rect x="36" y="39" width="24" height="18" rx="4" fill="#b8c8bd" stroke="#3e6658" />
            </g>
            <circle cx="48" cy="48" r="3" fill="#3e6658" />
          </svg>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <label className="block text-xs font-medium text-surface-600">
            Angle (degrees)
            <input
              type="number"
              aria-label="Furniture angle in degrees"
              className="input-field mt-1 w-full text-sm"
              min={0} max={360} step={1} value={text} disabled={disabled}
              onChange={(event) => setText(event.target.value)}
              onBlur={() => {
                const angle = Number(text);
                if (text.trim() && Number.isFinite(angle)) commit(angle);
                else setText(String(draft));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </label>
          <p className="text-[10px] leading-relaxed text-surface-500">Drag the round handle, or enter an exact angle.</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[0, 45, 90, 180].map((angle) => (
          <button key={angle} type="button" disabled={disabled}
            className={`rounded-lg border px-2 py-1.5 text-xs ${draft === angle ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'}`}
            onClick={() => commit(angle)}>{angle}°</button>
        ))}
      </div>
    </div>
  );
}
