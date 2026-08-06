import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { formatMoney } from '../lib/format';

function CartBadge() {
  const { count, subtotalCents } = useCart();
  return (
    <Link
      to="/cart"
      className="relative inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
      aria-label={`Cart with ${count} items, total ${formatMoney(subtotalCents)}`}
    >
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 4.6a1 1 0 00.9 1.4H19M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z"
        />
      </svg>
      Cart
      {count > 0 && (
        <span
          className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-xs font-bold text-white"
          data-testid="cart-count"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

export function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      isActive ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm" aria-hidden="true">
              🍔
            </span>
            Unisoft Food Store
          </Link>
          <nav className="flex items-center gap-2" aria-label="Main navigation">
            <NavLink to="/" className={navLinkClass} end>
              Menu
            </NavLink>
            {user && (
              <>
                <NavLink to="/orders" className={navLinkClass}>
                  My Orders
                </NavLink>
                <NavLink to="/invoices" className={navLinkClass}>
                  Invoices
                </NavLink>
              </>
            )}
            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass} end>
                Admin
              </NavLink>
            )}
            <CartBadge />
            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
              >
                Logout
              </button>
            ) : (
              <Link
                to="/login"
                className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-slate-400">
        Unisoft Food Store — order ahead, skip the line. Monthly billing against your bank account.
      </footer>
    </div>
  );
}
