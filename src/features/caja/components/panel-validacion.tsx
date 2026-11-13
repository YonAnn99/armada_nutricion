"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Cake, CheckCheck, Coins, Eye, Flame, Handshake, Loader2, Star, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ICONO_SELLO } from "@/features/lealtad/components/iconos";
import {
  calcularCompra,
  diasDesde,
  estadoPase,
  hoyMexico,
  iconoDeSello,
  nombreMes,
  pct,
  primerNombre,
} from "@/features/lealtad/motor";
import { mensajeDeError, registrarCompra } from "@/features/lealtad/servicio";
import type { ConfigLealtad, Nivel, ResultadoCompra, TarjetaStaff } from "@/features/lealtad/types";
import { formatearTelefono } from "@/lib/telefono";
import { formatMXN, formatMXN0 } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Formulario {
  total: string;
  folio: string;
  prestada: boolean;
  sumarSello: boolean;
  usarPuntos: boolean;
  puntos: string;
  canjearSellos: boolean;
  entregarCumple: boolean;
  usarCupon: boolean;
}

function inicial(t: TarjetaStaff): Formulario {
  return {
    total: "",
    folio: "",
    prestada: false,
    sumarSello: true,
    usarPuntos: false,
    puntos: String(t.puntos),
    canjearSellos: false,
    entregarCumple: false,
    // Como en el simulador: si tiene cupón (y no es VIP), se aplica.
    usarCupon: t.cupon_reactivacion && !t.regla_vip,
  };
}

/**
 * Cliente validado: a la izquierda qué aplicar en KYTE, a la derecha el cierre.
 * Lado a lado para que no haya scroll en cada venta. La vista previa
 * (`calcularCompra`) es la misma regla que `registrar_compra`; el servidor la
 * vuelve a calcular y es quien manda.
 */
