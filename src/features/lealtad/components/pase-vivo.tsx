"use client";

import { useEffect, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { cambioDeTarjeta, type VistaTarjeta } from "../motor";

/** Al volver a la pestaña no se recarga más de una vez en este lapso. */
const ESPERA_RECARGA_MS = 10_000;
const COLORES_CONFETI = ["#A855F7", "#FFFFFF", "#7C3AED", "#C4B5FD", "#6D28D9"];

function leerVista(codigo: string): VistaTarjeta | null {
  try {
    const crudo = window.localStorage.getItem(`armada-pase:${codigo}`);
    if (!crudo) return null;
    const v = JSON.parse(crudo) as Partial<VistaTarjeta>;
    return typeof v.sellos === "number" && typeof v.canjes === "number"
      ? { sellos: v.sellos, canjes: v.canjes, puntos: v.puntos, nivel: v.nivel }
      : null;
  } catch {
    return null;
  }
}

function guardarVista(codigo: string, vista: VistaTarjeta) {
  try {
    window.localStorage.setItem(`armada-pase:${codigo}`, JSON.stringify(vista));
  } catch {
    // Sin almacenamiento (modo privado): el pase se ve igual, sin animar.
  }
}

/** Confeti con la animación nativa del navegador; los pedazos se borran al terminar. */
function lanzarConfeti() {
  const capa = document.createElement("div");
  capa.setAttribute("aria-hidden", "true");
  capa.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50";
  document.body.appendChild(capa);
  const animaciones: Animation[] = [];
  for (let i = 0; i < 70; i++) {
    const pedazo = document.createElement("span");
    const ancho = 6 + Math.random() * 6;
    pedazo.style.cssText = `position:absolute;top:-16px;left:${Math.random() * 100}%;width:${ancho}px;height:${
      ancho * 0.45
    }px;border-radius:2px;background:${COLORES_CONFETI[i % COLORES_CONFETI.length]}`;
    capa.appendChild(pedazo);
    const deriva = (Math.random() - 0.5) * 220;
    animaciones.push(
      pedazo.animate(
        [
          { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
          {
            transform: `translate(${deriva}px, ${window.innerHeight + 40}px) rotate(${(Math.random() - 0.5) * 900}deg)`,
            opacity: 0.9,
          },
        ],
        { duration: 1800 + Math.random() * 1400, delay: Math.random() * 350, easing: "cubic-bezier(.2,.6,.4,1)" }
      )
    );
  }
  void Promise.allSettled(animaciones.map((a) => a.finished)).then(() => capa.remove());
}

/**
 * Envuelve el pase público (pintado en el servidor) para que se sienta vivo
 * (`TarjetaViva` de Symvora): recuerda en este celular lo que vio el cliente la
 * última vez; los sellos nuevos rebotan, al completar la tarjeta o subir de
 * nivel hay confeti. Con "reducir movimiento" solo hay un destello.
 *
 * "Actualizar" (y volver a la pestaña) pide el pase de nuevo al servidor: en
 * el mostrador el cliente lo ve cambiar al momento de pagar.
 */
export function PaseVivo({
  codigo,
  sellos,
  canjes,
  meta,
  puntos,
  nivel,
  children,
}: {
  codigo: string;
  sellos: number;
  canjes: number;
  meta: number;
  puntos: number;
  nivel: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const ultimaRecarga = useRef(0);
  const [recargando, iniciar] = useTransition();

  useEffect(() => {
    const actual: VistaTarjeta = { sellos, canjes, puntos, nivel };
    const cambio = cambioDeTarjeta(leerVista(codigo), actual, meta);
    guardarVista(codigo, actual);

    const raiz = ref.current;
    if (!raiz || (cambio.nuevos.length === 0 && !cambio.completa && !cambio.subioNivel)) return;
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    cambio.nuevos.forEach((i, orden) => {
      raiz.querySelector<HTMLElement>(`[data-sello="${i}"]`)?.animate(
        reducir
          ? [{ opacity: 0.35 }, { opacity: 1 }]
          : [
              { transform: "scale(0.2)", opacity: 0 },
              { transform: "scale(1.3)", opacity: 1, offset: 0.55 },
              { transform: "scale(0.9)", offset: 0.8 },
              { transform: "scale(1)" },
            ],
        { duration: reducir ? 500 : 650, delay: 250 + orden * 160, easing: "ease-out", fill: "backwards" }
      );
    });

    if (!cambio.completa && !cambio.subioNivel) return;
    const espera = 250 + cambio.nuevos.length * 160 + 300;
    const t = window.setTimeout(() => {
      const brinco = reducir
        ? [{ opacity: 0.4 }, { opacity: 1 }]
        : [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(0.96)" }, { transform: "scale(1)" }];
      if (cambio.completa) raiz.querySelector<HTMLElement>("[data-premio]")?.animate(brinco, { duration: 700 });
      if (cambio.subioNivel) raiz.querySelector<HTMLElement>("[data-nivel]")?.animate(brinco, { duration: 700 });
      if (!reducir) lanzarConfeti();
    }, espera);
    return () => window.clearTimeout(t);
  }, [codigo, sellos, canjes, meta, puntos, nivel]);

  const recargar = () => {
    ultimaRecarga.current = Date.now();
    iniciar(() => router.refresh());
  };

  // De vuelta a la pestaña (p. ej. tras pagar en caja): trae el pase al día.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaRecarga.current < ESPERA_RECARGA_MS) return;
      ultimaRecarga.current = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [router]);

  return (
    <div ref={ref} className="flex w-full flex-col items-center gap-3">
      {children}
      <button
        type="button"
        onClick={recargar}
        disabled={recargando}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-purple-200 transition-colors hover:bg-purple-950 disabled:opacity-60"
      >
        {recargando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Actualizar mi pase
      </button>
    </div>
  );
}
