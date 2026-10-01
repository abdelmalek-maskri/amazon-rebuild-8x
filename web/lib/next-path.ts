// Where to send the shopper after signing in. It comes from the URL, so it is untrusted: only a
// path on this site is accepted ("/cart", not "https://evil.example" or "//evil.example").
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.startsWith("/signin") || raw.startsWith("/signup")) return "/";
  return raw.slice(0, 500);
}
