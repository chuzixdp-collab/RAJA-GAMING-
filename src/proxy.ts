import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/jwt";

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];
const AUTH_PAGES = ["/login", "/register"];

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  let res: NextResponse | null = null;

  if (isProtected && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    res = NextResponse.redirect(url);
  } else if (session && isAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = session.role === "ADMIN" ? "/admin" : "/dashboard";
    url.search = "";
    res = NextResponse.redirect(url);
  } else if (session && (pathname === "/admin" || pathname.startsWith("/admin/")) && session.role !== "ADMIN") {
    // non-admins never reach the admin shell (APIs re-verify server-side)
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    res = NextResponse.redirect(url);
  }

  const outgoing = res ?? NextResponse.next();
  outgoing.headers.set("X-Content-Type-Options", "nosniff");
  outgoing.headers.set("X-Frame-Options", "DENY");
  outgoing.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  outgoing.headers.set("X-DNS-Prefetch-Control", "off");
  return outgoing;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/register"],
};
