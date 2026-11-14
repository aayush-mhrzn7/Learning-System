"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";

const OTP_TTL_MS = 5 * 60 * 1000;

const primaryButton =
  "mt-8 h-10 w-full bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50";

const inputClass =
  "h-11 w-full border-b border-border bg-transparent text-sm outline-none transition-colors focus:border-foreground";

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}

function parseExpiry(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function ForgotPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkEmail = searchParams.get("email") ?? "";
  const linkOtp = (searchParams.get("otp") ?? "").replace(/\D/g, "").slice(0, 6);
  const linkExpiry = parseExpiry(searchParams.get("exp"));

  const [email, setEmail] = useState(linkEmail);
  const [otp, setOtp] = useState(linkOtp);
  const [verified, setVerified] = useState(false);
  const [codeSent, setCodeSent] = useState(Boolean(linkEmail && linkOtp));
  const [expiresAt, setExpiresAt] = useState<number>(
    () => linkExpiry ?? Date.now() + OTP_TTL_MS,
  );
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!codeSent) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [codeSent]);

  const remaining = expiresAt - now;
  const errorLine = error ? (
    <p className="mt-3 font-mono text-xs text-red-600 dark:text-red-400">
      {error}
    </p>
  ) : null;
  const expired = codeSent && remaining <= 0;

  async function requestCode() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, lang: navigator.language }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      expiresAt?: number;
    } | null;
    setLoading(false);

    if (!response.ok) {
      setError(data?.error ?? "Could not send the code");
      return;
    }
    setOtp("");
    setVerified(false);
    setExpiresAt(data?.expiresAt ?? Date.now() + OTP_TTL_MS);
    setNow(Date.now());
    setCodeSent(true);
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestCode();
  }

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    setLoading(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        expired?: boolean;
      } | null;
      setError(data?.error ?? "Incorrect code");
      if (data?.expired) setExpiresAt(0);
      return;
    }
    setVerified(true);
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp, password }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        expired?: boolean;
      } | null;
      setError(data?.error ?? "Could not reset password");
      if (data?.expired) {
        setExpiresAt(0);
        setVerified(false);
      }
      setLoading(false);
      return;
    }

    router.replace("/login");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-xs">
        <p className="mb-10 text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Scholar
        </p>
        <h1 className="mb-2 text-2xl font-medium tracking-tight">
          Reset password
        </h1>

        {!codeSent ? (
          <form onSubmit={submitEmail}>
            <p className="mb-8 text-xs text-muted-foreground">
              Enter your email and we will send you a 6-digit code.
            </p>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
              placeholder="Email"
            />
            {errorLine}
            <button
              type="submit"
              disabled={loading}
              className={primaryButton}
            >
              {loading ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : verified ? (
          <form onSubmit={submitReset}>
            <p className="mb-8 text-xs text-muted-foreground">
              Code verified. Choose a new password.
            </p>
            <label htmlFor="password" className="sr-only">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              minLength={8}
              required
              className={`${inputClass} mb-4`}
              placeholder="New password"
            />
            <label htmlFor="confirm" className="sr-only">
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className={inputClass}
              placeholder="Confirm password"
            />
            {errorLine}
            <button
              type="submit"
              disabled={loading}
              className={primaryButton}
            >
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitOtp}>
            <p className="mb-8 text-xs text-muted-foreground">
              Code sent to <span className="text-foreground">{email}</span>.
            </p>
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={(value) => setOtp(value.replace(/\D/g, ""))}
              disabled={expired}
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              aria-label="6-digit code"
            >
              <InputOTPGroup>
                {[0, 1, 2].map((index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                {[3, 4, 5].map((index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>

            <div className="mt-4 flex items-center justify-between font-mono text-xs">
              {expired ? (
                <span className="text-red-600 dark:text-red-400">
                  Code expired
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Expires in {formatRemaining(remaining)}
                </span>
              )}
              {expired ? (
                <button
                  type="button"
                  onClick={requestCode}
                  disabled={loading}
                  className="text-foreground underline-offset-4 hover:underline disabled:opacity-50"
                >
                  {loading ? "Sending…" : "Try again"}
                </button>
              ) : null}
            </div>
            {errorLine}
            <button
              type="submit"
              disabled={loading || expired || otp.length !== 6}
              className={primaryButton}
            >
              {loading ? "Checking…" : "Continue"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link
            href="/login"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
