"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fetchBitacora, mensajeDeError } from "@/features/lealtad/servicio";
import type { EntradaBitacora, TipoBitacora } from "@/features/lealtad/types";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";

const TIPOS: { id: TipoBitacora | "todos"; texto: string }[] = [
  { id: "todos", texto: "Todo" },
  { id: "venta", texto: "Ventas" },
  { id: "registro", texto: "Registros" },
  { id: "cliente", texto: "Clientes" },
  { id: "config", texto: "Configuración" },
];

const COLOR: Record<TipoBitacora, string> = {
  venta: "bg-white text-black",
  registro: "bg-purple-600 text-white",
  cliente: "bg-purple-950 text-purple-200 border border-purple-700",
  config: "bg-zinc-800 text-zinc-200",
};

/** "Bitácora de auditoría" del simulador: quién hizo qué y cuándo, para cuadrar contra KYTE. */
export function Bitacora() {
  const [tipo, setTipo] = useState<TipoBitacora | "todos">("todos");
  const [texto, setTexto] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filas, setFilas] = useState<EntradaBitacora[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const t = window.setTimeout(() => {
      fetchBitacora({
        tipo,
        texto,
        desde: desde ? new Date(`${desde}T00:00:00`) : null,
        hasta: hasta ? new Date(new Date(`${hasta}T00:00:00`).getTime() + 86_400_000) : null,
      })
        .then((f) => vivo && (setFilas(f), setError(null)))
        .catch((e) => vivo && setError(mensajeDeError(e)));
    }, texto ? 300 : 0);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [tipo, texto, desde, hasta]);

  const ventas = filas?.filter((f) => f.tipo === "venta") ?? [];
  const totalVentas = ventas.reduce((s, f) => s + (Number((f.detalle as { total?: number }).total) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="card-glass flex flex-wrap items-center gap-2 rounded-2xl p-3">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTipo(t.id)}
            aria-pressed={tipo === t.id}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider",
              tipo === t.id ? "bg-white text-black" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t.texto}
          </button>
        ))}
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar" className="h-9 pl-9" aria-label="Buscar en la bitácora" />
        </div>
        <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-40" aria-label="Desde" />
        <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-40" aria-label="Hasta" />
      </div>

      {ventas.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {ventas.length} ventas en la vista · <strong className="text-foreground">{formatMXN(totalVentas)}</strong> para cuadrar
          contra el corte de KYTE.
        </p>
      )}

      {error && <p className="rounded-2xl bg-destructive/15 p-4 text-sm text-red-300">{error}</p>}
      {!filas ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-purple-400" aria-label="Cargando" />
        </div>
      ) : filas.length === 0 ? (
        <p className="card-glass rounded-3xl p-10 text-center text-sm text-muted-foreground">Sin registros con estos filtros.</p>
      ) : (
        <ul className="space-y-2">
          {filas.map((f) => {
            const d = f.detalle as { resumen?: string[]; beneficio?: string; tarjeta_prestada?: boolean; folio_kyte?: string | null };
            return (
              <li key={f.id} className="card-glass rounded-2xl px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", COLOR[f.tipo])}>
                    {f.tipo}
                  </span>
                  {d.tarjeta_prestada && (
                    <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white">Tarjeta prestada</span>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(f.creado_en).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} · {f.actor}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold">{f.descripcion}</p>
                {(d.beneficio || (d.resumen && d.resumen.length > 0)) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[d.beneficio, ...(d.resumen ?? [])].filter(Boolean).join(" • ")}
                    {d.folio_kyte ? ` • KYTE ${d.folio_kyte}` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
