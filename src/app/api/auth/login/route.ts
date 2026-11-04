import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authCookie, createSessionToken } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  password: z.string().min(1).max(200),
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
    })
    .from(users)
    .where(eq(users.email, payload.data.email))
    .limit(1);

  if (!user || !(await verifyPassword(payload.data.password, user.passwordHash))) {
    return Response.json({ error: "Incorrect email or password" }, { status: 401 });
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
