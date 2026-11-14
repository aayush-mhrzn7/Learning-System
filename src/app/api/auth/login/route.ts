import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authCookie, createSessionToken } from "@/lib/auth";
import { issueVerificationOtp } from "@/lib/email-verification";
import { resolveMailLanguage } from "@/lib/mail";
import { verifyPassword } from "@/lib/password";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  password: z.string().min(1).max(200),
  lang: z.string().max(20).optional(),
});

export async function POST(request: Request) {
  const payload = loginSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json({ error: "Invalid email or password" }, { status: 400 });
  }

  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.email, payload.data.email))
    .limit(1);

  if (!user || !(await verifyPassword(payload.data.password, user.passwordHash))) {
    return Response.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  if (!user.emailVerifiedAt) {
    const lang = resolveMailLanguage(
      payload.data.lang,
      request.headers.get("accept-language"),
    );
    const { expiresAt } = await issueVerificationOtp(
      user.id,
      payload.data.email,
      lang,
    );
    return Response.json(
      { error: "Verify your email to continue", unverified: true, expiresAt },
      { status: 403 },
    );
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
