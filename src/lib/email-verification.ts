import { desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { emailVerifications } from "@/db/schema";
import {
  OTP_TTL_MS,
  sendVerificationEmail,
  type MailLanguage,
} from "@/lib/mail";
import { generateOtp, hashOtp } from "@/lib/otp";

export const RESEND_COOLDOWN_MS = 30_000;

/**
 * Creates a fresh verification code and emails it. Returns null when a code
 * was requested too recently (the previous one is still valid).
 */
export async function issueVerificationOtp(
  userId: string,
  email: string,
  lang: MailLanguage,
) {
  const [latest] = await db
    .select({
      createdAt: emailVerifications.createdAt,
      expiresAt: emailVerifications.expiresAt,
    })
    .from(emailVerifications)
    .where(eq(emailVerifications.userId, userId))
    .orderBy(desc(emailVerifications.createdAt))
    .limit(1);
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return { sent: false as const, expiresAt: latest.expiresAt.getTime() };
  }

  const otp = generateOtp();
  const expiresAt = Date.now() + OTP_TTL_MS;
  await db.delete(emailVerifications).where(eq(emailVerifications.userId, userId));
  await db.insert(emailVerifications).values({
    userId,
    otpHash: hashOtp(email, otp),
    expiresAt: new Date(expiresAt),
  });
  after(() => sendVerificationEmail(email, lang, otp, expiresAt));
  return { sent: true as const, expiresAt };
}
