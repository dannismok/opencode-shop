import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminOrders from './AdminOrders';

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  getApiError: (err: unknown) => ({
    code: 'TEST',
    message: err instanceof Error ? err.message : 'error',
  }),
}));

import { api } from '../../lib/api';

const orders = {
  orders: [
    {
      id: 'o1',
      orderNumber: '1001',
      pickupCode: 'ABC123',
      userId: 'u1',
      status: 'PENDING',
      subtotalCents: 1515,
      totalCents: 1515,
      notes: null,
      createdAt: '2026-08-05T02:00:00.000Z',
      fulfilledAt: null,
      cancelledAt: null,
      items: [
        {
          id: 'oi1',
          foodId: 'f1',
          nameSnapshot: 'Classic Cheeseburger',
          unitPriceCents: 890,
          quantity: 1,
          lineTotalCents: 890,
        },
      ],
      user: { id: 'u1', name: 'Demo Customer', phone: '+60111111111' },
    },
  ],
  pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
};

function renderAdminOrders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminOrders />
    </QueryClientProvider>,
  );
}

describe('AdminOrders', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.patch).mockReset();
    vi.mocked(api.get).mockResolvedValue({ data: orders });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('marks a pending order as fulfilled via the API', async () => {
    vi.mocked(api.patch).mockResolvedValue({
      data: { order: { ...orders.orders[0], status: 'FULFILLED' } },
    });

    renderAdminOrders();

    const button = await screen.findByRole('button', { name: /mark as fulfilled/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/admin/orders/o1/status', { status: 'FULFILLED' });
    });
  });
});
