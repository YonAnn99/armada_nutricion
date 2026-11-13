import type { Metadata } from "next";
import { QrCode } from "lucide-react";
import { Marca } from "@/components/marca";
import { FormularioAlta } from "@/features/lealtad/components/formulario-alta";
import { PaseArmada } from "@/features/lealtad/components/pase-armada";
import { obtenerProgramaAlta } from "@/features/lealtad/publico.server";
import { hoyMexico } from "@/features/lealtad/motor";

/**
 * Registro autónomo con el QR del mostrador (Symvora 121). Público: el cliente
 * escanea el cartel, ve cómo será su pase y se registra en segundos.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Obtén tu pase", robots: { index: false, follow: false } };

export default async function UnirsePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const programa = await obtenerProgramaAlta(codigo);

  if (!programa) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="max-w-sm space-y-3 text-center">
          <QrCode className="mx-auto h-10 w-10 text-purple-400" aria-hidden="true" />
          <h1 className="font-display text-lg font-black uppercase">Registro no disponible</h1>
          <p className="text-sm text-muted-foreground">Este código ya no está activo. Pide tu pase en caja.</p>
        </div>
      </main>
    );
  }

  const { config, niveles } = programa;
  const hoy = hoyMexico(programa.hoy);
  const vistaPrevia = {
    codigo: "XXXXXXXXXXXX",
    folio: "ARM-000",
    gasto_historico: 0,
    puntos: config.cashback_activo ? config.puntos_bienvenida : 0,
    sellos: 0,
    premios_canjeados: 0,
    regla_vip: null,
    cupon_reactivacion: false,
    cumple_canjeado_anio: null,
    permite_niveles: true,
    permite_cashback: true,
    permite_sellos: true,
    permite_promo: true,
    permite_cumple: true,
    permite_compartida: true,
    activa: true,
  };

  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 px-4 py-8">
      <Marca completa className="w-40" />
      <FormularioAlta
        codigoAlta={programa.codigo_alta}
        puntosBienvenida={config.cashback_activo ? config.puntos_bienvenida : 0}
        nombrePuntos={config.nombre_puntos}
        pideCumple={config.cumple_activo}
        avisoUrl={config.aviso_privacidad_url}
      />
      <div className="w-full max-w-sm space-y-2">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-purple-300">Así se verá tu pase</p>
        <PaseArmada
          datos={{ tarjeta: vistaPrevia, nombre: "", mesCumple: null, config, niveles, hoy, qrSvg: null }}
          className="opacity-90"
        />
      </div>
    </main>
  );
}
