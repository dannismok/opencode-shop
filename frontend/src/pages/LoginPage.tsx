import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { OtpInput } from '../components/OtpInput';
import { useCountdown } from '../lib/useCountdown';

export default function LoginPage() {
  const { requestOtp, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { seconds, canResend, start } = useCountdown(60);

  const sendOtp = async (phoneValue: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await requestOtp(phoneValue.trim());
      setExpiresAt(res.expiresAt);
      setDevCode(res.devCode);
      setStep('otp');
      start(60);
      toast.success('OTP sent!');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await login(phone.trim(), code);
      toast.success('Welcome back!');
      navigate(from, { replace: true });
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
          <h1 className="text-xl font-extrabold text-slate-900">Enter your code</h1>
          <p className="mt-1 text-sm text-slate-500">
            We sent a 6-digit code to <span className="font-semibold">{phone}</span>. It expires in 5
            minutes.
          </p>
          {devCode && (
            <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
              Demo OTP: <span className="font-mono font-bold">{devCode}</span>
            </p>
          )}
          {expiresAt && (
            <p className="mt-1 text-xs text-slate-400">
              Expires at {new Date(expiresAt).toLocaleTimeString()}
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
            onClick={submitOtp}
            disabled={code.length !== 6 || busy}
            className="mt-5 w-full rounded-xl bg-brand-600 px-5 py-3 font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Verifying…' : 'Verify & login'}
          </button>
          <div className="mt-3 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="text-slate-500 hover:text-slate-700"
            >
              ← Change phone
            </button>
            <button
              type="button"
              disabled={!canResend}
              onClick={() => sendOtp(phone)}
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
        <h1 className="text-xl font-extrabold text-slate-900">Log in with your phone</h1>
        <p className="mt-1 text-sm text-slate-500">
          No password needed — we'll text you a one-time code.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendOtp(phone);
          }}
          className="mt-5 space-y-4"
        >
          <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
            Phone number (E.164)
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+60123456789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:outline-none"
          />
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!phone.trim() || busy}
            className="w-full rounded-xl bg-brand-600 px-5 py-3 font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          New here?{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </p>
      </div>
      <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 shadow-sm">
        <h2 className="text-sm font-bold text-brand-900">示範帳號（Demo）</h2>
        <p className="mt-2 text-sm text-slate-700">
          這是示範網站，登入使用「電話號碼 + 一次性驗證碼」，毋須輸入密碼。
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
          <li>
            管理員：<span className="font-mono font-semibold">+60100000000</span>
          </li>
          <li>
            客戶：<span className="font-mono font-semibold">+60123456789</span>、<span className="font-mono font-semibold">+60129876543</span>、<span className="font-mono font-semibold">+60137654321</span>
          </li>
        </ul>
        <p className="mt-3 text-sm text-slate-700">
          所有示範帳號密碼：<span className="font-mono font-bold">Password123!</span>
        </p>
        <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-slate-600">
          <li>輸入上方任何一個示範電話號碼。</li>
          <li>按「發送驗證碼」。</li>
          <li>畫面會顯示示範驗證碼，輸入即可登入。</li>
        </ol>
      </div>
    </div>
  );
}
