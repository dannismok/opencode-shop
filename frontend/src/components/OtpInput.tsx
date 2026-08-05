import { useEffect, useRef, useState } from 'react';

const CODE_LENGTH = 6;

export function OtpInput({
  onChange,
  disabled = false,
}: {
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const update = (value: string, index: number) => {
    const next = [...digits];
    const last = value.replace(/\D/g, '').slice(-1);
    next[index] = last;
    setDigits(next);
    onChange(next.join(''));
    if (last && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    onChange(next.join(''));
    inputsRef.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus();
    void index;
  };

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="6 digit verification code">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          value={digit}
          disabled={disabled}
          onChange={(e) => update(e.target.value, i)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          className="grid h-14 w-11 rounded-lg border border-slate-300 text-center text-2xl font-bold text-slate-900 focus:border-brand-500 focus:outline-none disabled:opacity-50"
        />
      ))}
    </div>
  );
}
