"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { hoyMexico, panelLealtad } from "@/features/lealtad/motor";
import { fetchResumen, mensajeDeError, type ResumenAdmin } from "@/features/lealtad/servicio";
import type { ConfigLealtad, TarjetaStaff } from "@/features/lealtad/types";
import { formatMXN0 } from "@/lib/money";
import { cn } from "@/lib/utils";

// Chart.js solo baja al abrir el resumen.
const GraficaVisitas = dynamic(() => import("./grafica-visitas").then((m) => m.GraficaVisitas), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-2xl bg-muted/40" />,
});

type Preset = "hoy" | "7d" | "mes" | "todo" | "rango";

const PRESETS: [Preset, string][] = [
  ["hoy", "Hoy"],
  ["7d", "7 días"],
  ["mes", "Este mes"],
  ["todo", "Todo"],
  ["rango", "Rango…"],
];

/** Medianoche de hoy (hora local del navegador, que en la tienda es México). */
function inicioDelDia(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function rangoDe(preset: Preset, desde: string, hasta: string): [Date | null, Date | null] {
  const hoy = inicioDelDia();
  if (preset === "hoy") return [hoy, null];
  if (preset === "7d") return [new Date(hoy.getTime() - 6 * 86_400_000), null];
  if (preset === "mes") return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), null];
  if (preset === "rango") {
    const d = desde ? new Date(`${desde}T00:00:00`) : null;
    const h = hasta ? new Date(new Date(`${hasta}T00:00:00`).getTime() + 86_400_000) : null;
    return [d, h];
  }
  return [null, null];
}

