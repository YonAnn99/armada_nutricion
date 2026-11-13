"use client";

import { useMemo, useState } from "react";
import { Crown, Flame, Loader2, MessageCircle, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaseManual } from "@/features/caja/components/pase-manual";
import {
  diasDesde,
  esInactiva,
  estadoPase,
  hoyMexico,
  mensajePase,
  primerNombre,
  progreso,
  urlTarjeta,
  urlWhatsApp,
} from "@/features/lealtad/motor";
import { cuponReactivacion, mensajeDeError } from "@/features/lealtad/servicio";
import type { ConfigLealtad, Nivel, TarjetaStaff } from "@/features/lealtad/types";
import { formatearTelefono } from "@/lib/telefono";
import { formatMXN0 } from "@/lib/money";
import { cn } from "@/lib/utils";
import { VentanaTarjetaAdmin } from "./ventana-tarjeta-admin";

type Filtro = "todas" | "un-sello" | "premio" | "inactivas" | "cumple" | "vip" | "cupon" | "qr";

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "todas", texto: "Todas" },
  { id: "un-sello", texto: "A un sello" },
  { id: "premio", texto: "Con premio" },
  { id: "inactivas", texto: "Inactivas" },
  { id: "cumple", texto: "Cumple este mes" },
  { id: "vip", texto: "VIP" },
  { id: "cupon", texto: "Con cupón" },
  { id: "qr", texto: "Registro QR" },
];

const COLUMNAS = "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_0.7fr_minmax(0,1fr)_minmax(0,1fr)_auto]";

