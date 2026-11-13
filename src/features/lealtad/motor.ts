/**
 * Lógica pura del programa de lealtad de Armada: progreso de sellos, niveles,
 * beneficio principal, vista previa de una compra, códigos y mensajes.
 * Sin React ni Supabase: se prueba en `src/__tests__/motor.test.ts`.
 *
 * Basado en `src/features/lealtad/lealtad.ts` de Symvora. Lo que decide
 * saldos (puntos, sellos, cupón, cumpleaños) lo confirma el servidor en
 * `registrar_compra`; `calcularCompra` es el MISMO algoritmo para mostrar en
 * caja lo que va a pasar. Si cambia allá, cambia aquí.
 */
import { getAppUrl } from "@/lib/site";
import type { ConfigLealtad, IconoSello, Nivel, TarjetaBase, TipoBeneficio } from "./types";

// ---------------------------------------------------------------------------
// Fechas (siempre hora de México, como la base)
// ---------------------------------------------------------------------------

export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export function nombreMes(mes: number | null | undefined): string | null {
  return mes && mes >= 1 && mes <= 12 ? MESES[mes - 1] : null;
}

export interface Hoy {
  /** YYYY-MM-DD */
  fecha: string;
  mes: number;
  anio: number;
}

/** Hoy en America/Mexico_City (o a partir de la fecha que mandó la base). */
export function hoyMexico(base: Date | string = new Date()): Hoy {
  if (typeof base === "string" && /^\d{4}-\d{2}-\d{2}$/.test(base)) {
    const [anio, mes] = base.split("-").map(Number);
    return { fecha: base, mes, anio };
  }
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof base === "string" ? new Date(base) : base);
  const [anio, mes] = fecha.split("-").map(Number);
  return { fecha, mes, anio };
}

// ---------------------------------------------------------------------------
// Sellos (Symvora)
// ---------------------------------------------------------------------------

export interface Progreso {
  /** Sellos a pintar llenos en la cuadrícula (nunca más que la meta). */
  llenos: number;
  meta: number;
  /** Cuántos faltan para el premio (0 si ya lo tiene). */
  faltan: number;
  /** Premios completos que puede canjear (un ajuste puede dejar más de uno). */
  premiosDisponibles: number;
  /** 0 a 100, para la barra. */
  pct: number;
}

export function progreso(sellos: number, meta: number): Progreso {
  const s = Math.max(0, Math.floor(sellos || 0));
  const m = Math.max(1, Math.floor(meta || 1));
  return {
    llenos: Math.min(s, m),
    meta: m,
    faltan: Math.max(0, m - s),
    premiosDisponibles: Math.floor(s / m),
    pct: Math.min(100, Math.round((s / m) * 100)),
  };
}

// ---------------------------------------------------------------------------
// Niveles
// ---------------------------------------------------------------------------

function ordenados(niveles: Nivel[]): Nivel[] {
  return [...niveles]
    .map((n) => ({ ...n, gasto_minimo: Number(n.gasto_minimo), descuento_pct: Number(n.descuento_pct) }))
    .sort((a, b) => a.gasto_minimo - b.gasto_minimo);
}

/** El nivel alcanzado: el de mayor mínimo que ya se cubrió (`_nivel_de`). */
export function nivelDe(gasto: number, niveles: Nivel[]): Nivel | null {
  const g = Number(gasto) || 0;
  let actual: Nivel | null = null;
  for (const n of ordenados(niveles)) if (n.gasto_minimo <= g) actual = n;
  return actual;
}

export function siguienteNivel(gasto: number, niveles: Nivel[]): Nivel | null {
  const g = Number(gasto) || 0;
  return ordenados(niveles).find((n) => n.gasto_minimo > g) ?? null;
}

/** El nivel más alto del programa (para pintar su badge distinto). */
export function esNivelMaximo(nivel: Nivel | null, niveles: Nivel[]): boolean {
  const lista = ordenados(niveles);
  return nivel != null && lista.length > 0 && lista[lista.length - 1].gasto_minimo === Number(nivel.gasto_minimo);
}

/** "15" o "12.5": sin ceros de más. */
export function pct(n: number): string {
  return String(Math.round(Number(n) * 100) / 100);
}

