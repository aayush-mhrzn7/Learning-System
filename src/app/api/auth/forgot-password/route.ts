import { desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { OTP_TTL_MS, resolveMailLanguage, sendResetOtpEmail } from "@/lib/mail";
import { generateOtp, hashOtp } from "@/lib/otp";

const RESEND_COOLDOWN_MS = 30_000;

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
  const expiresAt = Date.now() + OTP_TTL_MS;
  const response = () => Response.json({ ok: true, expiresAt });

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return response();

  const [latest] = await db
    .select({ createdAt: passwordResets.createdAt })
    .from(passwordResets)
    .where(eq(passwordResets.userId, user.id))
    .orderBy(desc(passwordResets.createdAt))
    .limit(1);
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return Response.json(
      { error: "Please wait a moment before requesting another code" },
      { status: 429 },
    );
  }

  const otp = generateOtp();
  await db.delete(passwordResets).where(eq(passwordResets.userId, user.id));
  await db.insert(passwordResets).values({
    userId: user.id,
    otpHash: hashOtp(email, otp),
    expiresAt: new Date(expiresAt),
  });

  const lang = resolveMailLanguage(
    payload.data.lang,
    request.headers.get("accept-language"),
  );
  after(() => sendResetOtpEmail(email, lang, otp, expiresAt));

  return response();
}
