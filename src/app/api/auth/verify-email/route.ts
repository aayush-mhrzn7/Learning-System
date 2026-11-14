import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { emailVerifications, users } from "@/db/schema";
import { authCookie, createSessionToken } from "@/lib/auth";
import { otpMatches } from "@/lib/otp";

const MAX_ATTEMPTS = 5;

const schema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  otp: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json({ error: "Invalid code" }, { status: 400 });
  }
  const { email, otp } = payload.data;

  const [user] = await db
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const [verification] = user
    ? await db
        .select()
        .from(emailVerifications)
        .where(eq(emailVerifications.userId, user.id))
        .orderBy(desc(emailVerifications.createdAt))
        .limit(1)
    : [];

  if (!user || !verification) {
    return Response.json({ error: "Invalid or expired code" }, { status: 400 });
  }
  if (verification.expiresAt.getTime() <= Date.now()) {
    return Response.json(
      { error: "This code has expired", expired: true },
      { status: 400 },
    );
  }
  if (verification.attempts >= MAX_ATTEMPTS) {
    return Response.json(
      { error: "Too many attempts. Request a new code", expired: true },
      { status: 429 },
    );
  }
  if (!otpMatches(email, otp, verification.otpHash)) {
    await db
      .update(emailVerifications)
      .set({ attempts: verification.attempts + 1 })
      .where(eq(emailVerifications.id, verification.id));
    return Response.json({ error: "Incorrect code" }, { status: 400 });
  }

  await db
    .update(users)
    .set({
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await db.delete(emailVerifications).where(eq(emailVerifications.userId, user.id));

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
