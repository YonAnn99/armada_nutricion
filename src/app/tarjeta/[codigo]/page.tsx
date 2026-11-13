import type { Metadata } from "next";
import { CreditCard, Smartphone } from "lucide-react";
import { Marca } from "@/components/marca";
import { PaseArmada } from "@/features/lealtad/components/pase-armada";
import { PaseVivo } from "@/features/lealtad/components/pase-vivo";
import { obtenerTarjetaPublica } from "@/features/lealtad/publico.server";
import { estadoPase, hoyMexico, urlTarjeta } from "@/features/lealtad/motor";
import { qrSvg } from "@/features/lealtad/qr";

/**
 * Pase del cliente final. Público: lo abre desde el enlace que le mandaron por
 * WhatsApp o al registrarse con el QR, SIN cuenta. La consulta va con el
 * cliente anónimo y rate limit (`obtenerTarjetaPublica`).
 *
 * Dinámica: los saldos cambian con cada compra, nunca se sirve una copia vieja.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ codigo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  const pase = await obtenerTarjetaPublica(codigo);
  return {
    title: pase ? `Pase de ${pase.tarjeta.cliente}` : "Pase no encontrado",
    robots: { index: false, follow: false },
    // "Agregar a pantalla de inicio" abre ESTE pase.
    manifest: pase ? `/api/tarjeta/${pase.tarjeta.codigo}/manifest` : undefined,
  };
}

export default async function PasePage({ params }: Props) {
  const { codigo } = await params;
  const pase = await obtenerTarjetaPublica(codigo);

  if (!pase) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="max-w-sm space-y-3 text-center">
          <CreditCard className="mx-auto h-10 w-10 text-purple-400" aria-hidden="true" />
          <h1 className="font-display text-lg font-black uppercase">Pase no encontrado</h1>
          <p className="text-sm text-muted-foreground">
            Revisa que el enlace esté completo o pide en caja que te lo compartan otra vez.
          </p>
        </div>
      </main>
    );
  }

  const { tarjeta, config, niveles } = pase;
  const hoy = hoyMexico(pase.hoy);
  const estado = estadoPase(tarjeta, tarjeta.mes_cumple, config, niveles, hoy);
  const svg = await qrSvg(urlTarjeta(tarjeta.codigo));

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 px-4 py-8">
      <Marca className="py-1" />
      <PaseVivo
        codigo={tarjeta.codigo}
        sellos={tarjeta.sellos}
        canjes={tarjeta.premios_canjeados}
        meta={config.sellos_meta}
        puntos={tarjeta.puntos}
        nivel={estado.nivel?.nombre ?? null}
      >
        <PaseArmada
          datos={{ tarjeta, nombre: tarjeta.cliente, mesCumple: tarjeta.mes_cumple, config, niveles, hoy, qrSvg: svg }}
        />
      </PaseVivo>

      <details className="w-full max-w-sm rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
          <Smartphone className="h-4 w-4 text-purple-400" aria-hidden="true" />
          Guárdalo en tu celular
        </summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">iPhone:</span> toca Compartir y luego &quot;Agregar a
            pantalla de inicio&quot;.
          </p>
          <p>
            <span className="font-medium text-foreground">Android:</span> abre el menú ⋮ y elige &quot;Agregar a la
            pantalla principal&quot;.
          </p>
          <p>Así tu pase queda a un toque, sin descargar ninguna app.</p>
        </div>
      </details>
    </main>
  );
}
