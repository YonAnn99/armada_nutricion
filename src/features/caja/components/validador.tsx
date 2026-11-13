"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Loader2, MessageCircle, ScanLine } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { VentanaPase } from "@/features/lealtad/components/ventana-pase";
import { mensajeRegistro, urlAlta, urlWhatsApp } from "@/features/lealtad/motor";
import type { TarjetaStaff } from "@/features/lealtad/types";
import { usePrograma } from "@/features/lealtad/use-programa";
import { copiar } from "@/lib/portapapeles";
import { BarraCaja } from "./buscador";
import { PanelValidacion } from "./panel-validacion";
import { PaseManual } from "./pase-manual";

/**
 * Validador de caja. KYTE cobra; aquí se identifica al cliente, se lee qué
 * aplicar y se registra el total cobrado. Pensado para usarse decenas de
 * veces al día: cero scroll por venta y flujo de teclado completo
 * (lector láser → total → Enter → Esc).
 */
export function Validador() {
  const { config, niveles, error } = usePrograma();
  const [tarjeta, setTarjeta] = useState<TarjetaStaff | null>(null);
  const [manual, setManual] = useState(false);
  const [verPase, setVerPase] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);

  /** El foco vuelve al campo del código: el siguiente escaneo funciona sin tocar la pantalla. */
  const enfocarCodigo = useCallback(() => {
    window.requestAnimationFrame(() => campoRef.current?.focus());
  }, []);

  const siguiente = useCallback(() => {
    setTarjeta(null);
    enfocarCodigo();
  }, [enfocarCodigo]);

  // Esc = siguiente cliente (si no hay una ventana abierta, que Esc cierra primero).
  useEffect(() => {
    if (!tarjeta) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) return;
      siguiente();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [tarjeta, siguiente]);

  if (error) {
    return <p className="rounded-2xl bg-destructive/15 p-4 text-sm text-red-300">{error}</p>;
  }
  if (!config) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-purple-400" aria-label="Cargando" />
      </div>
    );
  }

  const linkRegistro = config.alta_publica && config.codigo_alta ? urlAlta(config.codigo_alta) : null;

  return (
    <div className="space-y-5">
      <BarraCaja campoRef={campoRef} onTarjeta={setTarjeta} onNuevoPase={() => setManual(true)} />

      {tarjeta ? (
        <PanelValidacion
          key={tarjeta.id}
          tarjeta={tarjeta}
          config={config}
          niveles={niveles}
          onActualizada={setTarjeta}
          onRegistrada={enfocarCodigo}
          onSiguiente={siguiente}
          onVerPase={() => setVerPase(true)}
        />
      ) : (
        <div className="card-glass flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-3xl p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
            <ScanLine className="h-7 w-7 text-purple-300" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-xl font-black">Esperando pase</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Escanea el QR del cliente con el lector o la cámara, o escribe su folio, celular o nombre arriba.
            </p>
          </div>
          <div className="mt-2 w-full max-w-sm border-t border-border pt-5">
            <p className="text-sm font-semibold">¿El cliente aún no tiene pase?</p>
            {linkRegistro ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href={urlWhatsApp(
                    null,
                    mensajeRegistro({
                      url: linkRegistro,
                      puntos: config.cashback_activo ? config.puntos_bienvenida : 0,
                      nombrePuntos: config.nombre_puntos,
                    })
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline" })}
                >
                  <MessageCircle className="h-4 w-4" /> Enviar registro
                </a>
                <Button variant="outline" onClick={() => void copiar(linkRegistro, "Link de registro copiado")}>
                  <Copy className="h-4 w-4" /> Copiar link
                </Button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Créale uno con “Nuevo pase”. El registro con QR se activa en Panel → QR de mostrador.
              </p>
            )}
          </div>
        </div>
      )}

      <PaseManual
        abierto={manual}
        onAbiertoChange={setManual}
        config={config}
        niveles={niveles}
        onCreado={setTarjeta}
      />
      <VentanaPase tarjeta={tarjeta} config={config} niveles={niveles} abierta={verPase} onAbiertaChange={setVerPase} />
    </div>
  );
}
