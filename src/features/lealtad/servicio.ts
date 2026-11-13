/**
 * Acceso a datos del equipo desde el navegador (Symvora `lealtad-service.ts`).
 * Lecturas con RLS (`es_staff` / `es_admin`); escrituras SOLO por RPC.
 */
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  ConfigAdmin,
  EntradaBitacora,
  Movimiento,
  Nivel,
  Perfil,
  ResultadoCompra,
  TarjetaStaff,
  TipoBitacora,
  Visita,
} from "./types";

let cliente: ReturnType<typeof createSupabaseBrowserClient> | null = null;
export function supabase() {
  cliente ??= createSupabaseBrowserClient();
  return cliente;
}

/** El mensaje de la base (ya en español) o uno genérico. */
export function mensajeDeError(e: unknown, generico = "Algo salió mal. Intenta de nuevo."): string {
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string" && e.message) {
    if (/failed to fetch|network/i.test(e.message)) return "Sin conexión. Revisa tu internet e intenta de nuevo.";
    if (/JWT|not authorized|No autorizado/i.test(e.message)) return "Tu sesión expiró o no tienes permiso.";
    return e.message;
  }
  return generico;
}

function lanzar(error: unknown): never {
  throw new Error(mensajeDeError(error));
}

const CON_CLIENTE = "*, cliente:clientes!inner(id, nombre, telefono, mes_cumple, origen, creado_en)";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export async function fetchConfig(): Promise<ConfigAdmin> {
  const { data, error } = await supabase().from("config_lealtad").select("*").single<ConfigAdmin>();
  if (error) lanzar(error);
  return normalizarConfig(data);
}

export async function fetchNiveles(): Promise<Nivel[]> {
  const { data, error } = await supabase()
    .from("niveles")
    .select("nombre, descuento_pct, gasto_minimo")
    .order("gasto_minimo");
  if (error) lanzar(error);
  return (data ?? []).map((n) => ({ ...n, descuento_pct: Number(n.descuento_pct), gasto_minimo: Number(n.gasto_minimo) }));
}

/** PostgREST devuelve `numeric` como número, pero por si acaso llega texto. */
function normalizarConfig(c: ConfigAdmin): ConfigAdmin {
  return { ...c, cashback_pct: Number(c.cashback_pct), compra_minima_sello: Number(c.compra_minima_sello) };
}

export type CambiosConfig = Partial<Omit<ConfigAdmin, "codigo_alta" | "actualizado_en">>;

export async function guardarConfig(cambios: CambiosConfig): Promise<ConfigAdmin> {
  const { data, error } = await supabase().from("config_lealtad").update(cambios).eq("id", true).select("*").single<ConfigAdmin>();
  if (error) lanzar(error);
  return normalizarConfig(data);
}

export async function guardarNiveles(niveles: Nivel[]): Promise<Nivel[]> {
  const { data, error } = await supabase().rpc("guardar_niveles", { p_niveles: niveles });
  if (error) lanzar(error);
  return data as Nivel[];
}

export async function regenerarCodigoAlta(): Promise<string> {
  const { data, error } = await supabase().rpc("regenerar_codigo_alta");
  if (error) lanzar(error);
  return data as string;
}

// ---------------------------------------------------------------------------
// Tarjetas
// ---------------------------------------------------------------------------

function normalizarTarjeta(t: TarjetaStaff): TarjetaStaff {
  return { ...t, gasto_historico: Number(t.gasto_historico) };
}

export async function buscarTarjeta(texto: string): Promise<TarjetaStaff | null> {
  const { data, error } = await supabase().rpc("buscar_tarjeta", { p_texto: texto });
  if (error) lanzar(error);
  return data ? normalizarTarjeta(data as TarjetaStaff) : null;
}