export function Resumen({
  config,
  tarjetas,
  onIrA,
}: {
  config: ConfigLealtad;
  tarjetas: TarjetaStaff[] | null;
  onIrA: (pestana: "clientes", filtro?: string) => void;
}) {
  const [preset, setPreset] = useState<Preset>("mes");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [resumen, setResumen] = useState<ResumenAdmin | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const [d, h] = rangoDe(preset, desde, hasta);
    const t = window.setTimeout(() => {
      setCargando(true);
      fetchResumen(d, h)
        .then((r) => vivo && (setResumen(r), setError(null)))
        .catch((e) => vivo && setError(mensajeDeError(e)))
        .finally(() => vivo && setCargando(false));
    }, 0);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [preset, desde, hasta]);

  const panel = useMemo(
    () => (tarjetas ? panelLealtad(tarjetas.map((t) => ({ ...t, mes_cumple: t.cliente.mes_cumple })), config, hoyMexico()) : null),
    [tarjetas, config]
  );

  const porAtender: { filtro: string; n: number | undefined; texto: [string, string] }[] = [
    { filtro: "un-sello", n: panel?.aUnSello, texto: ["A un sello del premio", "A un sello del premio"] },
    { filtro: "premio", n: panel?.conPremio, texto: ["Premio por entregar", "Premios por entregar"] },
    { filtro: "cumple", n: panel?.cumpleanerosPendientes, texto: ["Cumpleaños sin regalo", "Cumpleaños sin regalo"] },
    { filtro: "inactivas", n: panel?.inactivasSinCupon, texto: ["Inactivo sin cupón", "Inactivos sin cupón"] },
  ];

  const enPeriodo: [string, number | undefined][] = [
    [`${config.nombre_puntos} dados`, resumen?.puntos_ganados],
    ["Sellos sumados", resumen?.sellos],
    ["Regalos de cumpleaños", resumen?.cumples],
    ["Puntos canjeados", resumen?.puntos_canjeados],
    ["Premios de sellos", resumen?.premios],
    ["Cupones usados", resumen?.cupones],
    ["Tarjetas prestadas", resumen?.prestadas],
  ];
  // Lo que sí pasó primero; los ceros al final y atenuados.
  enPeriodo.sort((a, b) => Number((b[1] ?? 0) > 0) - Number((a[1] ?? 0) > 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Periodo" className="flex gap-0.5 rounded-xl border border-border bg-card p-1">
          {PRESETS.map(([id, texto]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreset(id)}
              aria-pressed={preset === id}
              className={cn(
                "h-8 rounded-lg px-3 text-sm transition-colors duration-150",
                preset === id ? "bg-accent font-semibold text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {texto}
            </button>
          ))}
        </div>
        {preset === "rango" && (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-40" aria-label="Desde" />
            <span className="text-sm text-muted-foreground">a</span>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-40" aria-label="Hasta" />
          </div>
        )}
        {cargando && <Loader2 className="h-4 w-4 animate-spin text-purple-400" aria-label="Cargando" />}
      </div>

      {error && <p className="rounded-2xl bg-destructive/15 p-4 text-sm text-red-300">{error}</p>}

      {/* KPIs: un solo estilo; solo Ventas destaca. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
        <div className="col-span-2 rounded-3xl bg-white p-5 text-[#0b0a10] lg:col-span-1">
          <p className="text-sm font-semibold text-zinc-600">Ventas registradas</p>
          <p className="font-display tabular mt-1 truncate text-4xl font-black tracking-tight">{resumen ? formatMXN0(resumen.ventas) : "—"}</p>
          <p className="mt-1 text-sm text-zinc-600">
            {resumen ? `${resumen.visitas} ${resumen.visitas === 1 ? "compra" : "compras"} · ticket promedio ${formatMXN0(resumen.ticket_promedio)}` : ""}
          </p>
        </div>
        <Kpi
          titulo="Clientes"
          valor={resumen?.clientes_total}
          detalle={
            resumen ? (
              <>
                <span className="font-semibold text-purple-300">+{resumen.clientes_nuevos}</span> en el periodo · {resumen.altas_qr} por QR
              </>
            ) : null
          }
        />
        <Kpi
          titulo="Atendidos"
          valor={resumen?.clientes_atendidos}
          detalle={resumen?.dias_entre_visitas != null ? `Vuelven cada ${resumen.dias_entre_visitas} días` : "Sin datos de frecuencia"}
        />
        <Kpi
          titulo={`Inactivos +${config.reactivacion_dias} días`}
          valor={panel?.inactivas}
          detalle={panel ? `${panel.inactivasSinCupon} sin cupón de regreso` : null}
        />
      </div>

      <section aria-labelledby="por-atender">
        <h2 id="por-atender" className="mb-2.5 text-base font-bold">
          Por atender hoy
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {porAtender.map((p) => {
            const vacio = !p.n;
            return (
              <button
                key={p.filtro}
                type="button"
                onClick={() => onIrA("clientes", p.filtro)}
                disabled={vacio}
                className={cn(
                  "flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-colors duration-150",
                  vacio ? "border-border bg-card opacity-60" : "border-input bg-panel-2 hover:border-purple-700"
                )}
              >
                <span className={cn("font-display tabular text-3xl font-black", vacio ? "text-muted-foreground" : "text-purple-300")}>
                  {p.n ?? "—"}
                </span>
                <span className="min-w-0 flex-1 text-sm text-foreground/85">{p.n === 1 ? p.texto[0] : p.texto[1]}</span>
                {!vacio && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">Visitas por semana</h2>
            <span className="text-xs text-muted-foreground">Últimas 8 semanas</span>
          </div>
          {resumen ? <GraficaVisitas semanas={resumen.semanas} /> : <div className="h-56" />}
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="mb-2 text-base font-bold">En el periodo</h2>
          <dl className="divide-y divide-border text-sm">
            {enPeriodo.map(([titulo, valor]) => (
              <div key={titulo} className={cn("flex justify-between gap-3 py-2.5", !valor && "text-muted-foreground/70")}>
                <dt>{titulo}</dt>
                <dd className="tabular font-semibold">{valor ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: number | undefined; detalle: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className="font-display tabular mt-1 text-3xl font-black">{valor ?? "—"}</p>
      <p className="mt-1 truncate text-sm text-muted-foreground">{detalle}</p>
    </div>
  );
}
