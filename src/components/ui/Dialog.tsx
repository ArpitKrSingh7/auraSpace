'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Dialog({ open, onClose, title, children, maxWidth = 'max-w-md' }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  const portal = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;
  if (!portal) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 animate-fade-in" />

      {/* Dialog */}
      <div
        className={[
          'relative w-full bg-surface rounded-card shadow-elevated',
          'animate-scale-in',
          maxWidth,
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {title && (
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            <button
              onClick={onClose}
              className="touch-target flex items-center justify-center text-text-muted hover:text-text transition-colors"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>,
    portal
  );
}
