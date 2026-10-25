'use client';

import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark active:bg-primary-dark shadow-soft',
  secondary: 'bg-surface-warm text-text border border-surface-dim hover:bg-surface-muted active:bg-surface-dim',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-warm active:bg-surface-muted',
  danger: 'bg-danger text-white hover:bg-danger-light active:bg-danger',
  accent: 'bg-accent text-white hover:bg-accent-dark active:bg-accent-dark shadow-soft',
};

const sizeClasses: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-base px-6 py-3 gap-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  fullWidth,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center font-medium rounded-btn touch-target',
        'transition-all duration-150 select-none',
        'disabled:opacity-40 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children && <span>{children}</span>}
    </button>
  );
}
