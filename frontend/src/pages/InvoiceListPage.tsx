import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Invoice } from '../lib/types';
import { formatMoney } from '../lib/format';
import { EmptyState, Spinner, StatusChip } from '../components/ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function InvoiceListPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-invoices'],
    queryFn: async () => {
      const { data } = await api.get('/invoices');
      return data.invoices as Invoice[];
    },
  });

  if (isLoading) return <Spinner label="Loading invoices…" />;
  if (isError || !data) {
    return <EmptyState title="Could not load invoices" description="Please try again later." />;
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="No invoices yet"
        description="Invoices are generated on the 1st of each month for fulfilled orders."
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold text-slate-900">My invoices</h1>
      <ul className="space-y-3">
        {data.map((invoice) => (
          <li key={invoice.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-slate-900">
                  {MONTHS[invoice.periodMonth - 1]} {invoice.periodYear}
                </p>
                <p className="text-sm text-slate-500">
                  {invoice.orderCount} order{invoice.orderCount === 1 ? '' : 's'} · billed to{' '}
                  <span className="font-mono">••••{invoice.accountNumberSnapshot.slice(-4)}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusChip status={invoice.status} />
                <span className="font-extrabold text-slate-900">{formatMoney(invoice.totalCents)}</span>
              </div>
            </div>
            {invoice.chargedAt && (
              <p className="mt-2 text-xs text-slate-400">
                Charged {new Date(invoice.chargedAt).toLocaleString()}
                {invoice.bankRef ? ` · Ref ${invoice.bankRef}` : ''}
              </p>
            )}
            {invoice.failureReason && (
              <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
                Charge failed: {invoice.failureReason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
