import { NextResponse } from "next/server";
import { obtenerTarjetaPublica } from "@/features/lealtad/publico.server";

/**
 * Manifest de UN pase: con "Agregar a pantalla de inicio" el acceso directo
 * abre ese pase y no el panel del equipo.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  const pase = await obtenerTarjetaPublica(codigo);
  if (!pase) return NextResponse.json({ error: "Pase no encontrado" }, { status: 404 });

  const ruta = `/tarjeta/${pase.tarjeta.codigo}`;
  return NextResponse.json(
    {
      name: "Armada Pass",
      short_name: "Armada Pass",
      id: ruta,
      start_url: ruta,
      scope: ruta,
      display: "standalone",
      background_color: "#050507",
      theme_color: "#050507",
      icons: [
        { src: "/marca/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/marca/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
  );
}
