import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const LITE_OWNER_COOKIE = "lumina_lite_owner";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getLiteOwner(request: NextRequest): string | null {
  const owner = request.cookies.get(LITE_OWNER_COOKIE)?.value;
  return owner && UUID_PATTERN.test(owner) ? owner : null;
}

export function ensureLiteOwner(request: NextRequest, response: NextResponse): string {
  const existing = getLiteOwner(request);
  if (existing) return existing;
  const owner = randomUUID();
  response.cookies.set(LITE_OWNER_COOKIE, owner, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return owner;
}

export function isSameOriginMutation(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const parsedOrigin = new URL(origin);
    const requestHost = request.headers.get("host");
    if (!requestHost || (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:")) return false;
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProtocol ? `${forwardedProtocol}:` : request.nextUrl.protocol;
    if (protocol !== "http:" && protocol !== "https:") return false;
    const requestOrigin = new URL(`${protocol}//${requestHost}`).origin;
    return parsedOrigin.origin === requestOrigin;
  } catch {
    return false;
  }
}