export async function buscarPorNombre(texto: string): Promise<TarjetaStaff[]> {
  const q = texto.trim().replace(/[%_,()]/g, " ");
  if (q.length < 2) return [];
  const { data, error } = await supabase()
    .from("tarjetas")
    .select(CON_CLIENTE)
    .ilike("cliente.nombre", `%${q}%`)
    .order("ultima_visita", { ascending: false, nullsFirst: false })
    .limit(8);
  if (error) lanzar(error);
  return (data as TarjetaStaff[]).map(normalizarTarjeta);
}

export async function fetchTarjeta(id: string): Promise<TarjetaStaff> {
  const { data, error } = await supabase().from("tarjetas").select(CON_CLIENTE).eq("id", id).single();
  if (error) lanzar(error);
  return normalizarTarjeta(data as TarjetaStaff);
}

/** Todas las tarjetas, en páginas de 1000 (el tope de PostgREST). */
export async function fetchTarjetas(): Promise<TarjetaStaff[]> {
  const pagina = 1000;
  const todas: TarjetaStaff[] = [];
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await supabase()
      .from("tarjetas")
      .select(CON_CLIENTE)
      .order("creado_en", { ascending: false })
      .order("id")
      .range(desde, desde + pagina - 1);
    if (error) lanzar(error);
    todas.push(...(data as TarjetaStaff[]).map(normalizarTarjeta));
    if (!data || data.length < pagina) return todas;
  }
}

export interface EntradaRegistrarCompra {
  tarjetaId: string;
  total: number;
  folioKyte: string;
  prestada: boolean;
  sumarSello: boolean;
  canjearPuntos: number;
  canjearSellos: boolean;
  entregarCumple: boolean;
  usarCupon: boolean;
  idempotencyKey: string;
}

export async function registrarCompra(e: EntradaRegistrarCompra): Promise<ResultadoCompra> {
  const { data, error } = await supabase().rpc("registrar_compra", {
    p_tarjeta_id: e.tarjetaId,
    p_total: e.total,
    p_folio_kyte: e.folioKyte.trim() || null,
    p_prestada: e.prestada,
    p_sumar_sello: e.sumarSello,
    p_canjear_puntos: e.canjearPuntos,
    p_canjear_sellos: e.canjearSellos,
    p_entregar_cumple: e.entregarCumple,
    p_usar_cupon: e.usarCupon,
    p_idempotency_key: e.idempotencyKey,
  });
  if (error) lanzar(error);
  const r = data as ResultadoCompra;
  return { ...r, tarjeta: normalizarTarjeta(r.tarjeta) };
}

export async function crearPaseManual(
  nombre: string,
  telefono: string,
  mesCumple: number | null
): Promise<{ estado: "creada" | "existente"; tarjeta: TarjetaStaff }> {
  const { data, error } = await supabase().rpc("crear_pase_manual", {
    p_nombre: nombre,
    p_telefono: telefono,
    p_mes_cumple: mesCumple,
  });
  if (error) lanzar(error);
  const r = data as { estado: "creada" | "existente"; tarjeta: TarjetaStaff };
  return { ...r, tarjeta: normalizarTarjeta(r.tarjeta) };
}

export async function ajustarTarjeta(
  tarjetaId: string,
  d: { sellos: number; puntos: number; gasto: number; nota: string }
): Promise<TarjetaStaff> {
  const { data, error } = await supabase().rpc("ajustar_tarjeta", {
    p_tarjeta_id: tarjetaId,
    p_sellos: d.sellos,
    p_puntos: d.puntos,
    p_gasto: d.gasto,
    p_nota: d.nota,
  });
  if (error) lanzar(error);
  return normalizarTarjeta(data as TarjetaStaff);
}

export interface DatosConfigurarTarjeta {
  nombre: string;
  telefono: string;
  mesCumple: number | null;
  reglaVip: string;
  permisos: Record<"niveles" | "cashback" | "sellos" | "promo" | "cumple" | "compartida", boolean>;
  activa: boolean;
}

