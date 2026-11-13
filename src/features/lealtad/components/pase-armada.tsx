/**
 * El "Armada Pass" tal como lo ve el cliente: monograma, nivel o VIP, nombre,
 * QR real, Puntos Armada, beneficio de nivel, sellos y alertas activas.
 * Diseño del simulador; estructura de `TarjetaVisual` de Symvora.
 *
 * Sin hooks ni "use client": lo pintan el pase público (servidor), la vista
 * previa de Dinámicas y el pase manual de caja, y tienen que verse IGUAL.
 * `data-sello`, `data-premio` y `data-nivel` los anima `PaseVivo`.
 */
import { Cake, CheckCheck, Flame, Gift, Handshake, Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { codigoAgrupado, estadoPase, iconoDeSello, nombreMes, pct, type Hoy } from "../motor";
import type { ConfigLealtad, Nivel, TarjetaBase } from "../types";
import { ICONO_SELLO } from "./iconos";

export interface DatosPase {
  tarjeta: TarjetaBase;
  /** Nombre a mostrar (en el pase público, solo el primero). */
  nombre: string;
  mesCumple: number | null;
  config: ConfigLealtad;
  niveles: Nivel[];
  hoy: Hoy;
  /** SVG del QR ya generado. Sin él se pinta un hueco con el folio (vista previa). */
  qrSvg?: string | null;
}

const fmt = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString("es-MX")}`;

export function PaseArmada({ datos, className }: { datos: DatosPase; className?: string }) {
  const { tarjeta, config, niveles, hoy } = datos;
  const e = estadoPase(tarjeta, datos.mesCumple, config, niveles, hoy);
  const Sello = ICONO_SELLO[iconoDeSello(config.icono_sello)];
  const mes = nombreMes(datos.mesCumple);

  const badge = e.vip
    ? { texto: `⭐ ${config.vip_nombre_regla}`, clase: "bg-white text-black border-purple-300" }
    : e.nivel
      ? e.esNivelMaximo
        ? { texto: e.nivel.nombre, clase: "bg-white text-black border-white" }
        : { texto: e.nivel.nombre, clase: "bg-purple-600 text-white border-purple-300/60" }
      : { texto: "Miembro", clase: "bg-black text-purple-200 border-purple-500/60" };

  const columnas = Math.min(e.sellos.meta + 1, 6);

  return (
    <div
      className={cn(
        "pase-gradiente relative w-full max-w-sm overflow-hidden rounded-3xl border border-purple-400/30 p-5 text-white shadow-2xl",
        !tarjeta.activa && "grayscale",
        className
      )}
    >
      {/* Encabezado */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-black shadow">
            {/* eslint-disable-next-line @next/next/no-img-element -- también se pinta en el servidor y en vistas previas */}
            <img src="/marca/isotipo.png" alt="Armada Nutrition" width={26} height={21} className="h-auto w-[26px]" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-black uppercase tracking-wider">Armada Pass</p>
            <p className="truncate font-mono text-[11px] text-purple-200/80">#{tarjeta.folio}</p>
          </div>
        </div>
        <span
          data-nivel
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider shadow",
            badge.clase
          )}
        >
          {badge.texto}
        </span>
      </div>

      {/* Titular */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300">Atleta titular</span>
          {e.usaCumple && mes && <span className="text-[10px] font-bold text-purple-200">🎂 {mes}</span>}
        </div>
        <p className="font-display truncate text-xl font-black">{datos.nombre || "Tu nombre"}</p>
      </div>

      {/* QR: fondo blanco SIEMPRE, el escáner lee mal un QR sobre fondo oscuro. */}
      <div className="mx-auto mb-4 flex w-48 flex-col items-center rounded-2xl border-4 border-purple-400/40 bg-white p-3 text-black shadow-xl">
        {datos.qrSvg ? (
          <div className="w-full [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: datos.qrSvg }} />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-purple-300 text-[10px] font-bold uppercase tracking-wider text-purple-700">
            QR del cliente
          </div>
        )}
        <p className="font-display mt-2 text-[11px] font-black tracking-widest">{tarjeta.folio}</p>
        {datos.qrSvg && (
          <p className="font-mono text-[9px] tracking-widest text-zinc-500">{codigoAgrupado(tarjeta.codigo)}</p>
        )}
      </div>

      {/* Saldos */}
      {(e.usaCashback || tarjeta.puntos > 0 || e.usaNiveles) && (
        <div className={cn("mb-4 grid gap-2.5", e.usaNiveles ? "grid-cols-2" : "grid-cols-1")}>
          <div className="rounded-2xl bg-white p-3 text-center text-black shadow-md">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-purple-800">{config.nombre_puntos}</p>
            <p className="font-display text-xl font-black">{fmt(tarjeta.puntos)} MXN</p>
            <p className="text-[10px] font-semibold text-zinc-600">
              {e.usaCashback ? `Cashback ${pct(config.cashback_pct)}% activo` : "Sin acumulación de puntos"}
            </p>
          </div>
          {e.usaNiveles && (
            <div className="rounded-2xl border border-purple-400/40 bg-black/80 p-3 text-center">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300">Beneficio nivel</p>
              <p className="font-display text-xl font-black">{e.nivel ? `${pct(e.nivel.descuento_pct)}% OFF` : "Estándar"}</p>
              {config.mostrar_gasto_en_pase && (
                <p className="text-[10px] text-purple-200/70">
                  {e.siguiente
                    ? `Llevas ${fmt(tarjeta.gasto_historico)} / Meta ${fmt(e.siguiente.gasto_minimo)}`
                    : `Acumulado: ${fmt(tarjeta.gasto_historico)}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sellos */}
      {e.usaSellos && (
        <div className="mb-4 rounded-2xl border border-purple-500/30 bg-black/80 p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider">
              <Sello className="h-3.5 w-3.5 shrink-0 text-purple-400" aria-hidden="true" />
              <span className="truncate">{config.sellos_titulo}</span>
            </span>
            <span className="shrink-0 rounded-full border border-purple-700 bg-purple-950 px-2 py-0.5 text-[11px] font-black text-purple-300">
              {Math.min(tarjeta.sellos, e.sellos.meta)} / {e.sellos.meta}
            </span>
          </div>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}
            role="img"
            aria-label={`${e.sellos.llenos} de ${e.sellos.meta} sellos`}
          >
            {Array.from({ length: e.sellos.meta }, (_, i) => {
              const lleno = i < e.sellos.llenos;
              return (
                <div
                  key={i}
                  data-sello={i}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-xl border",
                    lleno
                      ? "border-white bg-purple-600 text-white shadow-md shadow-purple-600/40"
                      : "border-purple-800/70 bg-black/60 text-purple-700"
                  )}
                >
                  <Sello className="h-3.5 w-3.5" strokeWidth={lleno ? 2.75 : 2} aria-hidden="true" />
                </div>
              );
            })}
            <div
              data-premio
              title="Premio"
              className={cn(
                "flex h-9 items-center justify-center rounded-xl border",
                e.premioSellos
                  ? "animate-pulse border-purple-400 bg-white text-black"
                  : "border-purple-500/40 bg-purple-950/60 text-purple-300"
              )}
            >
              <Gift className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-2.5 text-center text-[10px] font-medium text-purple-200/80">
            {e.premioSellos ? (
              <span className="font-bold text-white">¡Premio listo! Pídelo en caja: {config.sellos_premio}</span>
            ) : (
              <>
                Premio al cumplir {e.sellos.meta}: {config.sellos_premio}
              </>
            )}
          </p>
        </div>
      )}

      {/* Alertas activas */}
      <div className="space-y-2">
        {e.vip && (
          <Alerta className="bg-white text-black shadow">
            <Star className="h-3.5 w-3.5 shrink-0 text-purple-700" aria-hidden="true" />
            {config.vip_nombre_regla}: {e.vip}
          </Alerta>
        )}
        {e.cupon && !e.vip && (
          <Alerta className="border border-white bg-purple-600 text-white shadow">
            <Flame className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ¡Cupón de regreso!: {config.reactivacion_texto}
          </Alerta>
        )}
        {e.cumpleDisponible && (
          <Alerta className="border border-purple-400/50 bg-purple-950/90 text-white">
            <Cake className="h-3.5 w-3.5 shrink-0 text-purple-300" aria-hidden="true" />
            🎂 ¡Feliz cumpleaños! Tu regalo: {config.cumple_texto}
          </Alerta>
        )}
        {e.cumpleEntregado && (
          <Alerta className="border border-purple-800 bg-black/80 text-purple-300">
            <CheckCheck className="h-3.5 w-3.5 shrink-0 text-purple-400" aria-hidden="true" />
            🎂 Regalo de cumpleaños ya entregado este año
          </Alerta>
        )}
        {e.promo && (
          <Alerta className="border border-purple-500/50 bg-black/90 text-purple-200">
            <Zap className="h-3.5 w-3.5 shrink-0 text-purple-400" aria-hidden="true" />
            Promo relámpago: {e.promo}
          </Alerta>
        )}
        {!tarjeta.activa && (
          <Alerta className="border border-zinc-600 bg-black/80 text-zinc-300">Esta tarjeta no está activa por ahora.</Alerta>
        )}
      </div>

      {e.usaCompartida && config.compartida_bono_pts > 0 && (
        <p className="mt-4 flex items-start gap-2 border-t border-purple-500/20 pt-3 text-[10px] leading-relaxed text-purple-200/80">
          <Handshake className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-400" aria-hidden="true" />
          <span>
            ¡Comparte tu código! Si un amigo compra con tu pase, ganas{" "}
            <strong className="text-white">
              +{config.compartida_bono_pts} {config.nombre_puntos}
            </strong>
            .
          </span>
        </p>
      )}
    </div>
  );
}

function Alerta({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold", className)}>{children}</div>;
}
