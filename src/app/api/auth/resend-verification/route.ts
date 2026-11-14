import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { issueVerificationOtp } from "@/lib/email-verification";
import { OTP_TTL_MS, resolveMailLanguage } from "@/lib/mail";

const schema = z.object({
  email: z.email().trim().toLowerCase().max(320),
  lang: z.string().max(20).optional(),
});

export async function POST(request: Request) {
  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json({ error: "Enter a valid email" }, { status: 400 });
  }
  const { email } = payload.data;

  const [user] = await db
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  // Do not reveal whether an account exists or is already verified.
  if (!user || user.emailVerifiedAt) {
    return Response.json({ ok: true, expiresAt: Date.now() + OTP_TTL_MS });
  }

  const lang = resolveMailLanguage(
    payload.data.lang,
    request.headers.get("accept-language"),
  );
  const result = await issueVerificationOtp(user.id, email, lang);
  if (!result.sent) {
    return Response.json(
      { error: "Please wait a moment before requesting another code" },
      { status: 429 },
    );
  }
  return Response.json({ ok: true, expiresAt: result.expiresAt });
}
