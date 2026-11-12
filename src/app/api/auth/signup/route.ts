import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authCookie, createSessionToken } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

const signupSchema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  if (process.env.ALLOW_SIGNUP === "false") {
    return Response.json({ error: "Signup is disabled" }, { status: 403 });
  }

  const payload = signupSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json({ error: "Invalid email or password" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, payload.data.email))
    .limit(1);
  if (existing) {
    return Response.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await hashPassword(payload.data.password);
  const [user] = await db
    .insert(users)
    .values({
      email: payload.data.email,
      passwordHash,
    })
    .returning({ id: users.id });

  if (!user) {
    return Response.json({ error: "Could not create account" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookie.name, await createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authCookie.maxAge,
  });
  return response;
}
