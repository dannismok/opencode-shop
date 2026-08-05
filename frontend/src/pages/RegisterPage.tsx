import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { OtpInput } from '../components/OtpInput';
import { useCountdown } from '../lib/useCountdown';

const initialForm = { name: '', email: '', phone: '', accountNumber: '' };

export default function RegisterPage() {
  const { register, login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { seconds, canResend, start } = useCountdown(60);

  const setField = (key: keyof typeof initialForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submitDetails = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await register(form);
      setDevCode(res.devCode);
      setStep('otp');
      start(60);
      toast.success('Account created! Check your phone for the code.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verifyAndFinish = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await login(form.phone.trim(), code);
      toast.success('Welcome to OpenCode Shop!');
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'otp') {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-xl font-extrabold text-slate-900">Verify your phone</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter the 6-digit code sent to <span className="font-semibold">{form.phone}</span>.
          </p>
          {devCode && (
            <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
              Dev mode OTP: <span className="font-mono font-bold">{devCode}</span>
            </p>
          )}
          <div className="mt-5">
            <OtpInput onChange={setCode} disabled={busy} />
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={verifyAndFinish}
            disabled={code.length !== 6 || busy}
            className="mt-5 w-full rounded-xl bg-brand-600 px-5 py-3 font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Verifying…' : 'Create account'}
          </button>
          <div className="mt-3 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setStep('details')}
              className="text-slate-500 hover:text-slate-700"
            >
              ← Edit details
            </button>
            <button
              type="button"
              disabled={!canResend}
              onClick={() => register(form).then((res) => setDevCode(res.devCode)).catch((e) => setError(e.message))}
              className="font-semibold text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {canResend ? 'Resend code' : `Resend in ${seconds}s`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-extrabold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          You'll verify with a one-time code and pay nothing at pickup — billing is monthly.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitDetails();
          }}
          className="mt-5 space-y-4"
        >
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
              Full name
            </label>
            <input
              id="name"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              required
              minLength={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="r-phone" className="mb-1 block text-sm font-medium text-slate-700">
              Phone number (E.164)
            </label>
            <input
              id="r-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+60123456789"
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="account" className="mb-1 block text-sm font-medium text-slate-700">
              Bank account number
            </label>
            <input
              id="account"
              inputMode="numeric"
              autoComplete="off"
              placeholder="8-20 digits"
              value={form.accountNumber}
              onChange={(e) => setField('accountNumber', e.target.value)}
              required
              pattern="\d{8,20}"
              title="Bank account number must be 8-20 digits"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Used only for your monthly invoice. Stored securely; never shared.
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-600 px-5 py-3 font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
