"use client";

import { useMemo, useState } from "react";
import { Cake, Coins, Crown, Flame, Handshake, Loader2, Plus, Save, Stamp, Trash2, TrendingUp, Undo2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNativo } from "@/components/ui/select-nativo";
import { Switch } from "@/components/ui/switch";
import { ICONO_SELLO } from "@/features/lealtad/components/iconos";
import { PaseArmada } from "@/features/lealtad/components/pase-armada";
import { hoyMexico, ICONOS_SELLO } from "@/features/lealtad/motor";
import { guardarConfig, guardarNiveles, mensajeDeError, type CambiosConfig } from "@/features/lealtad/servicio";
import type { ConfigAdmin, Nivel, TarjetaBase, TarjetaStaff } from "@/features/lealtad/types";
import { cn } from "@/lib/utils";
import { sanearNumero, parsearNumero, dentroDeRango } from "@/lib/numeros";

const CAMPOS: (keyof CambiosConfig)[] = [
  "niveles_activos",
  "mostrar_gasto_en_pase",
  "cashback_activo",
  "nombre_puntos",
  "cashback_pct",
  "cashback_puntos_por_peso",
  "puntos_bienvenida",
  "sellos_activos",
  "sellos_titulo",
  "sellos_meta",
  "sellos_premio",
  "icono_sello",
  "compra_minima_sello",
  "promo_activa",
  "promo_texto",
  "promo_inicio",
  "promo_fin",
  "cumple_activo",
  "cumple_texto",
  "compartida_activa",
  "compartida_bono_pts",
  "reactivacion_dias",
  "reactivacion_texto",
  "vip_nombre_regla",
];

/** Cliente de ejemplo para la vista previa: casi todo encendido. */
function ejemplo(config: ConfigAdmin, hoyMes: number): { tarjeta: TarjetaBase; nombre: string; mes: number } {
  return {
    nombre: "Alejandro Guzmán",
    mes: hoyMes,
    tarjeta: {
      codigo: "",
      folio: "ARM-101",
      gasto_historico: 4500,
      puntos: 150,
      sellos: Math.max(0, config.sellos_meta - 1),
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
    },
  };
}

/**
 * "Motor de dinámicas y beneficios (100% editable)" del simulador, con la
 * vista previa en vivo del pase (como `FormularioPrograma` de Symvora).
 * Cada guardado queda en la bitácora con lo que cambió.
 */
