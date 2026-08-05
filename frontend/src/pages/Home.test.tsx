import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './Home';
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

const foods = [
  {
    id: 'f1',
    name: 'Classic Cheeseburger',
    slug: 'classic-cheeseburger',
    description: 'Beef patty, cheddar, pickles.',
    category: 'Burgers',
    priceCents: 890,
    imageUrl: '/uploads/foods/classic-cheeseburger.svg',
    stockQty: 25,
    isActive: true,
    inStock: true,
  },
  {
    id: 'f2',
    name: 'Golden French Fries (L)',
    slug: 'golden-french-fries-l',
    description: 'Crispy salted fries.',
    category: 'Sides',
    priceCents: 425,
    imageUrl: '/uploads/foods/fries.svg',
    stockQty: 0,
    isActive: true,
    inStock: false,
  },
];

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CartProvider>
          <Home />
        </CartProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Home / menu', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.get).mockReset();
  });

  it('renders the menu and shows stock badges', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { foods } });
    renderHome();
    expect(await screen.findByText('Classic Cheeseburger')).toBeInTheDocument();
    expect(screen.getByText('Golden French Fries (L)')).toBeInTheDocument();
    expect(screen.getByText('25 left')).toBeInTheDocument();
    expect(screen.getByText('Sold out')).toBeInTheDocument();
    expect(screen.getByText(/RM\s*8\.90/)).toBeInTheDocument();
  });

  it('disables Add to cart for sold out items', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { foods } });
    renderHome();
    await screen.findByText('Golden French Fries (L)');

    const soldOutCard = screen.getByText('Golden French Fries (L)').closest('article')!;
    expect(soldOutCard.querySelector('button')).toBeNull();
    expect(soldOutCard.textContent).toContain('Unavailable');

    const burgerCard = screen.getByText('Classic Cheeseburger').closest('article')!;
    const addButton = burgerCard.querySelector('button');
    expect(addButton).not.toBeNull();
    expect(addButton!.textContent).toContain('Add to cart');
  });
});
