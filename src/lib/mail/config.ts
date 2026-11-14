export const APP_NAME = "Scholar";
export const OTP_TTL_MINUTES = 5;
export const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