export async function configurarTarjeta(tarjetaId: string, d: DatosConfigurarTarjeta): Promise<TarjetaStaff> {
  const { data, error } = await supabase().rpc("configurar_tarjeta", {
    p_tarjeta_id: tarjetaId,
    p_nombre: d.nombre,
    p_telefono: d.telefono,
    p_mes_cumple: d.mesCumple,
    p_regla_vip: d.reglaVip,
    p_permisos: d.permisos,
    p_activa: d.activa,
  });
  if (error) lanzar(error);
  return normalizarTarjeta(data as TarjetaStaff);
}

export async function cuponReactivacion(tarjetaId: string, activo: boolean): Promise<TarjetaStaff> {
  const { data, error } = await supabase().rpc("cupon_reactivacion", { p_tarjeta_id: tarjetaId, p_activo: activo });
  if (error) lanzar(error);
  return normalizarTarjeta(data as TarjetaStaff);
}

// ---------------------------------------------------------------------------
// Historia
// ---------------------------------------------------------------------------

export interface ResumenAdmin {
  visitas: number;
  ventas: number;
  clientes_atendidos: number;
  ticket_promedio: number;
  puntos_ganados: number;
  puntos_canjeados: number;
  sellos: number;
  premios: number;
  cumples: number;
  cupones: number;
  prestadas: number;
  clientes_nuevos: number;
  altas_qr: number;
  clientes_total: number;
  dias_entre_visitas: number | null;
  semanas: { inicio: string; visitas: number; ventas: number }[];
}

export async function fetchResumen(desde: Date | null, hasta: Date | null): Promise<ResumenAdmin> {
  const { data, error } = await supabase().rpc("resumen_admin", {
    p_desde: desde?.toISOString() ?? null,
    p_hasta: hasta?.toISOString() ?? null,
  });
  if (error) lanzar(error);
  const r = data as ResumenAdmin;
  return {
    ...r,
    ventas: Number(r.ventas),
    ticket_promedio: Number(r.ticket_promedio),
    dias_entre_visitas: r.dias_entre_visitas == null ? null : Number(r.dias_entre_visitas),
    semanas: r.semanas.map((s) => ({ ...s, ventas: Number(s.ventas) })),
  };
}

export async function fetchVisitasDeTarjeta(tarjetaId: string, limite = 30): Promise<Visita[]> {
  const { data, error } = await supabase()
    .from("visitas")
    .select("*")
    .eq("tarjeta_id", tarjetaId)
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) lanzar(error);
  return (data as Visita[]).map((v) => ({ ...v, total_ticket: Number(v.total_ticket) }));
}

export async function fetchMovimientos(tarjetaId: string, limite = 50): Promise<Movimiento[]> {
  const { data, error } = await supabase()
    .from("movimientos")
    .select("id, tarjeta_id, tipo, cantidad, visita_id, nota, creado_en")
    .eq("tarjeta_id", tarjetaId)
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) lanzar(error);
  return (data as Movimiento[]).map((m) => ({ ...m, cantidad: Number(m.cantidad) }));
}

export async function fetchBitacora(f: {
  desde: Date | null;
  hasta: Date | null;
  tipo: TipoBitacora | "todos";
  texto: string;
}): Promise<EntradaBitacora[]> {
  let q = supabase().from("bitacora").select("*").order("creado_en", { ascending: false }).limit(300);
  if (f.desde) q = q.gte("creado_en", f.desde.toISOString());
  if (f.hasta) q = q.lt("creado_en", f.hasta.toISOString());
  if (f.tipo !== "todos") q = q.eq("tipo", f.tipo);
  const texto = f.texto.trim().replace(/[%_,()]/g, " ");
  if (texto) q = q.or(`descripcion.ilike.%${texto}%,actor.ilike.%${texto}%`);
  const { data, error } = await q;
  if (error) lanzar(error);
  return data as EntradaBitacora[];
}

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------

export async function fetchEquipo(): Promise<Perfil[]> {
  const { data, error } = await supabase().from("perfiles").select("*").order("creado_en");
  if (error) lanzar(error);
  return data as Perfil[];
}
