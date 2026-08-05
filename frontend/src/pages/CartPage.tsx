import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, getApiError } from '../lib/api';
import { formatMoney, resolveImageUrl } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { EmptyState, QuantityStepper } from '../components/ui';

export default function CartPage() {
  const { lines, setQuantity, remove, subtotalCents, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');

  const placeOrder = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/orders', {
        items: lines.map((l) => ({ foodId: l.food.id, quantity: l.quantity })),
        notes: notes.trim() || undefined,
      });
      return data.order as { orderNumber: string; pickupCode: string };
    },
    onSuccess: (order) => {
      clear();
      toast.success('Order placed!');
      navigate(`/orders?highlight=${order.orderNumber}`);
    },
    onError: (error) => {
      const err = getApiError(error);
      if (err.code === 'OUT_OF_STOCK') {
        toast.error('Some items are out of stock. Please review your cart.');
      } else {
        toast.error(err.message);
      }
    },
  });

  if (lines.length === 0) {
    return (
      <EmptyState title="Your cart is empty" description="Add some tasty items from the menu first.">
        <Link
          to="/"
          className="mt-3 rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Browse menu
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-extrabold text-slate-900">Your cart</h1>

      <ul className="divide-y divide-slate-100 rounded-2xl bg-white p-2 shadow-sm">
        {lines.map((line) => (
          <li key={line.food.id} className="flex items-center gap-3 p-3">
            <img
              src={resolveImageUrl(line.food.imageUrl)}
              alt={line.food.name}
              className="h-16 w-16 rounded-xl object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{line.food.name}</p>
              <p className="text-sm text-slate-500">{formatMoney(line.food.priceCents)} each</p>
            </div>
            <QuantityStepper
              value={line.quantity}
              max={line.food.stockQty}
              onChange={(q) => setQuantity(line.food.id, q)}
            />
            <p className="w-20 text-right font-bold text-slate-900">
              {formatMoney(line.food.priceCents * line.quantity)}
            </p>
            <button
              type="button"
              aria-label={`Remove ${line.food.name} from cart`}
              onClick={() => remove(line.food.id)}
              className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <label htmlFor="order-notes" className="mb-1 block text-sm font-medium text-slate-700">
          Notes (optional)
        </label>
        <textarea
          id="order-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="E.g. no pickles, extra napkins…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <div className="mt-4 flex items-center justify-between">
          <span className="text-slate-600">Subtotal</span>
          <span className="text-xl font-extrabold text-slate-900">{formatMoney(subtotalCents)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Billed monthly against your bank account. No payment at pickup.
        </p>
        {!user && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            You need to{' '}
            <Link to="/login" className="font-semibold underline">
              log in
            </Link>{' '}
            before placing an order.
          </p>
        )}
        <button
          type="button"
          onClick={() => placeOrder.mutate()}
          disabled={!user || placeOrder.isPending}
          className="mt-4 w-full rounded-xl bg-brand-600 px-5 py-3 text-base font-bold text-white shadow hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {placeOrder.isPending ? 'Placing order…' : 'Place order'}
        </button>
      </div>
    </div>
  );
}
