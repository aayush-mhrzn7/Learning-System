import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { otpMatches } from "@/lib/otp";
import { hashPassword } from "@/lib/password";

const MAX_ATTEMPTS = 5;

const schema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  otp: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(200).optional(),
});

export async function POST(request: Request) {
  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json({ error: "Invalid code or password" }, { status: 400 });
  }
  const { email, otp, password } = payload.data;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const [reset] = user
    ? await db
        .select()
        .from(passwordResets)
        .where(eq(passwordResets.userId, user.id))
        .orderBy(desc(passwordResets.createdAt))
        .limit(1)
    : [];

  if (!user || !reset || reset.usedAt) {
    return Response.json({ error: "Invalid or expired code" }, { status: 400 });
  }
  if (reset.expiresAt.getTime() <= Date.now()) {
    return Response.json(
      { error: "This code has expired", expired: true },
      { status: 400 },
    );
  }
  if (reset.attempts >= MAX_ATTEMPTS) {
    return Response.json(
      { error: "Too many attempts. Request a new code", expired: true },
      { status: 429 },
    );
  }
  if (!otpMatches(email, otp, reset.otpHash)) {
    await db
      .update(passwordResets)
      .set({ attempts: reset.attempts + 1 })
      .where(eq(passwordResets.id, reset.id));
    return Response.json({ error: "Incorrect code" }, { status: 400 });
  }

  if (!password) return Response.json({ ok: true, verified: true });

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await db.delete(passwordResets).where(eq(passwordResets.userId, user.id));

  return Response.json({ ok: true });
}
