/**
 * Tipos del programa de lealtad de Armada. Los nombres de campo son los de la
 * base (`supabase/migrations/*_lealtad.sql`) para no traducir en cada lectura.
 */

/** Iconos del sello. Misma lista que el CHECK `config_icono_ck`. */
export type IconoSello =
  | "check"
  | "cafe"
  | "estrella"
  | "corazon"
  | "huella"
  | "hueso"
  | "pizza"
  | "tijeras"
  | "flor"
  | "pan"
  | "helado"
  | "bolsa"
  | "pesa"
  | "cerveza"
  | "frasco"
  | "rayo"
  | "trofeo"
  | "flama";

/** `config_lealtad` tal como la ve el cliente (sin `codigo_alta`). */
export interface ConfigLealtad {
  niveles_activos: boolean;
  mostrar_gasto_en_pase: boolean;
  cashback_activo: boolean;
  nombre_puntos: string;
  cashback_pct: number;
  cashback_puntos_por_peso: number;
  puntos_bienvenida: number;
  sellos_activos: boolean;
  sellos_titulo: string;
  sellos_meta: number;
  sellos_premio: string;
  icono_sello: IconoSello;
  compra_minima_sello: number;
  promo_activa: boolean;
  promo_texto: string;
  promo_inicio: string | null;
  promo_fin: string | null;
  cumple_activo: boolean;
  cumple_texto: string;
  compartida_activa: boolean;
  compartida_bono_pts: number;
  reactivacion_dias: number;
  reactivacion_texto: string;
  vip_nombre_regla: string;
  alta_publica: boolean;
  aviso_privacidad_url: string | null;
}

/** La fila completa, para el admin. */
export interface ConfigAdmin extends ConfigLealtad {
  codigo_alta: string | null;
  actualizado_en: string;
}

export interface Nivel {
  nombre: string;
  descuento_pct: number;
  gasto_minimo: number;
}

export type Dinamica = "niveles" | "cashback" | "sellos" | "promo" | "cumple" | "compartida";

/** Lo de una tarjeta que hace falta para pintar el pase y decidir beneficios. */
export interface TarjetaBase {
  codigo: string;
  folio: string;
  gasto_historico: number;
  puntos: number;
  sellos: number;
  premios_canjeados: number;
  regla_vip: string | null;
  cupon_reactivacion: boolean;
  cumple_canjeado_anio: number | null;
  permite_niveles: boolean;
  permite_cashback: boolean;
  permite_sellos: boolean;
  permite_promo: boolean;
  permite_cumple: boolean;
  permite_compartida: boolean;
  activa: boolean;
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  mes_cumple: number | null;
  origen: "equipo" | "qr";
  creado_en: string;
}

/** Tarjeta como la ve el equipo (`_estado_tarjeta` o select con el cliente). */
export interface TarjetaStaff extends TarjetaBase {
  id: string;
  cliente_id: string;
  ultima_visita: string | null;
  cupon_emitido_en: string | null;
  creado_en: string;
  cliente: Cliente;
}

/** Respuesta de `tarjeta_publica`: solo el primer nombre, nunca el celular. */
export interface TarjetaPublica {
  tarjeta: TarjetaBase & { cliente: string; mes_cumple: number | null };
  config: ConfigLealtad;
  niveles: Nivel[];
  /** Fecha de hoy en México (YYYY-MM-DD), la que usa la base. */
  hoy: string;
}

/** Respuesta de `programa_alta_publica`. */
export interface ProgramaAltaPublica {
  codigo_alta: string;
  config: ConfigLealtad;
  niveles: Nivel[];
  hoy: string;
}

export type ResultadoAlta = { estado: "creada"; codigo: string } | { estado: "ya_registrado" };

export interface Visita {
  id: string;
  tarjeta_id: string;
  cajero_id: string | null;
  total_ticket: number;
  folio_kyte: string | null;
  tarjeta_prestada: boolean;
  beneficio_tipo: TipoBeneficio;
  beneficio_aplicado: string;
  descuento_pct: number | null;
  puntos_ganados: number;
  puntos_canjeados: number;
  sello_sumado: boolean;
  premio_sellos: boolean;
  regalo_cumple: boolean;
  cupon_usado: boolean;
  creado_en: string;
}

export type TipoBeneficio = "vip" | "cupon" | "nivel" | "ninguno";

/** Respuesta de `registrar_compra`. */
export interface ResultadoCompra {
  visita: Visita;
  tarjeta: TarjetaStaff;
  reintento: boolean;
  resumen?: string[];
  subio_nivel: boolean;
  nivel?: { nombre: string; descuento_pct: number } | null;
}

export type TipoMovimiento =
  | "sello"
  | "canje_sellos"
  | "cashback"
  | "bienvenida"
  | "bono_compartida"
  | "canje_puntos"
  | "ajuste_sellos"
  | "ajuste_puntos"
  | "ajuste_gasto"
  | "cumple"
  | "cupon";

export interface Movimiento {
  id: string;
  tarjeta_id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  visita_id: string | null;
  nota: string | null;
  creado_en: string;
}

export type TipoBitacora = "venta" | "registro" | "config" | "cliente";

export interface EntradaBitacora {
  id: string;
  tipo: TipoBitacora;
  actor: string;
  descripcion: string;
  tarjeta_id: string | null;
  detalle: Record<string, unknown>;
  creado_en: string;
}

export interface Perfil {
  user_id: string;
  nombre: string;
  rol: "admin" | "cajero";
  activo: boolean;
  creado_en: string;
}
