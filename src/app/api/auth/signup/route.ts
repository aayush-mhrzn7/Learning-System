import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { issueVerificationOtp } from "@/lib/email-verification";
import { resolveMailLanguage } from "@/lib/mail";
import { hashPassword } from "@/lib/password";

const signupSchema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  password: z.string().min(8).max(200),
  lang: z.string().max(20).optional(),
});

export async function POST(request: Request) {
  if (process.env.ALLOW_SIGNUP === "false") {
    return Response.json({ error: "Signup is disabled" }, { status: 403 });
  }

  const payload = signupSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json({ error: "Invalid email or password" }, { status: 400 });
  }
  const { email, password } = payload.data;

  const [existing] = await db
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing?.emailVerifiedAt) {
    return Response.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  let userId = existing?.id;
  if (userId) {
    // Unverified signup being retried: the latest password wins.
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  } else {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id });
    userId = user?.id;
  }
  if (!userId) {
    return Response.json({ error: "Could not create account" }, { status: 500 });
  }

  const lang = resolveMailLanguage(
    payload.data.lang,
    request.headers.get("accept-language"),
  );
  const { expiresAt } = await issueVerificationOtp(userId, email, lang);

  return Response.json({ ok: true, verify: true, expiresAt });
}
