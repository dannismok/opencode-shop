import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, getApiError } from '../../lib/api';
import type { Order, Pagination } from '../../lib/types';
import { formatMoney, formatDate } from '../../lib/format';
import { EmptyState, Spinner, StatusChip } from '../../components/ui';

type StatusFilter = '' | 'PENDING' | 'FULFILLED' | 'CANCELLED';
const PAGE_SIZE = 10;

export default function AdminOrders() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = {
    page,
    pageSize: PAGE_SIZE,
    status: status || undefined,
    q: q.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-orders', params],
    queryFn: async () => {
      const { data } = await api.get('/admin/orders', { params });
      return data as { orders: Order[]; pagination: Pagination };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-orders'] });

  const setOrderStatus = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: 'FULFILLED' | 'PENDING' }) => {
      const { data } = await api.patch(`/admin/orders/${id}/status`, { status: nextStatus });
      return data.order as Order;
    },
    onMutate: async ({ id, nextStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-orders'] });
      const previous = queryClient.getQueryData(['admin-orders', params]);
      queryClient.setQueryData<{ orders: Order[] }>(['admin-orders', params], (old) =>
        old
          ? {
              ...old,
              orders: old.orders.map((o) =>
                o.id === id
                  ? {
                      ...o,
                      status: nextStatus,
                      fulfilledAt: nextStatus === 'FULFILLED' ? new Date().toISOString() : null,
                    }
                  : o,
              ),
            }
          : old,
      );
      return { previous };
    },
    onSuccess: (_order, vars) => {
      toast.success(vars.nextStatus === 'FULFILLED' ? 'Order marked as fulfilled' : 'Fulfilment undone');
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['admin-orders', params], ctx.previous);
      toast.error(getApiError(error).message);
    },
    onSettled: () => invalidate(),
  });

  const resetFilters = () => {
    setStatus('');
    setQ('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <label htmlFor="ao-status" className="mb-1 block text-xs font-semibold text-slate-500">
            Status
          </label>
          <select
            id="ao-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="FULFILLED">Fulfilled</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div>
          <label htmlFor="ao-q" className="mb-1 block text-xs font-semibold text-slate-500">
            Phone search
          </label>
          <input
            id="ao-q"
            type="search"
            placeholder="+6012…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="ao-from" className="mb-1 block text-xs font-semibold text-slate-500">
            From
          </label>
          <input
            id="ao-from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="ao-to" className="mb-1 block text-xs font-semibold text-slate-500">
            To
          </label>
          <input
            id="ao-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600"
        >
          Reset
        </button>
      </div>

      {isLoading ? (
        <Spinner label="Loading orders…" />
      ) : isError || !data ? (
        <EmptyState title="Could not load orders" description="Please try again later." />
      ) : data.orders.length === 0 ? (
        <EmptyState title="No orders match" description="Try changing the filters." />
      ) : (
        <>
          <div className="space-y-3">
            {data.orders.map((order) => (
              <div key={order.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">
                      #{order.orderNumber}
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700">
                        {order.pickupCode}
                      </span>
                    </p>
                    <p className="text-sm text-slate-500">
                      {order.user?.name} · {order.user?.phone} · {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusChip status={order.status} />
                    <span className="font-extrabold text-slate-900">{formatMoney(order.totalCents)}</span>
                    {order.status === 'PENDING' ? (
                      <button
                        type="button"
                        data-testid={`fulfil-${order.id}`}
                        onClick={() => {
                          if (window.confirm(`Mark order #${order.orderNumber} as fulfilled?`)) {
                            setOrderStatus.mutate({ id: order.id, nextStatus: 'FULFILLED' });
                          }
                        }}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700"
                      >
                        ✓ Mark as Fulfilled
                      </button>
                    ) : (
                      order.status === 'FULFILLED' && (
                        <button
                          type="button"
                          data-testid={`undo-${order.id}`}
                          onClick={() => {
                            if (window.confirm(`Undo fulfilment for order #${order.orderNumber}?`)) {
                              setOrderStatus.mutate({ id: order.id, nextStatus: 'PENDING' });
                            }
                          }}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          Undo
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                      aria-expanded={expanded === order.id}
                    >
                      {expanded === order.id ? 'Hide items' : 'Show items'}
                    </button>
                  </div>
                </div>
                {expanded === order.id && (
                  <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-slate-50 px-4">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex justify-between py-2 text-sm">
                        <span className="text-slate-700">
                          {item.quantity}× {item.nameSnapshot}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {formatMoney(item.lineTotalCents)}
                        </span>
                      </li>
                    ))}
                    {order.notes && (
                      <li className="py-2 text-sm text-slate-500">
                        <span className="font-semibold">Notes:</span> {order.notes}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
