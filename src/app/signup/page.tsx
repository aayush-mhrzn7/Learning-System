"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password,
      }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? "Could not create account");
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <form onSubmit={submit} className="w-full max-w-xs">
        <p className="mb-10 text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Scholar
        </p>
        <h1 className="mb-8 text-2xl font-medium tracking-tight">Sign up</h1>
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
          autoComplete="new-password"
          required
          minLength={8}
          className="mb-4 h-11 w-full border-b border-border bg-transparent text-sm outline-none transition-colors focus:border-foreground"
          placeholder="Password (min 8 characters)"
        />
        <label htmlFor="confirm" className="sr-only">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="h-11 w-full border-b border-border bg-transparent text-sm outline-none transition-colors focus:border-foreground"
          placeholder="Confirm password"
        />
        {error ? (
          <p className="mt-3 font-mono text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-8 h-10 w-full bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create account"}
        </button>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