/** Lista de clientes con su pase (Symvora `PestanaLealtad` + acciones del simulador). */
export function Clientes({
  config,
  niveles,
  tarjetas,
  filtroInicial,
  onActualizada,
  onRecargar,
}: {
  config: ConfigLealtad;
  niveles: Nivel[];
  tarjetas: TarjetaStaff[] | null;
  filtroInicial?: string | null;
  onActualizada: (t: TarjetaStaff) => void;
  onRecargar: () => Promise<void>;
}) {
  const [filtro, setFiltro] = useState<Filtro>(() =>
    FILTROS.some((f) => f.id === filtroInicial) ? (filtroInicial as Filtro) : "todas"
  );
  const [texto, setTexto] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [recargando, setRecargando] = useState(false);
  const [cupones, setCupones] = useState<Set<string>>(new Set());
  const hoy = useMemo(() => hoyMexico(), []);

  /** ¿La tarjeta entra en este filtro? (sin contar la búsqueda de texto) */
  const pasa = useMemo(
    () =>
      (t: TarjetaStaff, f: Filtro): boolean => {
        const p = progreso(t.sellos, config.sellos_meta);
        switch (f) {
          case "un-sello":
            return t.activa && config.sellos_activos && p.faltan === 1;
          case "premio":
            return t.activa && config.sellos_activos && p.premiosDisponibles > 0;
          case "inactivas":
            return esInactiva(t, config.reactivacion_dias);
          case "cumple":
            return t.cliente.mes_cumple === hoy.mes && t.cumple_canjeado_anio !== hoy.anio;
          case "vip":
            return t.regla_vip != null;
          case "cupon":
            return t.cupon_reactivacion;
          case "qr":
            return t.cliente.origen === "qr";
          default:
            return true;
        }
      },
    [config, hoy]
  );

  const conteos = useMemo(() => {
    const c = {} as Record<Filtro, number>;
    for (const f of FILTROS) c[f.id] = tarjetas?.filter((t) => pasa(t, f.id)).length ?? 0;
    return c;
  }, [tarjetas, pasa]);

  const lista = useMemo(() => {
    if (!tarjetas) return [];
    const q = texto.trim().toLowerCase();
    const digitos = q.replace(/\D/g, "");
    return tarjetas.filter((t) => {
      if (
        q &&
        !(
          t.cliente.nombre.toLowerCase().includes(q) ||
          t.folio.toLowerCase().includes(q) ||
          (digitos.length >= 3 && t.cliente.telefono.includes(digitos))
        )
      )
        return false;
      return pasa(t, filtro);
    });
  }, [tarjetas, texto, filtro, pasa]);

  const emitirCupon = async (t: TarjetaStaff) => {
    setCupones((s) => new Set(s).add(t.id));
    try {
      onActualizada(await cuponReactivacion(t.id, true));
      toast.success(`Cupón de regreso para ${primerNombre(t.cliente.nombre)}`, {
        action: {
          label: "Avisar por WhatsApp",
          onClick: () =>
            window.open(
              urlWhatsApp(
                t.cliente.telefono,
                `¡Hola ${primerNombre(t.cliente.nombre)}! 💪 Te extrañamos en *Armada Nutrition*. Tienes un cupón de regreso: *${config.reactivacion_texto}*. Muestra tu pase en caja: ${urlTarjeta(t.codigo)}`
              ),
              "_blank",
              "noopener"
            ),
        },
      });
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setCupones((s) => {
        const n = new Set(s);
        n.delete(t.id);
        return n;
      });
    }
  };

  const seleccionada = tarjetas?.find((t) => t.id === abierta) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre, folio o celular"
            className="h-11 pl-10"
            aria-label="Buscar clientes"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
          aria-label="Recargar lista"
          disabled={recargando}
          onClick={async () => {
            setRecargando(true);
            await onRecargar();
            setRecargando(false);
          }}
        >
          <RefreshCw className={cn("h-4 w-4", recargando && "animate-spin")} />
        </Button>
        <Button onClick={() => setNueva(true)} className="h-11 font-bold">
          <Plus className="h-4 w-4" /> Nuevo pase
        </Button>
      </div>

      <div role="group" aria-label="Filtros" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={cn(
              "h-8 shrink-0 rounded-full border px-3 text-sm transition-colors duration-150",
              filtro === f.id ? "border-white bg-white font-semibold text-black" : "border-input text-foreground/80 hover:border-purple-700"
            )}
          >
            {f.texto}
            <span className={cn("tabular ml-1.5", filtro === f.id ? "text-black/55" : "text-muted-foreground")}>{conteos[f.id]}</span>
          </button>
        ))}
      </div>

      {!tarjetas ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-purple-400" aria-label="Cargando" />
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-10 text-center">
          <p className="font-semibold">{tarjetas.length === 0 ? "Aún no hay clientes" : "Ningún cliente coincide"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {tarjetas.length === 0
              ? "Crea el primer pase o activa el registro con QR del mostrador."
              : "Prueba con otro filtro o búsqueda."}
          </p>
          {tarjetas.length === 0 ? (
            <Button className="mt-4" onClick={() => setNueva(true)}>
              <Plus className="h-4 w-4" /> Nuevo pase
            </Button>
          ) : (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setFiltro("todas");
                setTexto("");
              }}
            >
              Ver todas
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border">
          <div className={cn("hidden gap-4 bg-[#0b0911] px-5 py-2.5 text-xs text-muted-foreground lg:grid", COLUMNAS)}>
            <span>Cliente</span>
            <span>Nivel</span>
            <span className="text-right">Puntos</span>
            <span>Sellos</span>
            <span>Última visita</span>
            <span className="w-[136px]" />
          </div>
          <ul>
            {lista.slice(0, 300).map((t) => {
              const e = estadoPase(t, t.cliente.mes_cumple, config, niveles, hoy);
              const dias = diasDesde(t.ultima_visita);
              const inactiva = esInactiva(t, config.reactivacion_dias);
              const p = progreso(t.sellos, config.sellos_meta);
              return (
                <li
                  key={t.id}
                  onClick={() => setAbierta(t.id)}
                  className={cn(
                    "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-border bg-card px-5 py-3.5 transition-colors duration-150 first:border-t-0 hover:bg-panel-2",
                    COLUMNAS,
                    !t.activa && "opacity-60"
                  )}
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setAbierta(t.id);
                      }}
                      className="flex max-w-full items-center gap-1.5 text-left"
                    >
                      <span className="truncate text-[15px] font-semibold">{t.cliente.nombre}</span>
                      {t.regla_vip && <Crown className="h-3.5 w-3.5 shrink-0 text-purple-300" aria-label="VIP" />}
                      {t.cupon_reactivacion && <Flame className="h-3.5 w-3.5 shrink-0 text-purple-300" aria-label="Con cupón" />}
                    </button>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {t.folio} · {formatearTelefono(t.cliente.telefono)}
                    </span>
                  </div>
                  <div className="hidden min-w-0 lg:block">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        t.regla_vip ? "bg-white text-black" : e.esNivelMaximo ? "bg-purple-950 text-purple-100" : "bg-accent text-foreground/85"
                      )}
                    >
                      {t.regla_vip ? "VIP" : (e.nivel?.nombre.replace(/^Nivel /, "") ?? "Miembro")}
                    </span>
                    <span className="tabular mt-1 block text-xs text-muted-foreground">{formatMXN0(t.gasto_historico)} acumulado</span>
                  </div>
                  <span className="tabular hidden text-right text-[15px] font-bold lg:block">${t.puntos}</span>
                  <div className="hidden items-center gap-2 lg:flex">
                    <span className="flex w-16 gap-0.5" role="img" aria-label={`${t.sellos} de ${config.sellos_meta} sellos`}>
                      {Array.from({ length: p.meta }, (_, i) => (
                        <span
                          key={i}
                          className={cn("h-1.5 flex-1 rounded-full", i < p.llenos ? (p.premiosDisponibles ? "bg-white" : "bg-purple-500") : "bg-input")}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-foreground/80">{p.premiosDisponibles ? "Premio listo" : `${p.llenos} de ${p.meta}`}</span>
                  </div>
                  <span className={cn("hidden text-sm lg:block", inactiva ? "font-semibold text-amber-300" : "text-muted-foreground")}>
                    {dias == null ? "Sin visitas" : dias === 0 ? "Hoy" : `Hace ${dias} ${dias === 1 ? "día" : "días"}`}
                  </span>
                  <div className="flex w-auto items-center justify-end gap-1.5 lg:w-[136px]">
                    {inactiva && !t.cupon_reactivacion && t.activa && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={cupones.has(t.id)}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void emitirCupon(t);
                        }}
                        className="border-purple-800 text-purple-100"
                      >
                        {cupones.has(t.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
                        Cupón
                      </Button>
                    )}
                    <a
                      href={urlWhatsApp(
                        t.cliente.telefono,
                        mensajePase({
                          nombre: t.cliente.nombre,
                          url: urlTarjeta(t.codigo),
                          folio: t.folio,
                          estatus: e.vip ? config.vip_nombre_regla : (e.nivel?.nombre ?? "Miembro"),
                          nombrePuntos: config.nombre_puntos,
                          puntos: t.puntos,
                        })
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                      aria-label={`Enviar pase a ${t.cliente.nombre} por WhatsApp`}
                      title="Enviar pase por WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
          {lista.length > 300 && (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              Mostrando 300 de {lista.length}. Usa la búsqueda para encontrar a los demás.
            </p>
          )}
        </div>
      )}

      <VentanaTarjetaAdmin
        tarjeta={seleccionada}
        config={config}
        niveles={niveles}
        onCerrar={() => setAbierta(null)}
        onActualizada={onActualizada}
      />
      <PaseManual
        abierto={nueva}
        onAbiertoChange={setNueva}
        config={config}
        niveles={niveles}
        onCreado={(t) => {
          onActualizada(t);
          setAbierta(t.id);
        }}
      />
    </div>
  );
}
