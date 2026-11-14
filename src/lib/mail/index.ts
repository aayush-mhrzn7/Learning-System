import { sendMail } from "./transport";
import {
  resetOtpEmail,
  verifyEmailOtpEmail,
  type MailLanguage,
} from "./templates";

export { resolveMailLanguage, type MailLanguage } from "./templates";
export { OTP_TTL_MS } from "./config";

export function sendVerificationEmail(
  to: string,
  lang: MailLanguage,
  otp: string,
  expiresAt: number,
) {
  return sendMail({
    to,
    ...verifyEmailOtpEmail(lang, { email: to, otp, expiresAt }),
  });
}

export function sendResetOtpEmail(
  to: string,
  lang: MailLanguage,
  otp: string,
  expiresAt: number,
) {
  return sendMail({
    to,
    ...resetOtpEmail(lang, { email: to, otp, expiresAt }),
  });
}
