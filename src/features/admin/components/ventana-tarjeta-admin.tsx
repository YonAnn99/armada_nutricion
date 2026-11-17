"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNativo } from "@/components/ui/select-nativo";
import { Switch } from "@/components/ui/switch";
import { TelefonoInput } from "@/components/ui/telefono-input";
import { PaseArmada } from "@/features/lealtad/components/pase-armada";
import { estadoPase, hoyMexico, MESES, mensajePase, nombreAltaValido, urlTarjeta, urlWhatsApp } from "@/features/lealtad/motor";
import { qrSvg } from "@/features/lealtad/qr";
import {
  ajustarTarjeta,
  configurarTarjeta,
  cuponReactivacion,
  fetchMovimientos,
  fetchVisitasDeTarjeta,
  mensajeDeError,
  type DatosConfigurarTarjeta,
} from "@/features/lealtad/servicio";
import type { ConfigLealtad, Movimiento, Nivel, TarjetaStaff, TipoMovimiento, Visita } from "@/features/lealtad/types";
import { copiar } from "@/lib/portapapeles";
import { aE164, desdeE164 } from "@/lib/telefono";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { sanearNumero, parsearNumero, dentroDeRango } from "@/lib/numeros";

type Seccion = "datos" | "ajuste" | "historial";

const PERMISOS: { id: keyof DatosConfigurarTarjeta["permisos"]; texto: string }[] = [
  { id: "niveles", texto: "Niveles" },
  { id: "cashback", texto: "Cashback" },
  { id: "sellos", texto: "Sellos" },
  { id: "promo", texto: "Promo relámpago" },
  { id: "cumple", texto: "Cumpleaños" },
  { id: "compartida", texto: "Tarjeta compartida" },
];

const TEXTO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  sello: "Sello",
  canje_sellos: "Premio de sellos",
  cashback: "Cashback",
  bienvenida: "Bienvenida",
  bono_compartida: "Bono de embajador",
  canje_puntos: "Canje de puntos",
  ajuste_sellos: "Ajuste de sellos",
  ajuste_puntos: "Ajuste de puntos",
  ajuste_gasto: "Ajuste de gasto",
  cumple: "Regalo de cumpleaños",
  cupon: "Cupón usado",
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", year: "2-digit", hour: "numeric", minute: "2-digit" });

/**
 * "Ver y editar tarjeta" del simulador (Symvora `VentanaTarjeta` + ajustes):
 * datos del cliente, dinámicas permitidas, regla VIP, ajuste con motivo y el
 * historial de movimientos y compras (que Symvora no tenía).
 */
