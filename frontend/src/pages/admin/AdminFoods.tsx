import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, getApiError } from '../../lib/api';
import type { Food } from '../../lib/types';
import { formatMoney, resolveImageUrl } from '../../lib/format';
import { EmptyState, Spinner } from '../../components/ui';

interface FoodForm {
  name: string;
  description: string;
  category: string;
  priceCents: number;
  stockQty: number;
}

const emptyForm: FoodForm = { name: '', description: '', category: '', priceCents: 0, stockQty: 0 };

export default function AdminFoods() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ food: Food | null; form: FoodForm } | null>(null);
  const [stockTarget, setStockTarget] = useState<{ id: string; value: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-foods'],
    queryFn: async () => {
      const { data } = await api.get('/admin/foods');
      return data.foods as Food[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-foods'] });

  const save = useMutation({
    mutationFn: async (form: FoodForm) => {
      const body = { ...form, priceCents: Math.round(form.priceCents) };
      if (editing?.food) {
        await api.patch(`/admin/foods/${editing.food.id}`, body);
      } else {
        await api.post('/admin/foods', body);
      }
    },
    onSuccess: () => {
      toast.success(editing?.food ? 'Food updated' : 'Food created');
      setEditing(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const setStock = useMutation({
    mutationFn: async ({ id, qty }: { id: string; qty: number }) => {
      const { data } = await api.patch(`/admin/foods/${id}/stock`, { mode: 'set', qty });
      return data.food as Food;
    },
    onSuccess: () => {
      toast.success('Stock updated');
      setStockTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const toggleActive = useMutation({
    mutationFn: async (food: Food) => {
      await api.patch(`/admin/foods/${food.id}`, { isActive: !food.isActive });
    },
    onSuccess: () => {
      toast.success('Menu visibility toggled');
      invalidate();
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  const uploadImage = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append('image', file);
      await api.post(`/admin/foods/${id}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Image uploaded');
      invalidate();
    },
    onError: (error) => toast.error(getApiError(error).message),
  });

  if (isLoading) return <Spinner label="Loading foods…" />;
  if (isError || !data) {
    return <EmptyState title="Could not load foods" description="Please try again later." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Foods & stock</h2>
        <button
          type="button"
          onClick={() => setEditing({ food: null, form: emptyForm })}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + Add food
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.map((food) => (
              <tr key={food.id} className={food.isActive ? '' : 'opacity-60'}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={resolveImageUrl(food.imageUrl)}
                      alt={food.name}
                      className="h-11 w-11 rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{food.name}</p>
                      <p className="truncate text-xs text-slate-400">{food.category}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {formatMoney(food.priceCents)}
                </td>
                <td className="px-4 py-3">
                  {stockTarget?.id === food.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={stockTarget.value}
                        onChange={(e) => setStockTarget({ id: food.id, value: e.target.value })}
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        aria-label={`Set stock for ${food.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => setStock.mutate({ id: food.id, qty: Number(stockTarget.value) })}
                        className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setStockTarget(null)}
                        className="rounded-md px-2 py-1 text-xs text-slate-500"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStockTarget({ id: food.id, value: String(food.stockQty) })}
                      title="Edit stock"
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        food.stockQty === 0
                          ? 'bg-rose-100 text-rose-700'
                          : food.stockQty <= 5
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {food.stockQty === 0 ? 'Sold out' : `${food.stockQty} left`} ✎
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      food.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {food.isActive ? 'Active' : 'Hidden'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({
                          food,
                          form: {
                            name: food.name,
                            description: food.description,
                            category: food.category,
                            priceCents: food.priceCents,
                            stockQty: food.stockQty,
                          },
                        })
                      }
                      className="rounded-md px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (fileRef.current) {
                          fileRef.current.value = '';
                          fileRef.current.onchange = () => {
                            const file = fileRef.current?.files?.[0];
                            if (file) uploadImage.mutate({ id: food.id, file });
                          };
                          fileRef.current.click();
                        }
                      }}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Image
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive.mutate(food)}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      {food.isActive ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" />

      {editing && (
        <FoodModal
          food={editing.food}
          initial={editing.form}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(form) => save.mutate(form)}
        />
      )}
    </div>
  );
}

function FoodModal({
  food,
  initial,
  saving,
  onClose,
  onSave,
}: {
  food: Food | null;
  initial: FoodForm;
  saving: boolean;
  onClose: () => void;
  onSave: (form: FoodForm) => void;
}) {
  const [form, setForm] = useState<FoodForm>(initial);
  const set = (key: keyof FoodForm, value: string | number) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={food ? `Edit ${food.name}` : 'Add food'}
      onClick={onClose}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900">{food ? 'Edit food' : 'Add food'}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(form);
          }}
          className="mt-4 space-y-4"
        >
          <div>
            <label htmlFor="f-name" className="mb-1 block text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              id="f-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              minLength={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="f-category" className="mb-1 block text-sm font-medium text-slate-700">
              Category
            </label>
            <input
              id="f-category"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="f-desc" className="mb-1 block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="f-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              required
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-price" className="mb-1 block text-sm font-medium text-slate-700">
                Price (cents)
              </label>
              <input
                id="f-price"
                type="number"
                min={0}
                step={1}
                value={form.priceCents}
                onChange={(e) => set('priceCents', Number(e.target.value))}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-400">{formatMoney(form.priceCents)}</p>
            </div>
            <div>
              <label htmlFor="f-stock" className="mb-1 block text-sm font-medium text-slate-700">
                Initial stock
              </label>
              <input
                id="f-stock"
                type="number"
                min={0}
                value={form.stockQty}
                onChange={(e) => set('stockQty', Number(e.target.value))}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