// ---------------------------------------------------------------------------
// Estado del pase: qué dinámicas aplican a ESTA tarjeta hoy
// ---------------------------------------------------------------------------

export function promoVigente(config: ConfigLealtad, hoy: Hoy): boolean {
  if (!config.promo_activa || !config.promo_texto.trim()) return false;
  if (config.promo_inicio && hoy.fecha < config.promo_inicio) return false;
  if (config.promo_fin && hoy.fecha > config.promo_fin) return false;
  return true;
}

export interface Beneficio {
  tipo: TipoBeneficio;
  /** "Nivel Culturista", "Regla VIP Individual", "Cupón de regreso"... */
  origen: string;
  /** Lo que el cajero aplica en KYTE: "15% de descuento", la regla VIP... */
  texto: string;
  descuento_pct: number | null;
}

export interface EstadoPase {
  usaNiveles: boolean;
  usaCashback: boolean;
  usaSellos: boolean;
  usaPromo: boolean;
  usaCumple: boolean;
  usaCompartida: boolean;
  nivel: Nivel | null;
  siguiente: Nivel | null;
  /** Pesos que faltan para el siguiente nivel (0 en el último). */
  faltaParaSiguiente: number;
  /** 0-100 dentro del tramo del nivel actual al siguiente. */
  pctNivel: number;
  esNivelMaximo: boolean;
  sellos: Progreso;
  premioSellos: boolean;
  esMesCumple: boolean;
  cumpleDisponible: boolean;
  cumpleEntregado: boolean;
  promo: string | null;
  vip: string | null;
  cupon: boolean;
  beneficio: Beneficio;
}

/**
 * Beneficio principal, en el orden del simulador y de `registrar_compra`:
 * VIP > cupón de regreso > nivel > ninguno. El cupón solo cuenta si se usa.
 */
export function beneficioPrincipal(
  tarjeta: Pick<TarjetaBase, "regla_vip" | "cupon_reactivacion">,
  config: Pick<ConfigLealtad, "vip_nombre_regla" | "reactivacion_texto">,
  nivel: Nivel | null,
  usarCupon: boolean
): Beneficio {
  if (tarjeta.regla_vip) {
    return { tipo: "vip", origen: config.vip_nombre_regla, texto: tarjeta.regla_vip, descuento_pct: null };
  }
  if (usarCupon && tarjeta.cupon_reactivacion) {
    return { tipo: "cupon", origen: "Cupón de regreso", texto: config.reactivacion_texto, descuento_pct: null };
  }
  if (nivel) {
    return {
      tipo: "nivel",
      origen: nivel.nombre,
      texto: `${pct(nivel.descuento_pct)}% de descuento`,
      descuento_pct: Number(nivel.descuento_pct),
    };
  }
  return { tipo: "ninguno", origen: "Pase estándar", texto: "Aplicar promociones vigentes", descuento_pct: null };
}

