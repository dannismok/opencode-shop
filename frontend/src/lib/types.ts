export type Role = 'CUSTOMER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
}

export interface Food {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  priceCents: number;
  imageUrl: string;
  stockQty: number;
  isActive: boolean;
  inStock: boolean;
}

export interface OrderItem {
  id: string;
  foodId: string;
  nameSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  pickupCode: string;
  userId: string;
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED';
  subtotalCents: number;
  totalCents: number;
  notes: string | null;
  createdAt: string;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
  user?: { id: string; name: string; phone: string };
}

export interface Invoice {
  id: string;
  periodYear: number;
  periodMonth: number;
  totalCents: number;
  status: 'DRAFT' | 'CHARGED' | 'FAILED';
  accountNumberSnapshot: string;
  chargedAt: string | null;
  bankRef: string | null;
  failureReason: string | null;
  createdAt: string;
  orderCount: number;
  user?: { id: string; name: string; phone: string; accountNumber: string };
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminStats {
  ordersToday: number;
  pendingOrders: number;
  revenueMtdCents: number;
  lowStock: { id: string; name: string; slug: string; stockQty: number; imageUrl: string }[];
  lowStockCount: number;
  activeFoods: number;
  lowStockThreshold: number;
}
