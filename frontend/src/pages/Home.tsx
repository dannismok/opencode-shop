import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import type { Food } from '../lib/types';
import { formatMoney, resolveImageUrl } from '../lib/format';
import { useCart } from '../context/CartContext';
import { EmptyState, SkeletonCard } from '../components/ui';

export function useMenu() {
  return useQuery({
    queryKey: ['foods'],
    queryFn: async () => {
      const { data } = await api.get('/foods');
      return data.foods as Food[];
    },
  });
}

function FoodCard({ food }: { food: Food }) {
  const soldOut = !food.inStock;

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 ${
        soldOut ? 'opacity-70 grayscale' : ''
      }`}
    >
      <div className="relative h-40 w-full overflow-hidden bg-slate-100">
        <img
          src={resolveImageUrl(food.imageUrl)}
          alt={food.name}
          className={`h-full w-full object-cover ${soldOut ? 'grayscale' : ''}`}
          loading="lazy"
        />
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold ${
            soldOut
              ? 'bg-slate-700 text-white'
              : food.stockQty <= 5
                ? 'bg-amber-500 text-white'
                : 'bg-emerald-500 text-white'
          }`}
        >
          {soldOut ? 'Sold out' : `${food.stockQty} left`}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{food.category}</p>
        <h2 className="text-lg font-bold leading-snug text-slate-900">{food.name}</h2>
        <p className="line-clamp-2 flex-1 text-sm text-slate-500">{food.description}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-lg font-extrabold text-slate-900">
            {formatMoney(food.priceCents)}
          </span>
          {soldOut ? (
            <span className="text-sm font-semibold text-slate-400">Unavailable</span>
          ) : (
            <AddToCart food={food} />
          )}
        </div>
      </div>
    </article>
  );
}

function AddToCart({ food }: { food: Food }) {
  const { add } = useCart();
  return (
    <button
      type="button"
      onClick={() => {
        add(food, 1);
        toast.success(`${food.name} added to cart`);
      }}
      className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
    >
      Add to cart
    </button>
  );
}

export default function Home() {
  const { data, isLoading, isError } = useMenu();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-200" />
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState title="Could not load the menu" description="Please refresh the page to try again." />
    );
  }

  const active = data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Today's Menu</h1>
        <p className="mt-1 text-slate-500">Order ahead and skip the line. Pick up when it's ready.</p>
      </div>
      {active.length === 0 ? (
        <EmptyState title="No items on the menu yet" description="Check back later or ask the staff." />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((food) => (
            <FoodCard key={food.id} food={food} />
          ))}
        </div>
      )}
    </div>
  );
}
