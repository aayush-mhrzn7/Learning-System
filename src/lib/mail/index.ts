import { sendMail } from "./transport";
import {
  resetOtpEmail,
  welcomeEmail,
  type MailLanguage,
} from "./templates";

export { resolveMailLanguage, type MailLanguage } from "./templates";
export { OTP_TTL_MS } from "./config";

export function sendWelcomeEmail(to: string, lang: MailLanguage) {
  return sendMail({ to, ...welcomeEmail(lang) });
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