export function estadoPase(
  tarjeta: TarjetaBase,
  mesCumple: number | null,
  config: ConfigLealtad,
  niveles: Nivel[],
  hoy: Hoy,
  { usarCupon = true }: { usarCupon?: boolean } = {}
): EstadoPase {
  const usaNiveles = config.niveles_activos && tarjeta.permite_niveles && niveles.length > 0;
  const gasto = Number(tarjeta.gasto_historico) || 0;
  const nivel = usaNiveles ? nivelDe(gasto, niveles) : null;
  const siguiente = usaNiveles ? siguienteNivel(gasto, niveles) : null;
  const desde = nivel ? Number(nivel.gasto_minimo) : 0;
  const pctNivel = siguiente
    ? Math.max(0, Math.min(100, Math.round(((gasto - desde) / (Number(siguiente.gasto_minimo) - desde)) * 100)))
    : 100;

  const usaSellos = config.sellos_activos && tarjeta.permite_sellos;
  const sellos = progreso(tarjeta.sellos, config.sellos_meta);
  const usaCumple = config.cumple_activo && tarjeta.permite_cumple && mesCumple != null;
  const esMesCumple = usaCumple && mesCumple === hoy.mes;
  const cumpleEntregado = tarjeta.cumple_canjeado_anio === hoy.anio;
  const usaPromo = tarjeta.permite_promo && promoVigente(config, hoy);

  return {
    usaNiveles,
    usaCashback: config.cashback_activo && tarjeta.permite_cashback,
    usaSellos,
    usaPromo,
    usaCumple,
    usaCompartida: config.compartida_activa && tarjeta.permite_compartida,
    nivel,
    siguiente,
    faltaParaSiguiente: siguiente ? Math.max(0, Number(siguiente.gasto_minimo) - gasto) : 0,
    pctNivel,
    esNivelMaximo: esNivelMaximo(nivel, niveles),
    sellos,
    premioSellos: usaSellos && sellos.premiosDisponibles > 0,
    esMesCumple,
    cumpleDisponible: esMesCumple && !cumpleEntregado,
    cumpleEntregado: esMesCumple && cumpleEntregado,
    promo: usaPromo ? config.promo_texto : null,
    vip: tarjeta.regla_vip,
    cupon: tarjeta.cupon_reactivacion,
    beneficio: beneficioPrincipal(tarjeta, config, nivel, usarCupon),
  };
}

// ---------------------------------------------------------------------------
// Vista previa de una compra en caja (espejo de `registrar_compra`)
// ---------------------------------------------------------------------------

export interface EntradaCompra {
  /** Lo que el cliente pagó en KYTE. */
  total: number;
  prestada: boolean;
  sumarSello: boolean;
  canjearPuntos: number;
  canjearSellos: boolean;
  entregarCumple: boolean;
  usarCupon: boolean;
}

export interface ResultadoVistaPrevia {
  beneficio: Beneficio;
  puntosGanados: number;
  bonoCompartida: number;
  sello: boolean;
  premio: boolean;
  cumple: boolean;
  cupon: boolean;
  puntosFinales: number;
  sellosFinales: number;
  gastoFinal: number;
  nivelFinal: Nivel | null;
  subeNivel: boolean;
  /** Lo que el servidor rechazaría; con alguno, no se deja registrar. */
  errores: string[];
  /** Por qué no se suma el sello aunque se pidió (compra mínima). */
  avisoSello: string | null;
}

