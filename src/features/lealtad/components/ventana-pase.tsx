"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copiar } from "@/lib/portapapeles";
import { estadoPase, hoyMexico, mensajePase, urlTarjeta, urlWhatsApp } from "../motor";
import { qrSvg } from "../qr";
import type { ConfigLealtad, Nivel, TarjetaStaff } from "../types";
import { PaseArmada } from "./pase-armada";

/**
 * El pase del cliente para el equipo (Symvora `VentanaTarjeta`, sin email ni
 * Wallet): verlo, mandarlo por WhatsApp con la plantilla del simulador,
 * copiar el enlace o abrirlo.
 */
export function VentanaPase({
  tarjeta,
  config,
  niveles,
  abierta,
  onAbiertaChange,
}: {
  tarjeta: TarjetaStaff | null;
  config: ConfigLealtad;
  niveles: Nivel[];
  abierta: boolean;
  onAbiertaChange: (v: boolean) => void;
}) {
  const [svg, setSvg] = useState<{ codigo: string; svg: string } | null>(null);
  const url = tarjeta ? urlTarjeta(tarjeta.codigo) : "";

  useEffect(() => {
    if (!tarjeta || !abierta) return;
    let vivo = true;
    void qrSvg(urlTarjeta(tarjeta.codigo)).then((s) => vivo && setSvg({ codigo: tarjeta.codigo, svg: s }));
    return () => {
      vivo = false;
    };
  }, [tarjeta, abierta]);

  if (!tarjeta) return null;
  const hoy = hoyMexico();
  const estado = estadoPase(tarjeta, tarjeta.cliente.mes_cumple, config, niveles, hoy);
  const estatus = estado.vip
    ? config.vip_nombre_regla
    : estado.nivel
      ? `${estado.nivel.nombre} (${estado.beneficio.texto})`
      : "Miembro";
  const texto = mensajePase({
    nombre: tarjeta.cliente.nombre,
    url,
    folio: tarjeta.folio,
    estatus,
    nombrePuntos: config.nombre_puntos,
    puntos: tarjeta.puntos,
  });

  return (
    <Dialog open={abierta} onOpenChange={onAbiertaChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pase de {tarjeta.cliente.nombre}</DialogTitle>
          <DialogDescription>#{tarjeta.folio} · compártelo por WhatsApp o copia el enlace.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center">
          <PaseArmada
            datos={{
              tarjeta,
              nombre: tarjeta.cliente.nombre,
              mesCumple: tarjeta.cliente.mes_cumple,
              config,
              niveles,
              hoy,
              qrSvg: svg?.codigo === tarjeta.codigo ? svg.svg : null,
            }}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <a
            href={urlWhatsApp(tarjeta.cliente.telefono, texto)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ className: "sm:col-span-3" })}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Enviar por WhatsApp
          </a>
          <Button variant="outline" className="sm:col-span-2" onClick={() => void copiar(url, "Enlace del pase copiado")}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copiar enlace
          </Button>
          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Abrir
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
