import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Sin sesión se puede entrar aquí: el pase, el registro con QR y el login. */
const PUBLICAS = ["/tarjeta/", "/unirse/", "/login", "/api/unirse", "/api/tarjeta/"];

/**
 * Refresca la sesión de Supabase en cada navegación (cookies) y manda al login
 * a quien no tiene sesión en las páginas del equipo. El rol (admin/cajero) se
 * revisa en cada página con `exigirStaff` / `exigirAdmin`, y en la base con RLS.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const ruta = request.nextUrl.pathname;
  const publica = PUBLICAS.some((p) => ruta === p.replace(/\/$/, "") || ruta.startsWith(p));

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !publica && !ruta.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Nada de esto debe aparecer en buscadores: el pase lleva un código secreto en la URL.
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|manifest|zxing/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm)$).*)"],
};