export function calcularCompra(
  tarjeta: TarjetaBase,
  mesCumple: number | null,
  config: ConfigLealtad,
  niveles: Nivel[],
  hoy: Hoy,
  e: EntradaCompra
): ResultadoVistaPrevia {
  const errores: string[] = [];
  const total = Math.round((Number(e.total) || 0) * 100) / 100;
  const canje = Math.max(0, Math.floor(Number(e.canjearPuntos) || 0));
  const estado = estadoPase(tarjeta, mesCumple, config, niveles, hoy, { usarCupon: e.usarCupon });
  const nivelAntes = estado.nivel;

  if (!tarjeta.activa) errores.push("Esta tarjeta está desactivada.");
  if (!(total >= 0) || total > 1_000_000) errores.push("Revisa el total del ticket.");

  let beneficio = estado.beneficio;
  let puntosGanados = 0;
  let bono = 0;
  let sello = false;
  let premio = false;
  let cumple = false;
  let cupon = false;
  let avisoSello: string | null = null;

  if (e.prestada) {
    if (canje > 0 || e.canjearSellos || e.entregarCumple || e.usarCupon) {
      errores.push("Con tarjeta prestada no se canjean los beneficios del titular.");
    }
    beneficio = nivelAntes
      ? {
          tipo: "nivel",
          origen: nivelAntes.nombre,
          texto: `${pct(nivelAntes.descuento_pct)}% de descuento de bienvenida`,
          descuento_pct: Number(nivelAntes.descuento_pct),
        }
      : { tipo: "ninguno", origen: "Pase estándar", texto: "Aplicar promociones vigentes", descuento_pct: null };
    if (estado.usaCompartida) bono = Math.max(0, config.compartida_bono_pts);
  } else {
    if (tarjeta.regla_vip && e.usarCupon) errores.push("Al cliente VIP se le aplica su regla, no el cupón.");
    if (e.usarCupon && !tarjeta.cupon_reactivacion) errores.push("Este cliente no tiene cupón de regreso.");
    cupon = e.usarCupon && tarjeta.cupon_reactivacion && !tarjeta.regla_vip;

    if (canje > tarjeta.puntos) errores.push(`El cliente solo tiene ${tarjeta.puntos} puntos.`);
    if (estado.usaCashback) puntosGanados = Math.floor((total * Number(config.cashback_pct)) / 100);

    if (e.canjearSellos) {
      if (!estado.usaSellos) errores.push("Los sellos no están activos para este cliente.");
      else if (tarjeta.sellos < config.sellos_meta) errores.push(`Aún no completa sus ${config.sellos_meta} sellos.`);
      premio = estado.usaSellos && tarjeta.sellos >= config.sellos_meta;
    } else if (e.sumarSello && estado.usaSellos) {
      if (total >= Number(config.compra_minima_sello)) sello = true;
      else avisoSello = `La compra mínima para sumar sello es de $${Number(config.compra_minima_sello)}.`;
    }

    if (e.entregarCumple) {
      if (!estado.usaCumple) errores.push("El regalo de cumpleaños no está activo.");
      else if (!estado.esMesCumple) errores.push("No es el mes de cumpleaños del cliente.");
      else if (estado.cumpleEntregado) errores.push("El regalo de cumpleaños ya se entregó este año.");
      cumple = estado.cumpleDisponible;
    }
  }

  const gastoFinal = Number(tarjeta.gasto_historico) + (e.prestada ? 0 : total);
  const nivelFinal = estado.usaNiveles ? nivelDe(gastoFinal, niveles) : null;
  return {
    beneficio,
    puntosGanados,
    bonoCompartida: bono,
    sello,
    premio,
    cumple,
    cupon,
    puntosFinales: tarjeta.puntos - (e.prestada ? 0 : canje) + puntosGanados + bono,
    sellosFinales: tarjeta.sellos + (sello ? 1 : 0) - (premio ? config.sellos_meta : 0),
    gastoFinal,
    nivelFinal,
    subeNivel: nivelFinal != null && nivelFinal.gasto_minimo !== nivelAntes?.gasto_minimo,
    errores,
    avisoSello,
  };
}

// ---------------------------------------------------------------------------
// Códigos y enlaces (Symvora)
// ---------------------------------------------------------------------------

/** Mismo alfabeto que `_codigo_aleatorio`: sin 0/O, 1/I/L ni U. */
const CODIGO = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$/;
const CODIGO_ALTA = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;

/**
 * El código de una tarjeta a partir de lo que se escaneó o tecleó: la URL del
 * QR (`…/tarjeta/6XAHQCNCHPZF`), el código solo o agrupado (`6XAH-QCNC-HPZF`).
 */
export function codigoDesdeEscaneo(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpio = texto.trim();
  const enUrl = limpio.match(/\/tarjeta\/([A-Za-z0-9-]+)/);
  const candidato = (enUrl ? enUrl[1] : limpio).replace(/[\s-]/g, "").toUpperCase();
  return CODIGO.test(candidato) ? candidato : null;
}

/** "6XAH-QCNC-HPZF": más fácil de leer y dictar. */
export function codigoAgrupado(codigo: string): string {
  return codigo.replace(/(.{4})(?=.)/g, "$1-");
}

export function urlTarjeta(codigo: string, base = getAppUrl()): string {
  return `${base.replace(/\/$/, "")}/tarjeta/${codigo}`;
}

export function codigoAltaValido(texto: string | null | undefined): string | null {
  const c = (texto ?? "").trim().toUpperCase();
  return CODIGO_ALTA.test(c) ? c : null;
}

export function urlAlta(codigoAlta: string, base = getAppUrl()): string {
  return `${base.replace(/\/$/, "")}/unirse/${codigoAlta}`;
}

export function limpiarNombre(nombre: string): string {
  return nombre.replace(/\s+/g, " ").trim();
}

/** Misma regla que la base: 2 a 60 caracteres, sin enlaces ni correos. */
export function nombreAltaValido(nombre: string): boolean {
  const n = limpiarNombre(nombre);
  return n.length >= 2 && n.length <= 60 && !/(https?:|www\.|[<>/@])/i.test(n);
}

