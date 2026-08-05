import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AdminStats } from '../../lib/types';
import { formatMoney } from '../../lib/format';
import { EmptyState, Spinner } from '../../components/ui';

export default function AdminDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { data } = await api.get('/admin/stats');
      return data.stats as AdminStats;
    },
  });

  if (isLoading) return <Spinner label="Loading dashboard…" />;
  if (isError || !data) {
    return <EmptyState title="Could not load stats" description="Please try again later." />;
  }

  const tiles = [
    { label: "Today's orders", value: String(data.ordersToday) },
    { label: 'Pending orders', value: String(data.pendingOrders) },
    { label: 'Revenue this month', value: formatMoney(data.revenueMtdCents) },
    { label: 'Active menu items', value: String(data.activeFoods) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{tile.label}</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{tile.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-900">
            Low stock alert
            {data.lowStockCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                {data.lowStockCount}
              </span>
            )}
          </h2>
          <Link to="/admin/foods" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            Manage stock →
          </Link>
        </div>
        {data.lowStock.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            All good — every item has more than {data.lowStockThreshold} units in stock.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {data.lowStock.map((food) => (
              <li key={food.id} className="flex items-center justify-between py-2.5">
                <span className="font-semibold text-slate-800">{food.name}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    food.stockQty === 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {food.stockQty === 0 ? 'Sold out' : `${food.stockQty} left`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
