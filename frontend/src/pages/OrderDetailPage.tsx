import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, getApiError } from '../lib/api';
import type { Order } from '../lib/types';
import { formatMoney, formatDate } from '../lib/format';
import { EmptyState, Spinner, StatusChip } from '../components/ui';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['my-order', id],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${id}`);
      return data.order as Order;
    },
    enabled: !!id,
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/orders/${id}/cancel`);
      return data.order as Order;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['my-order', id], updated);
      toast.success('Order cancelled. Stock has been restored.');
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  if (isLoading) return <Spinner label="Loading order…" />;
  if (isError || !order) {
    return <EmptyState title="Order not found" description="It may have been removed or you don't have access." />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{formatDate(order.createdAt)}</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Order #{order.orderNumber}</h1>
        </div>
        <StatusChip status={order.status} />
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">Pickup code</p>
        <p className="mt-1 font-mono text-3xl font-extrabold tracking-widest text-brand-600">
          {order.pickupCode}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Show this code at the counter to collect your order.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-slate-900">Items</h2>
        <ul className="divide-y divide-slate-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2.5">
              <span className="text-slate-800">
                <span className="font-semibold">{item.quantity}×</span> {item.nameSnapshot}
              </span>
              <span className="font-semibold text-slate-900">
                {formatMoney(item.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="font-bold text-slate-900">Total</span>
          <span className="text-xl font-extrabold text-slate-900">{formatMoney(order.totalCents)}</span>
        </div>
        {order.notes && (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <span className="font-semibold">Notes:</span> {order.notes}
          </p>
        )}
      </div>

      {order.status === 'PENDING' && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Cancel this order? Stock will be restored.')) cancel.mutate();
          }}
          disabled={cancel.isPending}
          className="w-full rounded-xl border border-rose-300 px-5 py-3 font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
        >
          {cancel.isPending ? 'Cancelling…' : 'Cancel order'}
        </button>
      )}
    </div>
  );
}
