import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Food } from '../lib/types';

export interface CartLine {
  food: Food;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  add: (food: Food, quantity: number) => void;
  setQuantity: (foodId: string, quantity: number) => void;
  remove: (foodId: string) => void;
  clear: () => void;
  maxQuantity: (food: Food) => number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);
const STORAGE_KEY = 'oshop_cart';

function loadCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => loadCart());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines]);

  const value = useMemo<CartContextValue>(() => {
    const maxQuantity = (food: Food) => Math.max(0, food.stockQty);
    return {
      lines,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotalCents: lines.reduce((sum, l) => sum + l.food.priceCents * l.quantity, 0),
      add: (food, quantity) => {
        setLines((prev) => {
          const existing = prev.find((l) => l.food.id === food.id);
          if (existing) {
            return prev.map((l) =>
              l.food.id === food.id
                ? { ...l, quantity: Math.min(l.quantity + quantity, maxQuantity(food)) }
                : l,
            );
          }
          return [...prev, { food, quantity: Math.min(quantity, maxQuantity(food)) }];
        });
      },
      setQuantity: (foodId, quantity) => {
        setLines((prev) =>
          quantity <= 0
            ? prev.filter((l) => l.food.id !== foodId)
            : prev.map((l) => (l.food.id === foodId ? { ...l, quantity } : l)),
        );
      },
      remove: (foodId) => {
        setLines((prev) => prev.filter((l) => l.food.id !== foodId));
      },
      clear: () => setLines([]),
      maxQuantity,
    };
  }, [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