export function PanelValidacion({
  tarjeta,
  config,
  niveles,
  onActualizada,
  onRegistrada,
  onSiguiente,
  onVerPase,
}: {
  tarjeta: TarjetaStaff;
  config: ConfigLealtad;
  niveles: Nivel[];
  onActualizada: (t: TarjetaStaff) => void;
  onRegistrada: () => void;
  onSiguiente: () => void;
  onVerPase: () => void;
}) {
  const [f, setF] = useState<Formulario>(() => inicial(tarjeta));
  const [llave, setLlave] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<ResultadoCompra | null>(null);
  const hoy = useMemo(() => hoyMexico(), []);
  const cambiar = (c: Partial<Formulario>) => setF((x) => ({ ...x, ...c }));

  const estado = estadoPase(tarjeta, tarjeta.cliente.mes_cumple, config, niveles, hoy, { usarCupon: f.usarCupon });
  const totalNum = Number(f.total.replace(/[,$\s]/g, ""));
  const totalValido = f.total.trim() !== "" && Number.isFinite(totalNum) && totalNum >= 0;
  const puntosCanje = f.usarPuntos && !f.prestada ? Math.max(0, Math.floor(Number(f.puntos) || 0)) : 0;
  const vista = calcularCompra(tarjeta, tarjeta.cliente.mes_cumple, config, niveles, hoy, {
    total: totalValido ? totalNum : 0,
    prestada: f.prestada,
    sumarSello: f.sumarSello,
    canjearPuntos: puntosCanje,
    canjearSellos: f.canjearSellos && !f.prestada,
    entregarCumple: f.entregarCumple && !f.prestada,
    usarCupon: f.usarCupon && !f.prestada,
  });
  const beneficio = vista.beneficio;
  const Sello = ICONO_SELLO[iconoDeSello(config.icono_sello)];
  const dias = diasDesde(tarjeta.ultima_visita);
  const mes = nombreMes(tarjeta.cliente.mes_cumple);
  const puedeRegistrar = totalValido && vista.errores.length === 0 && !enviando && tarjeta.activa;

  const registrar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!puedeRegistrar) return;
    setEnviando(true);
    try {
      const r = await registrarCompra({
        tarjetaId: tarjeta.id,
        total: totalNum,
        folioKyte: f.folio,
        prestada: f.prestada,
        sumarSello: f.sumarSello,
        canjearPuntos: puntosCanje,
        canjearSellos: f.canjearSellos && !f.prestada,
        entregarCumple: f.entregarCumple && !f.prestada,
        usarCupon: f.usarCupon && !f.prestada,
        idempotencyKey: llave,
      });
      setUltimo(r);
      onActualizada(r.tarjeta);
      setF(inicial(r.tarjeta));
      setLlave(crypto.randomUUID());
      toast.success(`Compra de ${formatMXN(r.visita.total_ticket)} registrada`, {
        description: r.subio_nivel && r.nivel ? `¡Subió a ${r.nivel.nombre}!` : undefined,
      });
      onRegistrada();
    } catch (err) {
      // La llave se conserva: si la compra sí entró y se perdió la respuesta,
      // reintentar devuelve la misma visita en vez de duplicarla.
      toast.error(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const textoBeneficio =
    beneficio.tipo === "nivel" ? null : beneficio.tipo === "ninguno" ? "Promociones vigentes" : beneficio.texto;

  return (
    <div className="animate-aparecer grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* ---------------------------------------------------------- Cliente */}
      <section aria-label="Cliente" className="min-w-0 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-purple-300">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              {!tarjeta.activa ? "Pase desactivado" : f.prestada ? `Invitado de ${primerNombre(tarjeta.cliente.nombre)}` : "Pase verificado"}
            </p>
            <h1 className="font-display mt-1 truncate text-3xl font-black tracking-tight">{tarjeta.cliente.nombre}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-white px-2.5 py-1 font-bold text-black">
                {tarjeta.regla_vip ? "VIP" : (estado.nivel?.nombre ?? "Miembro")}
              </span>
              <Chip>{tarjeta.folio}</Chip>
              <Chip>{formatearTelefono(tarjeta.cliente.telefono)}</Chip>
              <Chip>{dias == null ? "Primera visita" : dias === 0 ? "Vino hoy" : `Vino hace ${dias} ${dias === 1 ? "día" : "días"}`}</Chip>
              {mes && <Chip>Cumple en {mes.toLowerCase()}</Chip>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onVerPase} className="shrink-0">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Ver pase
          </Button>
        </div>

        {/* Lo que se aplica en KYTE: blanco, alto contraste, se lee de lejos. */}
        <div className="rounded-3xl bg-white p-6 text-[#0b0a10]">
          <p className="text-xs font-bold text-purple-700">Aplicar en KYTE</p>
          {textoBeneficio ? (
            <p className="font-display mt-1.5 text-2xl font-black leading-tight sm:text-3xl">{textoBeneficio}</p>
          ) : (
            <p className="mt-1.5 flex items-baseline gap-3">
              <span className="font-display text-6xl font-black leading-none tracking-tight">{pct(beneficio.descuento_pct ?? 0)}%</span>
              <span className="text-xl font-bold">de descuento</span>
            </p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-sm text-zinc-600">
            {beneficio.tipo === "vip" && <Star className="h-4 w-4 text-purple-700" aria-hidden="true" />}
            {beneficio.tipo === "cupon" && <Flame className="h-4 w-4 text-purple-700" aria-hidden="true" />}
            {beneficio.tipo === "nivel"
              ? `Por ${beneficio.origen}${f.prestada ? " · bienvenida de invitado" : ` · gasto acumulado ${formatMXN0(tarjeta.gasto_historico)}`}`
              : beneficio.origen}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {estado.usaSellos && !f.prestada && (
            <Tarjeta destacada={estado.premioSellos}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Sello className="h-4 w-4" aria-hidden="true" /> {config.sellos_titulo}
                </span>
                <span className="tabular font-bold">
                  {Math.min(tarjeta.sellos, config.sellos_meta)} de {config.sellos_meta}
                </span>
              </div>
              <div className="mt-3 flex gap-1.5" role="img" aria-label={`${tarjeta.sellos} de ${config.sellos_meta} sellos`}>
                {Array.from({ length: config.sellos_meta }, (_, i) => (
                  <span
                    key={i}
                    className={cn("h-2 flex-1 rounded-full", i < tarjeta.sellos ? (estado.premioSellos ? "bg-white" : "bg-purple-500") : "bg-input")}
                  />
                ))}
              </div>
              <p className="mt-2.5 text-xs text-muted-foreground">
                {estado.premioSellos
                  ? `Premio listo: ${config.sellos_premio}`
                  : estado.sellos.faltan === 1
                    ? "Con esta compra completa su premio"
                    : `Le faltan ${estado.sellos.faltan} para: ${config.sellos_premio}`}
              </p>
            </Tarjeta>
          )}
          {!f.prestada && (estado.usaCashback || tarjeta.puntos > 0) && (
            <Tarjeta>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Coins className="h-4 w-4" aria-hidden="true" /> {config.nombre_puntos}
                </span>
              </div>
              <p className="font-display tabular mt-2 text-2xl font-black">
                ${tarjeta.puntos} <span className="font-sans text-sm font-medium text-muted-foreground">disponibles</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {estado.usaCashback ? `${pct(config.cashback_pct)}% de cashback en cada compra` : "Sin acumulación de puntos"}
              </p>
            </Tarjeta>
          )}
          {!f.prestada && estado.cumpleDisponible && (
            <Aviso destacada icono={<Cake className="h-5 w-5 text-purple-300" />} titulo="Cumpleaños este mes">
              Entregar: {config.cumple_texto}
            </Aviso>
          )}
          {!f.prestada && estado.cumpleEntregado && (
            <Aviso icono={<CheckCheck className="h-5 w-5 text-muted-foreground" />} titulo="Regalo de cumpleaños entregado">
              Ya lo recibió este año.
            </Aviso>
          )}
          {!f.prestada && tarjeta.cupon_reactivacion && tarjeta.regla_vip && (
            <Aviso icono={<Flame className="h-5 w-5 text-muted-foreground" />} titulo="Tiene cupón de regreso">
              Como VIP se aplica su regla, no el cupón.
            </Aviso>
          )}
          {estado.promo && (
            <Aviso icono={<Zap className="h-5 w-5 text-purple-300" />} titulo="Promo relámpago">
              {estado.promo}
            </Aviso>
          )}
          {f.prestada && vista.bonoCompartida > 0 && (
            <Aviso destacada icono={<Handshake className="h-5 w-5 text-purple-300" />} titulo="Tarjeta compartida">
              {primerNombre(tarjeta.cliente.nombre)} gana +{vista.bonoCompartida} {config.nombre_puntos}.
            </Aviso>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- Cierre */}
      <form
        onSubmit={registrar}
        aria-label="Cierre de la compra"
        className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5"
      >
        <div className="space-y-1.5">
          <label htmlFor="total" className="text-sm font-semibold">
            Total cobrado en KYTE
          </label>
          <div className="flex h-16 items-center gap-2 rounded-2xl border-2 border-input bg-panel-2 px-4 focus-within:border-purple-500">
            <span className="font-display text-2xl font-extrabold text-muted-foreground" aria-hidden="true">
              $
            </span>
            <input
              id="total"
              inputMode="decimal"
              autoFocus
              autoComplete="off"
              value={f.total}
              onChange={(e) => cambiar({ total: e.target.value })}
              placeholder="0"
              aria-invalid={f.total !== "" && !totalValido}
              aria-describedby="total-ayuda"
              className="font-display tabular h-full min-w-0 flex-1 bg-transparent text-3xl font-black outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <p id="total-ayuda" className="text-xs text-muted-foreground">
            Lo que pagó el cliente, ya con descuentos y puntos.
          </p>
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {estado.usaSellos && !f.prestada && !f.canjearSellos && (
            <Fila
              titulo={`+1 en ${config.sellos_titulo.toLowerCase()}`}
              detalle={vista.avisoSello ?? (config.compra_minima_sello > 0 ? `Compra mínima ${formatMXN0(config.compra_minima_sello)}` : undefined)}
              activa={f.sumarSello}
              onCambio={(v) => cambiar({ sumarSello: v })}
            />
          )}
          {estado.premioSellos && !f.prestada && (
            <Fila titulo="Entregar premio de sellos" detalle={config.sellos_premio} activa={f.canjearSellos} destacada onCambio={(v) => cambiar({ canjearSellos: v })} />
          )}
          {estado.cumpleDisponible && !f.prestada && (
            <Fila titulo="Entregar regalo de cumpleaños" detalle={config.cumple_texto} activa={f.entregarCumple} destacada onCambio={(v) => cambiar({ entregarCumple: v })} />
          )}
          {tarjeta.cupon_reactivacion && !tarjeta.regla_vip && !f.prestada && (
            <Fila titulo="Usar cupón de regreso" detalle={config.reactivacion_texto} activa={f.usarCupon} onCambio={(v) => cambiar({ usarCupon: v })} />
          )}
          {tarjeta.puntos > 0 && !f.prestada && (
            <Fila
              titulo={`Canjear ${config.nombre_puntos}`}
              detalle={`Disponibles: $${tarjeta.puntos}`}
              activa={f.usarPuntos}
              onCambio={(v) => cambiar({ usarPuntos: v, puntos: String(tarjeta.puntos) })}
            >
              {f.usarPuntos && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    inputMode="numeric"
                    value={f.puntos}
                    onChange={(e) => cambiar({ puntos: e.target.value.replace(/\D/g, "") })}
                    className="h-9 w-28"
                    aria-label="Puntos a canjear"
                  />
                  <span className="text-xs text-muted-foreground">de {tarjeta.puntos}</span>
                </div>
              )}
            </Fila>
          )}
          {(estado.usaCompartida || f.prestada) && (
            <Fila
              titulo="Tarjeta prestada a un amigo"
              detalle={estado.usaCompartida ? `+${config.compartida_bono_pts} pts al titular` : "Sin bono"}
              activa={f.prestada}
              onCambio={(v) =>
                cambiar({ prestada: v, ...(v ? { usarPuntos: false, canjearSellos: false, entregarCumple: false, usarCupon: false } : {}) })
              }
            />
          )}
        </div>

        <details className="group text-sm">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
            + Folio de KYTE (opcional)
          </summary>
          <Input
            value={f.folio}
            maxLength={40}
            onChange={(e) => cambiar({ folio: e.target.value })}
            aria-label="Folio de KYTE"
            className="mt-2"
          />
        </details>

        {totalValido && (
          <dl className="tabular space-y-1 text-sm">
            {vista.puntosGanados > 0 && <Resumen titulo="Cashback" valor={`+${vista.puntosGanados} pts`} />}
            {vista.bonoCompartida > 0 && <Resumen titulo="Bono de embajador" valor={`+${vista.bonoCompartida} pts`} />}
            {puntosCanje > 0 && <Resumen titulo="Puntos canjeados" valor={`−${puntosCanje} pts`} />}
            {(vista.sello || vista.premio) && (
              <Resumen
                titulo="Sellos"
                valor={vista.premio ? "Premio entregado" : `${vista.sellosFinales} de ${config.sellos_meta}${vista.sellosFinales >= config.sellos_meta ? " · premio listo" : ""}`}
              />
            )}
            {vista.cumple && <Resumen titulo="Cumpleaños" valor="Regalo entregado" />}
            {vista.subeNivel && vista.nivelFinal && <Resumen titulo="Nivel" valor={`Sube a ${vista.nivelFinal.nombre}`} destacado />}
            <Resumen titulo="Saldo final" valor={`$${vista.puntosFinales}`} />
          </dl>
        )}

        {vista.errores.length > 0 && totalValido && (
          <ul role="alert" className="space-y-1 rounded-xl bg-destructive/15 px-3 py-2.5 text-sm text-red-300">
            {vista.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {/* En celular el botón queda fijo abajo, al alcance del pulgar. */}
        <div className="pb-seguro sticky bottom-0 -mx-5 mt-auto space-y-1.5 border-t border-border bg-card px-5 pt-3 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
          <Button type="submit" size="lg" className="h-14 w-full rounded-2xl text-base font-bold" disabled={!puedeRegistrar}>
            {enviando && <Loader2 className="h-5 w-5 animate-spin" />}
            Registrar compra
            <kbd className="ml-1 hidden rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold sm:inline">Enter</kbd>
          </Button>
          <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={onSiguiente}>
            Siguiente cliente
            <kbd className="ml-1 hidden rounded-md bg-accent px-1.5 py-0.5 text-[11px] sm:inline">Esc</kbd>
          </Button>
          {ultimo && (
            <p className="text-center text-xs text-muted-foreground" aria-live="polite">
              {ultimo.reintento ? "Ya estaba registrada: " : "Última compra: "}
              {formatMXN(ultimo.visita.total_ticket)}
              {ultimo.resumen && ultimo.resumen.length > 0 ? ` · ${ultimo.resumen.join(" · ")}` : ""}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-accent px-2.5 py-1 text-muted-foreground">{children}</span>;
}

function Tarjeta({ destacada, children }: { destacada?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border p-4", destacada ? "border-purple-700 bg-purple-950/50" : "border-border bg-card")}>
      {children}
    </div>
  );
}

function Aviso({
  icono,
  titulo,
  destacada,
  children,
}: {
  icono: React.ReactNode;
  titulo: string;
  destacada?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border p-4", destacada ? "border-purple-700 bg-purple-950/50" : "border-border bg-card")}>
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icono}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold">{titulo}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function Fila({
  titulo,
  detalle,
  activa,
  onCambio,
  destacada,
  children,
}: {
  titulo: string;
  detalle?: string;
  activa: boolean;
  onCambio: (v: boolean) => void;
  destacada?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("px-4 py-3", destacada && !activa && "bg-purple-950/40", activa && "bg-panel-2")}>
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="min-w-0">
          <span className={cn("block text-sm", activa ? "font-semibold" : "text-muted-foreground")}>{titulo}</span>
          {detalle && <span className="block truncate text-xs text-muted-foreground">{detalle}</span>}
        </span>
        <Switch checked={activa} onCheckedChange={onCambio} aria-label={titulo} />
      </label>
      {children}
    </div>
  );
}

function Resumen({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className={cn("font-semibold", destacado && "text-purple-300")}>{valor}</dd>
    </div>
  );
}
