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

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const linkOtp = (searchParams.get("otp") ?? "").replace(/\D/g, "").slice(0, 6);
  const linkExpiry = Number(searchParams.get("exp"));
  const next = searchParams.get("next");

  const [otp, setOtp] = useState(linkOtp);
  const [expiresAt, setExpiresAt] = useState<number>(() =>
    Number.isFinite(linkExpiry) && linkExpiry > 0
      ? linkExpiry
      : Date.now() + OTP_TTL_MS,
  );
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = expiresAt - now;
  const expired = remaining <= 0;

  async function verify(code: string) {
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp: code }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
        expired?: boolean;
      } | null;
      setError(data?.error ?? "Incorrect code");
      if (data?.expired) setExpiresAt(0);
      setLoading(false);
      return;
    }
    const target =
      next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
        ? next
        : "/";
    router.replace(target);
    router.refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verify(otp);
  }

  async function resend() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/resend-verification", {
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
    setExpiresAt(data?.expiresAt ?? Date.now() + OTP_TTL_MS);
    setNow(Date.now());
  }

  if (!email) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-6">
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Back to log in
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <form onSubmit={submit} className="w-full max-w-xs">
        <p className="mb-10 text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Scholar
        </p>
        <h1 className="mb-2 text-2xl font-medium tracking-tight">Verify email</h1>
        <p className="mb-8 text-xs text-muted-foreground">
          Code sent to <span className="text-foreground">{email}</span>.
        </p>
        <InputOTP
          maxLength={6}
          value={otp}
          onChange={(value) => setOtp(value.replace(/\D/g, ""))}
          disabled={expired || loading}
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
            <span className="text-red-600 dark:text-red-400">Code expired</span>
          ) : (
            <span className="text-muted-foreground">
              Expires in {formatRemaining(remaining)}
            </span>
          )}
          <button
            type="button"
            onClick={resend}
            disabled={loading}
            className="text-foreground underline-offset-4 hover:underline disabled:opacity-50"
          >
            Resend code
          </button>
        </div>
        {error ? (
          <p className="mt-3 font-mono text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading || expired || otp.length !== 6}
          className="mt-8 h-10 w-full bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {loading ? "Verifying…" : "Verify"}
        </button>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Back to log in
          </Link>
        </p>
      </form>
    </main>
  );
}
