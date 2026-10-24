'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  suffix?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, suffix, icon, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-text-secondary">{label}</label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <span className="absolute left-3 text-text-muted pointer-events-none">{icon}</span>
        )}
        <input
          className={[
            'w-full bg-surface-warm border border-surface-dim rounded-btn',
            'px-3 py-2.5 text-sm text-text placeholder:text-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
            'transition-colors duration-150',
            icon ? 'pl-9' : '',
            suffix ? 'pr-10' : '',
            error ? 'border-danger focus:ring-danger/30' : '',
            className,
          ].join(' ')}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 text-xs text-text-muted pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
