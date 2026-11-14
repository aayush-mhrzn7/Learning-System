import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(email: string, otp: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be configured");
  return createHmac("sha256", secret).update(`${email}:${otp}`).digest("hex");
}

export function otpMatches(email: string, otp: string, storedHash: string) {
  const actual = Buffer.from(hashOtp(email, otp), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