export function VentanaTarjetaAdmin({
  tarjeta,
  config,
  niveles,
  onCerrar,
  onActualizada,
}: {
  tarjeta: TarjetaStaff | null;
  config: ConfigLealtad;
  niveles: Nivel[];
  onCerrar: () => void;
  onActualizada: (t: TarjetaStaff) => void;
}) {
  return (
    <Dialog open={tarjeta != null} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-5xl">
        {tarjeta && (
          <Contenido key={tarjeta.id} tarjeta={tarjeta} config={config} niveles={niveles} onActualizada={onActualizada} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({
  tarjeta,
  config,
  niveles,
  onActualizada,
}: {
  tarjeta: TarjetaStaff;
  config: ConfigLealtad;
  niveles: Nivel[];
  onActualizada: (t: TarjetaStaff) => void;
}) {
  const [seccion, setSeccion] = useState<Seccion>("datos");
  const [svg, setSvg] = useState<string | null>(null);
  const hoy = hoyMexico();
  const url = urlTarjeta(tarjeta.codigo);

  useEffect(() => {
    let vivo = true;
    void qrSvg(url).then((s) => vivo && setSvg(s));
    return () => {
      vivo = false;
    };
  }, [url]);

  const estado = estadoPase(tarjeta, tarjeta.cliente.mes_cumple, config, niveles, hoy);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{tarjeta.cliente.nombre}</DialogTitle>
        <DialogDescription>
          #{tarjeta.folio} · cliente desde {new Date(tarjeta.cliente.creado_en).toLocaleDateString("es-MX", { dateStyle: "medium" })}
          {tarjeta.cliente.origen === "qr" ? " · se registró con el QR" : ""}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <div className="flex gap-1 rounded-xl bg-panel p-1" role="tablist">
            {(
              [
                ["datos", "Datos y dinámicas"],
                ["ajuste", "Ajuste manual"],
                ["historial", "Historial"],
              ] as const
            ).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={seccion === id}
                onClick={() => setSeccion(id)}
                className={cn(
                  "flex-1 rounded-lg px-2 py-2 text-xs font-bold",
                  seccion === id ? "bg-purple-600 text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {texto}
              </button>
            ))}
          </div>
          {seccion === "datos" && <Datos tarjeta={tarjeta} config={config} onActualizada={onActualizada} />}
          {seccion === "ajuste" && <Ajuste tarjeta={tarjeta} config={config} onActualizada={onActualizada} />}
          {seccion === "historial" && <Historial tarjeta={tarjeta} config={config} />}
        </div>
        <div className="space-y-3">
          <PaseArmada
            datos={{ tarjeta, nombre: tarjeta.cliente.nombre, mesCumple: tarjeta.cliente.mes_cumple, config, niveles, hoy, qrSvg: svg }}
          />
          <div className="grid grid-cols-2 gap-2">
            <a
              href={urlWhatsApp(
                tarjeta.cliente.telefono,
                mensajePase({
                  nombre: tarjeta.cliente.nombre,
                  url,
                  folio: tarjeta.folio,
                  estatus: estado.vip ? config.vip_nombre_regla : (estado.nivel?.nombre ?? "Miembro"),
                  nombrePuntos: config.nombre_puntos,
                  puntos: tarjeta.puntos,
                })
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "sm" })}
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <Button variant="outline" size="sm" onClick={() => void copiar(url, "Enlace del pase copiado")}>
              <Copy className="h-3.5 w-3.5" /> Copiar enlace
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function Datos({
  tarjeta,
  config,
  onActualizada,
}: {
  tarjeta: TarjetaStaff;
  config: ConfigLealtad;
  onActualizada: (t: TarjetaStaff) => void;
}) {
  const tel = desdeE164(tarjeta.cliente.telefono);
  const [nombre, setNombre] = useState(tarjeta.cliente.nombre);
  const [pais, setPais] = useState(tel.pais);
  const [numero, setNumero] = useState(tel.numero);
  const [mes, setMes] = useState(tarjeta.cliente.mes_cumple ? String(tarjeta.cliente.mes_cumple) : "");
  const [vip, setVip] = useState(tarjeta.regla_vip ?? "");
  const [activa, setActiva] = useState(tarjeta.activa);
  const [permisos, setPermisos] = useState<DatosConfigurarTarjeta["permisos"]>({
    niveles: tarjeta.permite_niveles,
    cashback: tarjeta.permite_cashback,
    sellos: tarjeta.permite_sellos,
    promo: tarjeta.permite_promo,
    cumple: tarjeta.permite_cumple,
    compartida: tarjeta.permite_compartida,
  });
  const [guardando, setGuardando] = useState(false);
  const [cupon, setCupon] = useState(false);
  const telefono = aE164(pais, numero);
  const valido = nombreAltaValido(nombre) && telefono != null;

  const guardar = async () => {
    if (!telefono) return;
    setGuardando(true);
    try {
      const t = await configurarTarjeta(tarjeta.id, {
        nombre,
        telefono,
        mesCumple: mes ? Number(mes) : null,
        reglaVip: vip,
        permisos,
        activa,
      });
      onActualizada(t);
      toast.success("Tarjeta actualizada");
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const alternarCupon = async () => {
    setCupon(true);
    try {
      onActualizada(await cuponReactivacion(tarjeta.id, !tarjeta.cupon_reactivacion));
      toast.success(tarjeta.cupon_reactivacion ? "Cupón retirado" : "Cupón de regreso emitido");
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setCupon(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ed-nombre">Nombre</Label>
          <Input id="ed-nombre" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} aria-invalid={!nombreAltaValido(nombre)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-tel">WhatsApp</Label>
          <TelefonoInput id="ed-tel" pais={pais} numero={numero} onPaisChange={setPais} onNumeroChange={setNumero} invalido={!telefono} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-mes">Mes de cumpleaños</Label>
          <SelectNativo id="ed-mes" value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Sin dato</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ed-vip">{config.vip_nombre_regla} (opcional)</Label>
          <Input
            id="ed-vip"
            value={vip}
            maxLength={80}
            onChange={(e) => setVip(e.target.value)}
            placeholder="Ej. 15% Descuento Permanente Mayorista / Entrenador"
          />
          <p className="text-[11px] text-muted-foreground">Si la escribes, es lo que el cajero aplica en vez del nivel o el cupón.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-black/30 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-purple-300">Dinámicas para este cliente</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PERMISOS.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-panel px-3 py-2 text-xs font-semibold">
              {p.texto}
              <Switch checked={permisos[p.id]} onCheckedChange={(v) => setPermisos((x) => ({ ...x, [p.id]: v }))} size="sm" />
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={activa} onCheckedChange={setActiva} />
          Tarjeta activa
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={alternarCupon} disabled={cupon}>
            {cupon && <Loader2 className="h-4 w-4 animate-spin" />}
            {tarjeta.cupon_reactivacion ? "Retirar cupón" : "+ Cupón de regreso"}
          </Button>
          <Button onClick={guardar} disabled={!valido || guardando} className="font-bold">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}

function Ajuste({
  tarjeta,
  config,
  onActualizada,
}: {
  tarjeta: TarjetaStaff;
  config: ConfigLealtad;
  onActualizada: (t: TarjetaStaff) => void;
}) {
  const [sellos, setSellos] = useState("0");
  const [puntos, setPuntos] = useState("0");
  const [gasto, setGasto] = useState("0");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const d = { sellos: Math.trunc(Number(sellos) || 0), puntos: Math.trunc(Number(puntos) || 0), gasto: Number(gasto) || 0 };
  const nada = d.sellos === 0 && d.puntos === 0 && d.gasto === 0;
  const negativo = tarjeta.sellos + d.sellos < 0 || tarjeta.puntos + d.puntos < 0 || tarjeta.gasto_historico + d.gasto < 0;

  const aplicar = async () => {
    setGuardando(true);
    try {
      onActualizada(await ajustarTarjeta(tarjeta.id, { ...d, nota }));
      setSellos("0");
      setPuntos("0");
      setGasto("0");
      setNota("");
      toast.success("Ajuste aplicado y registrado en la bitácora");
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Suma o resta (usa números negativos para restar). Cada ajuste queda con su motivo en el historial y la bitácora.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Delta etiqueta="Sellos" actual={`${tarjeta.sellos}/${config.sellos_meta}`} valor={sellos} onCambio={setSellos} />
        <Delta etiqueta={config.nombre_puntos} actual={`$${tarjeta.puntos}`} valor={puntos} onCambio={setPuntos} />
        <Delta etiqueta="Gasto histórico ($)" actual={formatMXN(tarjeta.gasto_historico)} valor={gasto} onCambio={setGasto} decimal />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="aj-nota">Motivo (obligatorio)</Label>
        <Input
          id="aj-nota"
          value={nota}
          maxLength={200}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej. Compras anteriores al sistema, error de captura…"
        />
      </div>
      {negativo && <p className="text-xs text-red-300">Ningún saldo puede quedar en negativo.</p>}
      <Button onClick={aplicar} disabled={nada || negativo || nota.trim().length < 3 || guardando} className="font-bold">
        {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
        Aplicar ajuste
      </Button>
    </div>
  );
}

function Delta({
  etiqueta,
  actual,
  valor,
  onCambio,
  decimal,
}: {
  etiqueta: string;
  actual: string;
  valor: string;
  onCambio: (v: string) => void;
  decimal?: boolean;
}) {
  const n = parsearNumero(valor);
  const fuera = decimal ? !dentroDeRango(n, { min: 0 }) : !dentroDeRango(n, { min: -999999 });
  return (
    <div className="space-y-1.5 rounded-2xl bg-black/30 p-3">
      <Label className="text-xs">{etiqueta}</Label>
      <p className="text-[11px] text-muted-foreground">Actual: {actual}</p>
      <Input
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        value={valor}
        onChange={(e) => onCambio(sanearNumero(e.target.value, { decimal, negativo: true }))}
        aria-label={`Cambio en ${etiqueta}`}
        aria-invalid={fuera}
      />
      {fuera && <p className="text-[10px] text-red-300" role="alert">Mínimo 0</p>}
    </div>
  );
}

function Historial({ tarjeta, config }: { tarjeta: TarjetaStaff; config: ConfigLealtad }) {
  const [movs, setMovs] = useState<Movimiento[] | null>(null);
  const [visitas, setVisitas] = useState<Visita[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([fetchMovimientos(tarjeta.id), fetchVisitasDeTarjeta(tarjeta.id)])
      .then(([m, v]) => {
        if (!vivo) return;
        setMovs(m);
        setVisitas(v);
      })
      .catch((e) => vivo && setError(mensajeDeError(e)));
    return () => {
      vivo = false;
    };
    // Se recarga si la tarjeta cambia (ajuste o compra nueva).
  }, [tarjeta]);

  if (error) return <p className="text-sm text-red-300">{error}</p>;
  if (!movs || !visitas) return <Loader2 className="mx-auto h-5 w-5 animate-spin text-purple-400" aria-label="Cargando" />;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-purple-300">Compras ({visitas.length})</h3>
        {visitas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin compras registradas.</p>
        ) : (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {visitas.map((v) => (
              <li key={v.id} className="rounded-xl bg-black/30 px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-bold">{formatMXN(v.total_ticket)}</span>
                  <span className="text-muted-foreground">{fecha(v.creado_en)}</span>
                </div>
                <p className="text-muted-foreground">
                  {v.beneficio_aplicado}
                  {v.tarjeta_prestada ? " · prestada" : ""}
                  {v.folio_kyte ? ` · KYTE ${v.folio_kyte}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-purple-300">Movimientos</h3>
        {movs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos.</p>
        ) : (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {movs.map((m) => {
              const esPunto = ["cashback", "bienvenida", "bono_compartida", "canje_puntos", "ajuste_puntos"].includes(m.tipo);
              const esGasto = m.tipo === "ajuste_gasto";
              return (
                <li key={m.id} className="flex items-start justify-between gap-2 rounded-xl bg-black/30 px-3 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="font-semibold">{TEXTO_MOVIMIENTO[m.tipo]}</span>
                    {m.nota && <span className="block truncate text-muted-foreground">{m.nota}</span>}
                    <span className="block text-muted-foreground">{fecha(m.creado_en)}</span>
                  </span>
                  <span className={cn("shrink-0 font-bold", m.cantidad < 0 ? "text-red-300" : "text-purple-300")}>
                    {m.cantidad > 0 ? "+" : ""}
                    {esGasto ? formatMXN(m.cantidad) : m.cantidad}
                    {esPunto ? ` ${config.nombre_puntos.split(" ")[0].toLowerCase()}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
