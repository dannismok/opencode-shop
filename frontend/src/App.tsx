import { Routes, Route, Link, NavLink } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth, RequireAdmin } from './components/RequireAuth';
import Home from './pages/Home';
import CartPage from './pages/CartPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import InvoiceListPage from './pages/InvoiceListPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminFoods from './pages/admin/AdminFoods';
import AdminOrders from './pages/admin/AdminOrders';
import AdminInvoices from './pages/admin/AdminInvoices';

function AdminLayout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-900">Admin</h1>
        <Link to="/" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
          ← Back to store
        </Link>
      </div>
      <nav className="flex flex-wrap gap-2 rounded-xl bg-slate-50 p-2" aria-label="Admin navigation">
        <NavLink to="/admin" end className={linkClass}>
          Dashboard
        </NavLink>
        <NavLink to="/admin/foods" className={linkClass}>
          Foods & stock
        </NavLink>
        <NavLink to="/admin/orders" className={linkClass}>
          Orders
        </NavLink>
        <NavLink to="/admin/invoices" className={linkClass}>
          Invoices
        </NavLink>
      </nav>
      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="foods" element={<AdminFoods />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="invoices" element={<AdminInvoices />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route
          path="orders"
          element={
            <RequireAuth>
              <OrdersPage />
            </RequireAuth>
          }
        />
        <Route
          path="orders/:id"
          element={
            <RequireAuth>
              <OrderDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="invoices"
          element={
            <RequireAuth>
              <InvoiceListPage />
            </RequireAuth>
          }
        />
        <Route
          path="admin/*"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-3xl font-extrabold text-slate-900">Page not found</h1>
      <p className="text-slate-500">The page you're looking for doesn't exist.</p>
      <Link
        to="/"
        className="rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Back to menu
      </Link>
    </div>
  );
}
