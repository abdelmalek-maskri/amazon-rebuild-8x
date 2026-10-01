import { NextResponse, type NextRequest } from "next/server";

// Every /api request is forwarded to the API from Vercel's servers, so the API would see Vercel's
// address, not the shopper's, and rate limits would be shared by everyone. This passes the
// shopper's address on, with a secret proving it came from here and not from the browser.
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Never forward these from the browser: only this proxy may set them.
  headers.delete("x-store-client-ip");
  headers.delete("x-store-proxy-secret");

  const secret = process.env.PROXY_SECRET;
  // Vercel sets these itself from the connection; a client can't choose them.
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (secret && ip) {
    headers.set("x-store-client-ip", ip);
    headers.set("x-store-proxy-secret", secret);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