export function Dinamicas({
  config,
  niveles,
  tarjetas,
  onGuardado,
}: {
  config: ConfigAdmin;
  niveles: Nivel[];
  tarjetas: TarjetaStaff[];
  onGuardado: (c: ConfigAdmin, n: Nivel[]) => void;
}) {
  const [b, setB] = useState<ConfigAdmin>(config);
  const [ns, setNs] = useState<Nivel[]>(niveles);
  const [vistaId, setVistaId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const hoy = useMemo(() => hoyMexico(), []);
  const set = <K extends keyof ConfigAdmin>(k: K, v: ConfigAdmin[K]) => setB((x) => ({ ...x, [k]: v }));

  const cambios = useMemo(() => {
    const c: CambiosConfig = {};
    for (const k of CAMPOS) if (b[k] !== config[k]) (c as Record<string, unknown>)[k] = b[k];
    return c;
  }, [b, config]);
  const nivelesCambiaron = JSON.stringify(ns) !== JSON.stringify(niveles);
  const hayCambios = Object.keys(cambios).length > 0 || nivelesCambiaron;

  const erroresNiveles = useMemo(() => {
    const e: string[] = [];
    if (b.niveles_activos && ns.length === 0) e.push("Agrega al menos un nivel.");
    if (ns.some((n) => !n.nombre.trim())) e.push("Cada nivel necesita nombre.");
    if (ns.some((n) => n.descuento_pct < 0 || n.descuento_pct > 50)) e.push("El descuento va de 0 a 50%.");
    const gastos = ns.map((n) => n.gasto_minimo);
    if (new Set(gastos).size !== gastos.length) e.push("Dos niveles no pueden tener el mismo gasto mínimo.");
    if (ns.length > 0 && !gastos.includes(0)) e.push("El primer nivel debe empezar en $0.");
    return e;
  }, [ns, b.niveles_activos]);

  const guardar = async () => {
    if (erroresNiveles.length) {
      toast.error(erroresNiveles[0]);
      return;
    }
    setGuardando(true);
    try {
      let nuevosNiveles = niveles;
      if (nivelesCambiaron) {
        nuevosNiveles = (await guardarNiveles([...ns].sort((x, y) => x.gasto_minimo - y.gasto_minimo))).map((n) => ({
          ...n,
          descuento_pct: Number(n.descuento_pct),
          gasto_minimo: Number(n.gasto_minimo),
        }));
        setNs(nuevosNiveles);
      }
      let nuevaConfig = config;
      if (Object.keys(cambios).length) {
        nuevaConfig = await guardarConfig({ ...cambios, promo_inicio: b.promo_inicio || null, promo_fin: b.promo_fin || null });
        setB(nuevaConfig);
      }
      onGuardado(nuevaConfig, nuevosNiveles);
      toast.success("Dinámicas guardadas");
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const real = tarjetas.find((t) => t.id === vistaId);
  const muestra = real
    ? { tarjeta: real, nombre: real.cliente.nombre, mes: real.cliente.mes_cumple }
    : ejemplo(b, hoy.mes);
  const IconoActual = ICONO_SELLO[b.icono_sello];

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {/* 1. Niveles */}
        <Bloque
          icono={<TrendingUp className="h-4 w-4" />}
          titulo="1. Niveles por gasto"
          descripcion="Descuento según lo que el cliente ha comprado en total."
          activo={b.niveles_activos}
          onActivo={(v) => set("niveles_activos", v)}
        >
          <div className="space-y-2">
            {ns.map((n, i) => (
              <div key={i} className="grid grid-cols-[1fr_88px_120px_36px] items-end gap-2">
                <Campo etiqueta={i === 0 ? "Nombre" : undefined}>
                  <Input
                    value={n.nombre}
                    maxLength={40}
                    onChange={(e) => setNs(ns.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                    aria-label={`Nombre del nivel ${i + 1}`}
                  />
                </Campo>
                <Campo etiqueta={i === 0 ? "% desc." : undefined}>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={String(n.descuento_pct)}
                    onChange={(e) => {
                      const t = sanearNumero(e.target.value, { decimal: true, max: 50 });
                      setNs(ns.map((x, j) => (j === i ? { ...x, descuento_pct: parsearNumero(t) } : x)));
                    }}
                    aria-label={`Descuento del nivel ${i + 1}`}
                  />
                  {!dentroDeRango(n.descuento_pct, { min: 0, max: 50 }) && (
                    <p className="text-[10px] text-red-300" role="alert">Rango 0–50</p>
                  )}
                </Campo>
                <Campo etiqueta={i === 0 ? "Desde ($)" : undefined}>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={String(n.gasto_minimo)}
                    onChange={(e) => {
                      const t = sanearNumero(e.target.value, { decimal: true, min: 0 });
                      setNs(ns.map((x, j) => (j === i ? { ...x, gasto_minimo: parsearNumero(t) } : x)));
                    }}
                    aria-label={`Gasto mínimo del nivel ${i + 1}`}
                  />
                  {!dentroDeRango(n.gasto_minimo, { min: 0 }) && (
                    <p className="text-[10px] text-red-300" role="alert">Mínimo 0</p>
                  )}
                </Campo>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={ns.length <= 1 || n.gasto_minimo === 0}
                  onClick={() => setNs(ns.filter((_, j) => j !== i))}
                  aria-label={`Quitar ${n.nombre}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={ns.length >= 10}
                onClick={() => {
                  const ultimo = [...ns].sort((x, y) => x.gasto_minimo - y.gasto_minimo).at(-1);
                  setNs([
                    ...ns,
                    {
                      nombre: `Nivel Élite ${ns.length + 1}`,
                      descuento_pct: Math.min(50, (ultimo?.descuento_pct ?? 0) + 5),
                      gasto_minimo: (ultimo?.gasto_minimo ?? 0) + 5000,
                    },
                  ]);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Agregar nivel
              </Button>
              <Interruptor
                texto="Mostrar “Llevas $X / Meta $Y” en el pase"
                activo={b.mostrar_gasto_en_pase}
                onCambio={(v) => set("mostrar_gasto_en_pase", v)}
              />
            </div>
            {erroresNiveles.map((e) => (
              <p key={e} className="text-xs text-red-300">
                {e}
              </p>
            ))}
          </div>
        </Bloque>

        {/* 2. Cashback */}
        <Bloque
          icono={<Coins className="h-4 w-4" />}
          titulo={`2. Cashback · ${b.nombre_puntos}`}
          descripcion="Un porcentaje de cada compra vuelve como puntos. Tasa de conversión: cuántos puntos = $1 MXN."
          activo={b.cashback_activo}
          onActivo={(v) => set("cashback_activo", v)}
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <Campo etiqueta="Nombre de los puntos">
              <Input value={b.nombre_puntos} maxLength={30} onChange={(e) => set("nombre_puntos", e.target.value)} />
            </Campo>
            <Campo etiqueta="% de cashback">
              <Input
                type="text"
                inputMode="decimal"
                value={String(b.cashback_pct)}
                onChange={(e) => {
                  const t = sanearNumero(e.target.value, { decimal: true, max: 50 });
                  set("cashback_pct", parsearNumero(t));
                }}
              />
              {!dentroDeRango(b.cashback_pct, { min: 0, max: 50 }) && (
                <p className="text-[10px] text-red-300" role="alert">Rango 0–50</p>
              )}
            </Campo>
            <Campo etiqueta="Puntos por $1 MXN">
              <Input
                type="text"
                inputMode="numeric"
                value={String(b.cashback_puntos_por_peso)}
                onChange={(e) => {
                  const t = sanearNumero(e.target.value, { decimal: true, min: 0.01 });
                  set("cashback_puntos_por_peso", parsearNumero(t));
                }}
              />
              {!dentroDeRango(b.cashback_puntos_por_peso, { min: 0.01 }) && (
                <p className="text-[10px] text-red-300" role="alert">Mínimo 0.01</p>
              )}
            </Campo>
            <Campo etiqueta="Puntos de bienvenida">
              <Input
                type="text"
                inputMode="numeric"
                value={String(b.puntos_bienvenida)}
                onChange={(e) => {
                  const t = sanearNumero(e.target.value, { decimal: false, max: 10000 });
                  set("puntos_bienvenida", parsearNumero(t));
                }}
              />
              {!dentroDeRango(b.puntos_bienvenida, { min: 0, max: 10000 }) && (
                <p className="text-[10px] text-red-300" role="alert">Rango 0–10000</p>
              )}
            </Campo>
          </div>
        </Bloque>

        {/* 3. Sellos */}
        <Bloque
          icono={<Stamp className="h-4 w-4" />}
          titulo={`3. Sellos · ${b.sellos_titulo}`}
          descripcion="Un sello por compra participante; al completar la meta, el premio."
          activo={b.sellos_activos}
          onActivo={(v) => set("sellos_activos", v)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Título">
              <Input value={b.sellos_titulo} maxLength={40} onChange={(e) => set("sellos_titulo", e.target.value)} />
            </Campo>
            <Campo etiqueta="Sellos para el premio (2 a 20)">
              <Input
                type="text"
                inputMode="numeric"
                value={String(b.sellos_meta)}
                onChange={(e) => {
                  const t = sanearNumero(e.target.value, { decimal: false, min: 2, max: 20 });
                  set("sellos_meta", parsearNumero(t));
                }}
              />
              {!dentroDeRango(b.sellos_meta, { min: 2, max: 20 }) && (
                <p className="text-[10px] text-red-300" role="alert">Mínimo 2, máximo 20</p>
              )}
            </Campo>
            <Campo etiqueta="Premio" className="sm:col-span-2">
              <Input value={b.sellos_premio} maxLength={80} onChange={(e) => set("sellos_premio", e.target.value)} />
            </Campo>
            <Campo etiqueta="Compra mínima para sumar sello ($)">
              <Input
                type="text"
                inputMode="numeric"
                value={String(b.compra_minima_sello)}
                onChange={(e) => {
                  const t = sanearNumero(e.target.value, { decimal: true, min: 0 });
                  set("compra_minima_sello", parsearNumero(t));
                }}
              />
              {!dentroDeRango(b.compra_minima_sello, { min: 0 }) && (
                <p className="text-[10px] text-red-300" role="alert">Mínimo 0</p>
              )}
            </Campo>
            <Campo etiqueta="Icono del sello">
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600">
                  <IconoActual className="h-4 w-4" />
                </span>
                <SelectNativo value={b.icono_sello} onChange={(e) => set("icono_sello", e.target.value as ConfigAdmin["icono_sello"])} className="flex-1">
                  {ICONOS_SELLO.map((i) => (
                    <option key={i.valor} value={i.valor}>
                      {i.texto}
                    </option>
                  ))}
                </SelectNativo>
              </div>
            </Campo>
          </div>
        </Bloque>

        {/* 4. Promo relámpago */}
        <Bloque
          icono={<Zap className="h-4 w-4" />}
          titulo="4. Promo relámpago"
          descripcion="Una campaña visible en todos los pases. Con fechas, se apaga sola."
          activo={b.promo_activa}
          onActivo={(v) => set("promo_activa", v)}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_150px_150px]">
            <Campo etiqueta="Texto">
              <Input value={b.promo_texto} maxLength={80} onChange={(e) => set("promo_texto", e.target.value)} />
            </Campo>
            <Campo etiqueta="Desde (opcional)">
              <Input type="date" value={b.promo_inicio ?? ""} onChange={(e) => set("promo_inicio", e.target.value || null)} />
            </Campo>
            <Campo etiqueta="Hasta (opcional)">
              <Input type="date" value={b.promo_fin ?? ""} onChange={(e) => set("promo_fin", e.target.value || null)} />
            </Campo>
          </div>
        </Bloque>

        {/* 5. Cumpleaños */}
        <Bloque
          icono={<Cake className="h-4 w-4" />}
          titulo="5. Cumpleaños"
          descripcion="Regalo una vez al año, durante el mes de cumpleaños del cliente."
          activo={b.cumple_activo}
          onActivo={(v) => set("cumple_activo", v)}
        >
          <Campo etiqueta="Regalo">
            <Input value={b.cumple_texto} maxLength={80} onChange={(e) => set("cumple_texto", e.target.value)} />
          </Campo>
        </Bloque>

        {/* 6. Compartida */}
        <Bloque
          icono={<Handshake className="h-4 w-4" />}
          titulo="6. Tarjeta compartida (embajador)"
          descripcion="Si un amigo compra con el pase del cliente, el titular gana un bono y el amigo recibe su descuento de nivel."
          activo={b.compartida_activa}
          onActivo={(v) => set("compartida_activa", v)}
        >
          <Campo etiqueta={`Bono para el titular (${b.nombre_puntos})`} className="max-w-xs">
            <Input
              type="text"
              inputMode="numeric"
              value={String(b.compartida_bono_pts)}
              onChange={(e) => {
                const t = sanearNumero(e.target.value, { decimal: false, max: 10000 });
                set("compartida_bono_pts", parsearNumero(t));
              }}
            />
            {!dentroDeRango(b.compartida_bono_pts, { min: 0, max: 10000 }) && (
              <p className="text-[10px] text-red-300" role="alert">Rango 0–10000</p>
            )}
          </Campo>
        </Bloque>

        {/* 7. Reactivación */}
        <Bloque
          icono={<Flame className="h-4 w-4" />}
          titulo="7. Reactivación"
          descripcion="Clientes que no vuelven: el panel los marca y les mandas un cupón de regreso desde Clientes."
        >
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Campo etiqueta="Inactivo después de (días)">
              <Input
                type="text"
                inputMode="numeric"
                value={String(b.reactivacion_dias)}
                onChange={(e) => {
                  const t = sanearNumero(e.target.value, { decimal: false, min: 7, max: 365 });
                  set("reactivacion_dias", parsearNumero(t));
                }}
              />
              {!dentroDeRango(b.reactivacion_dias, { min: 7, max: 365 }) && (
                <p className="text-[10px] text-red-300" role="alert">Mínimo 7, máximo 365</p>
              )}
            </Campo>
            <Campo etiqueta="Cupón de regreso">
              <Input value={b.reactivacion_texto} maxLength={80} onChange={(e) => set("reactivacion_texto", e.target.value)} />
            </Campo>
          </div>
        </Bloque>

        {/* VIP */}
        <Bloque
          icono={<Crown className="h-4 w-4" />}
          titulo="Regla VIP individual"
          descripcion="Una regla escrita a mano por cliente (mayoristas, entrenadores). Tiene prioridad sobre todo; se asigna en Clientes."
        >
          <Campo etiqueta="Nombre de la regla" className="max-w-sm">
            <Input value={b.vip_nombre_regla} maxLength={40} onChange={(e) => set("vip_nombre_regla", e.target.value)} />
          </Campo>
        </Bloque>
      </div>

      {/* Vista previa en vivo */}
      <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-purple-300">Vista previa</p>
          {tarjetas.length > 0 && (
            <SelectNativo value={vistaId} onChange={(e) => setVistaId(e.target.value)} className="w-48" aria-label="Ver con cliente">
              <option value="">Cliente de ejemplo</option>
              {tarjetas.slice(0, 100).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.cliente.nombre}
                </option>
              ))}
            </SelectNativo>
          )}
        </div>
        <div className="flex justify-center rounded-[2.5rem] border-[6px] border-[#181424] bg-black p-4 brillo-morado">
          <PaseArmada datos={{ tarjeta: muestra.tarjeta, nombre: muestra.nombre, mesCumple: muestra.mes, config: b, niveles: ns, hoy }} />
        </div>
      </aside>

      {/* Barra de guardar */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-purple-500/30 bg-background/95 px-4 py-3 backdrop-blur transition-transform",
          hayCambios ? "translate-y-0" : "translate-y-full"
        )}
        aria-hidden={!hayCambios}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <p className="text-sm font-semibold">Tienes cambios sin guardar</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setB(config);
                setNs(niveles);
              }}
              disabled={guardando}
              tabIndex={hayCambios ? 0 : -1}
            >
              <Undo2 className="h-4 w-4" /> Descartar
            </Button>
            <Button onClick={guardar} disabled={guardando} tabIndex={hayCambios ? 0 : -1} className="font-bold">
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar dinámicas
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bloque({
  icono,
  titulo,
  descripcion,
  activo,
  onActivo,
  children,
}: {
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
  activo?: boolean;
  onActivo?: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const apagado = onActivo != null && !activo;
  return (
    <section className="card-glass rounded-3xl p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-950 text-purple-300">{icono}</span>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-black uppercase tracking-wider">{titulo}</h2>
            <p className="text-xs text-muted-foreground">{descripcion}</p>
          </div>
        </div>
        {onActivo && <Switch checked={!!activo} onCheckedChange={onActivo} aria-label={`Activar ${titulo}`} />}
      </div>
      <div className={cn("transition-opacity", apagado && "pointer-events-none opacity-40")} inert={apagado}>
        {children}
      </div>
    </section>
  );
}

function Campo({ etiqueta, className, children }: { etiqueta?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {etiqueta && <Label className="text-xs text-muted-foreground">{etiqueta}</Label>}
      {children}
    </div>
  );
}

function Interruptor({ texto, activo, onCambio }: { texto: string; activo: boolean; onCambio: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Switch checked={activo} onCheckedChange={onCambio} size="sm" />
      {texto}
    </label>
  );
}

