import { cookies } from "next/headers";

const COOKIE_NAME = "learning_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
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

function timingSafeEqualString(left: string, right: string) {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) {
    different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return different === 0;
}

export async function createSessionToken(userId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be configured");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(
  token?: string,
): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return null;

  const [userId, expiresAt, signature] = token.split(".");
  if (!userId || !expiresAt || !signature) return null;
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return null;

  const expected = await sign(`${userId}.${expiresAt}`, secret);
  if (!timingSafeEqualString(signature, expected)) return null;
  return userId;
}

export async function getSessionUserId() {
  const jar = await cookies();
  return verifySessionToken(jar.get(COOKIE_NAME)?.value);
}

export async function requireUserId() {
  const userId = await getSessionUserId();
  if (!userId) {
    return { userId: null as string | null, error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId, error: null as Response | null };
}

export const authCookie = {
  name: COOKIE_NAME,
  maxAge: SESSION_SECONDS,
};
