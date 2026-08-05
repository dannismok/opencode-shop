import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, getApiError } from '../../lib/api';
import type { Invoice } from '../../lib/types';
import { formatMoney } from '../../lib/format';
import { EmptyState, Spinner, StatusChip } from '../../components/ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function AdminInvoices() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const params = { year, month };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-invoices', params],
    queryFn: async () => {
      const { data } = await api.get('/admin/invoices', { params });
      return data.invoices as Invoice[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-invoices'] });

  const runBilling = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/billing/run', { year, month });
      return data.result as { created: number; skipped: number; failed: number };
    },
    onSuccess: (result) => {
      toast.success(`Billing run complete: ${result.created} created, ${result.failed} failed`);
      invalidate();
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const retryCharge = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/admin/invoices/${id}/charge`);
      return data.invoice as { status: string };
    },
    onSuccess: (inv) => {
      toast.success(inv.status === 'CHARGED' ? 'Invoice charged successfully' : 'Charge failed again');
      invalidate();
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-end gap-3">
          <div>
            <label htmlFor="ai-year" className="mb-1 block text-xs font-semibold text-slate-500">
              Year
            </label>
            <select
              id="ai-year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ai-month" className="mb-1 block text-xs font-semibold text-slate-500">
              Month
            </label>
            <select
              id="ai-month"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          data-testid="run-billing"
          onClick={() => {
            if (window.confirm(`Close the books for ${MONTHS[month - 1]} ${year}? This is idempotent.`)) {
              runBilling.mutate();
            }
          }}
          disabled={runBilling.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {runBilling.isPending ? 'Running…' : 'Run monthly billing'}
        </button>
      </div>

      {isLoading ? (
        <Spinner label="Loading invoices…" />
      ) : isError || !data ? (
        <EmptyState title="Could not load invoices" description="Please try again later." />
      ) : data.length === 0 ? (
        <EmptyState
          title="No invoices for this period"
          description="Run monthly billing or pick another month."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{invoice.user?.name}</p>
                    <p className="text-xs text-slate-400">
                      {invoice.user?.phone} · ••••{invoice.accountNumberSnapshot.slice(-4)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {MONTHS[invoice.periodMonth - 1]} {invoice.periodYear}
                  </td>
                  <td className="px-4 py-3">{invoice.orderCount}</td>
                  <td className="px-4 py-3 font-extrabold text-slate-900">
                    {formatMoney(invoice.totalCents)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={invoice.status} />
                    {invoice.failureReason && (
                      <p className="mt-1 max-w-48 text-xs text-rose-600">{invoice.failureReason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {invoice.status === 'FAILED' && (
                      <button
                        type="button"
                        data-testid={`retry-${invoice.id}`}
                        onClick={() => retryCharge.mutate(invoice.id)}
                        disabled={retryCharge.isPending}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        Retry charge
                      </button>
                    )}
                    {invoice.chargedAt && (
                      <p className="text-xs text-slate-400">
                        {new Date(invoice.chargedAt).toLocaleDateString()}
                        {invoice.bankRef ? ` · ${invoice.bankRef}` : ''}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
