export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
  }).format(cents / 100);
}

export function resolveImageUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  return `${base}${url}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Pending',
    FULFILLED: 'Fulfilled',
    CANCELLED: 'Cancelled',
    DRAFT: 'Draft',
    CHARGED: 'Charged',
    FAILED: 'Failed',
  };
  return map[status] ?? status;
}
