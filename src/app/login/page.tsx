"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

/** Same-origin relative paths only — blocks //evil, http(s):, etc. */
function safeNextPath(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("://") || value.includes("\\")) return "/";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    if (!response.ok) {
      setError("Incorrect email or password");
      setLoading(false);
      return;
    }

    router.replace(safeNextPath(searchParams.get("next")));
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <form onSubmit={submit} className="w-full max-w-xs">
        <p className="mb-10 text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Learning System
        </p>
        <h1 className="mb-8 text-2xl font-medium tracking-tight">Log in</h1>
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          className="mb-4 h-11 w-full border-b border-border bg-transparent text-sm outline-none transition-colors focus:border-foreground"
          placeholder="Email"
        />
        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 w-full border-b border-border bg-transparent text-sm outline-none transition-colors focus:border-foreground"
          placeholder="Password"
        />
        {error ? (
          <p className="mt-3 font-mono text-xs text-red-400">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-8 h-10 w-full bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {loading ? "Opening…" : "Continue"}
        </button>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="text-foreground underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </main>
  );
}