export function ultimos10(telefono: string | null | undefined): string {
  return (telefono ?? "").replace(/\D/g, "").slice(-10);
}

export function primerNombre(nombre: string): string {
  const n = nombre.trim().split(/\s+/)[0] ?? "";
  return n ? n[0].toUpperCase() + n.slice(1) : "";
}

/** Tarjetas sacadas desde este celular con el QR del mostrador (localStorage). */
export interface MiTarjeta {
  codigoAlta: string;
  codigo: string;
}

export function leerMisTarjetas(crudo: string | null): MiTarjeta[] {
  if (!crudo) return [];
  try {
    const lista = JSON.parse(crudo) as unknown;
    if (!Array.isArray(lista)) return [];
    return lista.filter(
      (t): t is MiTarjeta =>
        typeof t?.codigoAlta === "string" && typeof t?.codigo === "string" && codigoDesdeEscaneo(t.codigo) !== null
    );
  } catch {
    return [];
  }
}

export function agregarMiTarjeta(lista: MiTarjeta[], nueva: MiTarjeta): MiTarjeta[] {
  return [nueva, ...lista.filter((t) => t.codigoAlta !== nueva.codigoAlta)].slice(0, 20);
}

// ---------------------------------------------------------------------------
// Iconos del sello
// ---------------------------------------------------------------------------

/** En el orden del selector. Misma lista que el CHECK `config_icono_ck`. */
export const ICONOS_SELLO: { valor: IconoSello; texto: string }[] = [
  { valor: "pesa", texto: "Pesa" },
  { valor: "frasco", texto: "Frasco" },
  { valor: "rayo", texto: "Rayo" },
  { valor: "flama", texto: "Flama" },
  { valor: "trofeo", texto: "Trofeo" },
  { valor: "check", texto: "Palomita" },
  { valor: "estrella", texto: "Estrella" },
  { valor: "corazon", texto: "Corazón" },
  { valor: "bolsa", texto: "Bolsa" },
  { valor: "cafe", texto: "Café" },
  { valor: "pan", texto: "Pan" },
  { valor: "pizza", texto: "Pizza" },
  { valor: "helado", texto: "Helado" },
  { valor: "cerveza", texto: "Cerveza" },
  { valor: "huella", texto: "Huella" },
  { valor: "hueso", texto: "Hueso" },
  { valor: "tijeras", texto: "Tijeras" },
  { valor: "flor", texto: "Flor" },
];

export function iconoDeSello(valor: string | null | undefined): IconoSello {
  return ICONOS_SELLO.some((i) => i.valor === valor) ? (valor as IconoSello) : "pesa";
}

// ---------------------------------------------------------------------------
// Pase vivo: qué cambió desde la última vez que el cliente lo abrió
// ---------------------------------------------------------------------------

export interface VistaTarjeta {
  sellos: number;
  canjes: number;
  puntos?: number;
  nivel?: string | null;
}

export interface CambioTarjeta {
  /** Índices de la cuadrícula que se llenaron (para el rebote). */
  nuevos: number[];
  /** Se acaba de completar la tarjeta: confeti y regalo. */
  completa: boolean;
  subioNivel: boolean;
  puntosNuevos: number;
}

