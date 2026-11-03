const COOKIE_NAME = "learning_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function sha256(value: string) {
  return bytesToHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

export async function passwordsMatch(input: string, expected: string) {
  const [inputHash, expectedHash] = await Promise.all([
    sha256(input),
    sha256(expected),
  ]);
  if (inputHash.length !== expectedHash.length) return false;

  let different = 0;
  for (let index = 0; index < inputHash.length; index += 1) {
    different |= inputHash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return different === 0;
}

export async function createSessionToken() {
  const password = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!password || !secret) {
    throw new Error("APP_PASSWORD and AUTH_SECRET must be configured");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const fingerprint = await sha256(password);
  const payload = `${expiresAt}.${fingerprint}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(token?: string) {
  const password = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!token || !password || !secret) return false;

  const [expiresAt, fingerprint, signature] = token.split(".");
  if (!expiresAt || !fingerprint || !signature) return false;
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  if (!(await passwordsMatch(fingerprint, await sha256(password)))) return false;

  const expected = await sign(`${expiresAt}.${fingerprint}`, secret);
  return passwordsMatch(signature, expected);
}

export const authCookie = {
  name: COOKIE_NAME,
  maxAge: SESSION_SECONDS,
};
