'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]',
        ) ?? [],
      );
    const timer = window.setTimeout(
      () => (focusable()[0] ?? dialogRef.current)?.focus(),
      0,
    );
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0],
          last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !dialogRef.current?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  const portal =
    typeof document !== 'undefined'
      ? document.getElementById('portal-root')
      : null;
  if (!portal) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 animate-fade-in"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={[
          'relative w-full max-h-[90dvh] overflow-y-auto bg-surface rounded-2xl shadow-elevated',
          'animate-scale-in',
          maxWidth,
        ].join(' ')}
        ref={dialogRef}
        tabIndex={-1}
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
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>,
    portal,
  );
}