export function cambioDeTarjeta(previa: VistaTarjeta | null, actual: VistaTarjeta, meta: number): CambioTarjeta {
  if (!previa) return { nuevos: [], completa: false, subioNivel: false, puntosNuevos: 0 };
  const ahora = progreso(actual.sellos, meta);
  const desde = actual.canjes > previa.canjes ? 0 : progreso(previa.sellos, meta).llenos;
  const nuevos: number[] = [];
  for (let i = desde; i < ahora.llenos; i++) nuevos.push(i);
  const antesCompleta = actual.canjes === previa.canjes && progreso(previa.sellos, meta).premiosDisponibles > 0;
  return {
    nuevos,
    completa: ahora.premiosDisponibles > 0 && !antesCompleta,
    subioNivel: previa.nivel !== undefined && actual.nivel != null && actual.nivel !== previa.nivel,
    puntosNuevos: Math.max(0, (actual.puntos ?? 0) - (previa.puntos ?? actual.puntos ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// Panel (Symvora): a un sello, premios pendientes, inactivos, cumpleañeros
// ---------------------------------------------------------------------------

export interface TarjetaParaPanel {
  sellos: number;
  activa: boolean;
  ultima_visita: string | null;
  cumple_canjeado_anio?: number | null;
  mes_cumple?: number | null;
  cupon_reactivacion?: boolean;
}

export interface PanelLealtad {
  /** Tarjetas activas a las que les falta exactamente un sello. */
  aUnSello: number;
  /** Tarjetas activas con un premio de sellos sin canjear. */
  conPremio: number;
  /** Ya vinieron alguna vez y no vuelven desde hace `diasInactivo`. */
  inactivas: number;
  /** Inactivas que todavía no tienen cupón de regreso: a quién mandárselo. */
  inactivasSinCupon: number;
  /** Cumplen años este mes y aún no reciben su regalo. */
  cumpleanerosPendientes: number;
}

const DIA_MS = 86_400_000;

export function esInactiva(t: Pick<TarjetaParaPanel, "activa" | "ultima_visita">, dias: number, ahora = new Date()): boolean {
  return t.activa && t.ultima_visita != null && new Date(t.ultima_visita).getTime() < ahora.getTime() - dias * DIA_MS;
}

export function diasDesde(fecha: string | null, ahora = new Date()): number | null {
  if (!fecha) return null;
  const t = new Date(fecha).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((ahora.getTime() - t) / DIA_MS));
}

export function panelLealtad(
  tarjetas: TarjetaParaPanel[],
  config: Pick<ConfigLealtad, "sellos_meta" | "reactivacion_dias" | "sellos_activos" | "cumple_activo">,
  hoy: Hoy,
  ahora = new Date()
): PanelLealtad {
  const activas = tarjetas.filter((t) => t.activa);
  const meta = config.sellos_meta;
  const inactivas = activas.filter((t) => esInactiva(t, config.reactivacion_dias, ahora));
  return {
    aUnSello: config.sellos_activos ? activas.filter((t) => progreso(t.sellos, meta).faltan === 1).length : 0,
    conPremio: config.sellos_activos ? activas.filter((t) => progreso(t.sellos, meta).premiosDisponibles > 0).length : 0,
    inactivas: inactivas.length,
    inactivasSinCupon: inactivas.filter((t) => !t.cupon_reactivacion).length,
    cumpleanerosPendientes: config.cumple_activo
      ? activas.filter((t) => t.mes_cumple === hoy.mes && t.cumple_canjeado_anio !== hoy.anio).length
      : 0,
  };
}

// ---------------------------------------------------------------------------
// WhatsApp (enlaces wa.me, sin API) — plantillas del simulador
// ---------------------------------------------------------------------------

export function urlWhatsApp(telefono: string | null, texto: string): string {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}

export function mensajePase(d: {
  nombre: string;
  url: string;
  folio: string;
  estatus: string;
  nombrePuntos: string;
  puntos: number;
}): string {
  return [
    `¡Hola ${primerNombre(d.nombre)}! 💪 Aquí tienes tu Pase Digital de *Armada Nutrition*:`,
    ``,
    `🔗 *Abre tu tarjeta aquí:* ${d.url}`,
    `🆔 *Código:* #${d.folio}`,
    `🏆 *Estatus:* ${d.estatus}`,
    `💰 *Saldo ${d.nombrePuntos}:* $${d.puntos} MXN`,
    ``,
    `Solo muestra este código QR en caja en tu próxima visita.`,
  ].join("\n");
}

export function mensajeRegistro(d: { url: string; puntos: number; nombrePuntos: string }): string {
  return [
    `¡Hola! 💪 Únete al programa de lealtad de *Armada Nutrition*.`,
    ``,
    `Regístrate en menos de 15 segundos, sin descargar apps, y recibe +$${d.puntos} en ${d.nombrePuntos} de bienvenida:`,
    d.url,
  ].join("\n");
}
