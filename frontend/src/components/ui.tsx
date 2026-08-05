import type { ReactNode } from 'react';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-500" role="status">
      <svg
        className="h-8 w-8 animate-spin text-brand-600"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white py-16 px-6 text-center">
      <div className="text-4xl" aria-hidden="true">
        🍽️
      </div>
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {children}
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    FULFILLED: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-rose-100 text-rose-800',
    DRAFT: 'bg-slate-100 text-slate-700',
    CHARGED: 'bg-emerald-100 text-emerald-800',
    FAILED: 'bg-rose-100 text-rose-800',
  };
  const labels: Record<string, string> = {
    PENDING: 'Pending',
    FULFILLED: 'Fulfilled',
    CANCELLED: 'Cancelled',
    DRAFT: 'Draft',
    CHARGED: 'Charged',
    FAILED: 'Failed',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? 'bg-slate-100 text-slate-700'}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <span
        className="grid h-8 min-w-10 place-items-center rounded-md bg-slate-100 px-2 text-sm font-semibold"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(max ?? value + 1, value + 1))}
        disabled={disabled || (max !== undefined && value >= max)}
        className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
