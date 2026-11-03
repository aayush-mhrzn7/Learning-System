"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
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
      body: JSON.stringify({ password: form.get("password") }),
    });

    if (!response.ok) {
      setError("Incorrect password");
      setLoading(false);
      return;
    }

    router.replace(searchParams.get("next") || "/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <form onSubmit={submit} className="w-full max-w-xs">
        <p className="mb-10 text-xs uppercase tracking-[0.28em] text-muted">
          Learning System
        </p>
        <h1 className="mb-8 text-2xl font-medium tracking-tight">
          Enter password
        </h1>
        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
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
      </form>
    </main>
  );
}
