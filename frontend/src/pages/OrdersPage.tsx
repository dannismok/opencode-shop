import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Order, Pagination } from '../lib/types';
import { formatMoney, formatDate } from '../lib/format';
import { EmptyState, Spinner, StatusChip } from '../components/ui';
import { Link } from 'react-router-dom';

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get('highlight');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-orders', page],
    queryFn: async () => {
      const { data } = await api.get('/orders', { params: { page, pageSize: PAGE_SIZE } });
      return data as { orders: Order[]; pagination: Pagination };
    },
  });

  if (isLoading) return <Spinner label="Loading your orders…" />;
  if (isError || !data) {
    return <EmptyState title="Could not load your orders" description="Please try again later." />;
  }

  const { orders, pagination } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-900">My orders</h1>
        <Link to="/" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
          + New order
        </Link>
      </div>

      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Your orders and pickup codes will show up here.">
          <Link
            to="/"
            className="mt-3 rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Order something tasty
          </Link>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className={`rounded-2xl bg-white p-4 shadow-sm transition ${
                highlight === order.orderNumber ? 'ring-2 ring-brand-500' : ''
              }`}
            >
              <Link to={`/orders/${order.id}`} className="block">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">#{order.orderNumber}</p>
                    <p className="text-sm text-slate-500">
                      {formatDate(order.createdAt)} · Pickup code{' '}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-bold text-slate-800">
                        {order.pickupCode}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusChip status={order.status} />
                    <span className="font-extrabold text-slate-900">{formatMoney(order.totalCents)}</span>
                  </div>
                </div>
                <p className="mt-2 truncate text-sm text-slate-500">
                  {order.items.map((i) => `${i.quantity}× ${i.nameSnapshot}`).join(' · ')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pagination.totalPages > 1 && (
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
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
