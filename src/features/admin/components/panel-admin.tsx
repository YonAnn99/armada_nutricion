"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Loader2, QrCode, SlidersHorizontal, UserCog, Users, BarChart3 } from "lucide-react";
import { fetchTarjetas, mensajeDeError } from "@/features/lealtad/servicio";
import type { TarjetaStaff } from "@/features/lealtad/types";
import { usePrograma } from "@/features/lealtad/use-programa";
import { cn } from "@/lib/utils";
import { Bitacora } from "./bitacora";
import { Clientes } from "./clientes";
import { Dinamicas } from "./dinamicas";
import { Equipo } from "./equipo";
import { QrMostrador } from "./qr-mostrador";
import { Resumen } from "./resumen";

const PESTANAS = [
  { id: "resumen", texto: "Resumen", icono: BarChart3 },
  { id: "dinamicas", texto: "Dinámicas", icono: SlidersHorizontal },
  { id: "clientes", texto: "Clientes", icono: Users },
  { id: "bitacora", texto: "Bitácora", icono: ClipboardList },
  { id: "qr", texto: "QR de mostrador", icono: QrCode },
  { id: "equipo", texto: "Equipo", icono: UserCog },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];

/** "3. Panel Admin" del simulador, con las pestañas en la URL (`?tab=`). */
export function PanelAdmin({ miUserId }: { miUserId: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const pedida = params.get("tab");
  const pestana: Pestana = PESTANAS.some((p) => p.id === pedida) ? (pedida as Pestana) : "resumen";
  const programa = usePrograma();
  const [tarjetas, setTarjetas] = useState<TarjetaStaff[] | null>(null);
  const [errorTarjetas, setErrorTarjetas] = useState<string | null>(null);

  const cargarTarjetas = useCallback(async () => {
    try {
      setTarjetas(await fetchTarjetas());
      setErrorTarjetas(null);
    } catch (e) {
      setErrorTarjetas(mensajeDeError(e));
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void cargarTarjetas(), 0);
    return () => window.clearTimeout(t);
  }, [cargarTarjetas]);

  /** Una tarjeta cambió (ajuste, cupón, edición): se reemplaza en la lista sin recargar todo. */
  const actualizarTarjeta = useCallback((t: TarjetaStaff) => {
    setTarjetas((lista) => {
      if (!lista) return lista;
      const i = lista.findIndex((x) => x.id === t.id);
      return i < 0 ? [t, ...lista] : lista.map((x) => (x.id === t.id ? t : x));
    });
  }, []);

  /** Cambia de pestaña (en la URL). `filtro` abre Clientes ya filtrado (desde "Por atender"). */
  const ir = (id: Pestana, filtro?: string) => {
    const q = new URLSearchParams(params);
    if (id === "resumen") q.delete("tab");
    else q.set("tab", id);
    if (filtro) q.set("filtro", filtro);
    else q.delete("filtro");
    router.replace(`${ruta}${q.size ? `?${q}` : ""}`, { scroll: false });
  };

  const { config, niveles } = programa;
  const error = programa.error ?? errorTarjetas;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-black tracking-tight">Programa de lealtad</h1>

      <nav
        className="-mx-4 flex gap-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
        role="tablist"
        aria-label="Secciones del panel"
      >
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            onClick={() => ir(p.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2.5 text-sm transition-colors duration-150",
              pestana === p.id
                ? "border-purple-500 font-semibold text-white"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <p.icono className="h-4 w-4" aria-hidden="true" />
            {p.texto}
          </button>
        ))}
      </nav>

      {error && <p className="rounded-2xl bg-destructive/15 p-4 text-sm text-red-300">{error}</p>}

      {!config ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-purple-400" aria-label="Cargando" />
        </div>
      ) : (
        <div role="tabpanel">
          {pestana === "resumen" && <Resumen config={config} tarjetas={tarjetas} onIrA={ir} />}
          {pestana === "dinamicas" && (
            <Dinamicas
              config={config}
              niveles={niveles}
              tarjetas={tarjetas ?? []}
              onGuardado={(c, n) => {
                programa.setConfig(c);
                programa.setNiveles(n);
              }}
            />
          )}
          {pestana === "clientes" && (
            <Clientes
              config={config}
              niveles={niveles}
              tarjetas={tarjetas}
              filtroInicial={params.get("filtro")}
              onActualizada={actualizarTarjeta}
              onRecargar={cargarTarjetas}
            />
          )}
          {pestana === "bitacora" && <Bitacora />}
          {pestana === "qr" && <QrMostrador config={config} onConfig={programa.setConfig} />}
          {pestana === "equipo" && <Equipo miUserId={miUserId} />}
        </div>
      )}
    </div>
  );
}
