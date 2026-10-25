'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';

const typeColors: Record<string, string> = {
  info: 'bg-brand-600 text-white',
  success: 'bg-emerald-600 text-white',
  warning: 'bg-amber-500 text-white',
  error: 'bg-red-600 text-white',
};

const typeIcons: Record<string, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✕',
};

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || toasts.length === 0) return null;

  const content = (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={[
            'animate-toast-in rounded-xl px-4 py-2.5 shadow-medium flex items-center gap-2.5 pointer-events-auto cursor-pointer',
            typeColors[toast.type] || 'bg-brand-600 text-white',
          ].join(' ')}
          onClick={() => removeToast(toast.id)}
          role="alert"
        >
          <span className="text-sm font-bold">
            {typeIcons[toast.type] || 'ℹ'}
          </span>
          <span className="text-sm font-medium flex-1">{toast.message}</span>
        </div>
      ))}
    </div>
  );

  return createPortal(content, document.body);
}
