export const ROLE = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
} as const;

export const ORDER_STATUS = {
  PENDING: 'PENDING',
  FULFILLED: 'FULFILLED',
  CANCELLED: 'CANCELLED',
} as const;

export const INVOICE_STATUS = {
  DRAFT: 'DRAFT',
  CHARGED: 'CHARGED',
  FAILED: 'FAILED',
} as const;

export const LOW_STOCK_THRESHOLD = 5;
