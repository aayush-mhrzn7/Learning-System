import { NextResponse } from "next/server";
import { z } from "zod";
import { authCookie, createSessionToken, passwordsMatch } from "@/lib/auth";

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const payload = loginSchema.safeParse(await request.json().catch(() => null));
  const expected = process.env.APP_PASSWORD;

  if (
    !payload.success ||
    !expected ||
    !(await passwordsMatch(payload.data.password, expected))
  ) {
    return Response.json({ error: "Incorrect password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookie.name, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: authCookie.maxAge,
  });
  return response;
}
