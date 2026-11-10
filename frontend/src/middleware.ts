import { NextResponse, type NextRequest } from "next/server";

/**
 * Detrás de Cloudflare, una petición que llegó por HTTP se redirige a HTTPS (la cookie de sesión es Secure).
 * Cloudflare informa del esquema original en CF-Visitor; Next añade su propio X-Forwarded-Proto incluso en local, así que no se usa. Sin CF-Visitor (acceso local) no actúa.
 */
export function middleware(req: NextRequest) {
  const visitante = req.headers.get("cf-visitor") ?? "";
  const http = visitante.includes('"scheme":"http"');
  if (!http) return NextResponse.next();
  const host = req.headers.get("host");
  if (!host) return NextResponse.next();
  return NextResponse.redirect(`https://${host}${req.nextUrl.pathname}${req.nextUrl.search}`, 308);
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
