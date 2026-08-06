import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CartPage from './CartPage';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';

vi.mock('../lib/api', () => ({
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

import { api } from '../lib/api';

const cartLines = [
  {
    food: {
      id: 'f1',
      name: 'Classic Cheeseburger',
      slug: 'classic-cheeseburger',
      description: 'Beef patty, cheddar, pickles.',
      category: 'Burgers',
      priceCents: 890,
      imageUrl: '/uploads/foods/burger.svg',
      stockQty: 25,
      isActive: true,
      inStock: true,
    },
    quantity: 2,
  },
  {
    food: {
      id: 'f2',
      name: 'Pepperoni Pizza Slice',
      slug: 'pepperoni-pizza-slice',
      description: 'Hot slice with pepperoni.',
      category: 'Pizza',
      priceCents: 675,
      imageUrl: '/uploads/foods/pizza.svg',
      stockQty: 30,
      isActive: true,
      inStock: true,
    },
    quantity: 1,
  },
];

function renderCartPage() {
  localStorage.setItem('oshop_cart', JSON.stringify(cartLines));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/cart']}>
        <AuthProvider>
          <CartProvider>
            <CartPage />
          </CartProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CartPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockResolvedValue({ data: {} });
  });

  it('shows line items with correct subtotal maths', () => {
    renderCartPage();
    // 2 × 8.90 + 1 × 6.75 = 24.55
    expect(screen.getByText('Classic Cheeseburger')).toBeInTheDocument();
    expect(screen.getByText('Pepperoni Pizza Slice')).toBeInTheDocument();
    expect(screen.getByText(/HK\$\s*24\.55/)).toBeInTheDocument();
  });

  it('blocks placing an order when not logged in', () => {
    renderCartPage();
    const placeButton = screen.getByRole('button', { name: /place order/i });
    expect(placeButton).toBeDisabled();
    expect(vi.mocked(api.post)).not.toHaveBeenCalled();
  });
});
