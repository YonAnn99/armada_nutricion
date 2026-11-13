import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { cabecerasRateLimit, consumirRateLimit, obtenerIpCliente } from "@/lib/rate-limit";
import { verificarTurnstile } from "@/lib/turnstile.server";
import { aE164 } from "@/lib/telefono";
import { codigoAltaValido, limpiarNombre, nombreAltaValido } from "@/features/lealtad/motor";
import type { ResultadoAlta } from "@/features/lealtad/types";

export const maxDuration = 15;

/** 10 altas cada 10 min por IP: los clientes en el wifi de la tienda comparten IP. */
const LIMITE_POR_IP = 10;
const VENTANA_SEGUNDOS = 600;

const esquema = z.object({
  codigoAlta: z.string().max(20),
  nombre: z.string().max(120),
  pais: z.string().max(4),
  numero: z.string().max(30),
  mesCumple: z.number().int().min(1).max(12).nullable().optional(),
  acepto: z.literal(true),
  token: z.string().max(4096).nullable().optional(),
  /** Campo trampa: invisible para una persona; un bot lo llena. */
  sitio: z.string().max(200).optional(),
});

/** Mensajes del RPC → lo que lee el cliente (y con qué código HTTP). */
const MENSAJES: [RegExp, string, number][] = [
  [/registro no está disponible/i, "Este registro ya no está disponible. Pide tu pase en caja.", 404],
  [/ya no se pueden registrar/i, "Hoy ya no se pueden registrar más pases aquí. Pídelo en caja.", 429],
  [/tu nombre/i, "Escribe tu nombre (de 2 a 60 letras).", 400],
  [/celular/i, "Revisa tu número de celular.", 400],
  [/cumpleaños/i, "Revisa tu mes de cumpleaños.", 400],
];

/**
 * El cliente se registra solo con el QR del mostrador (Symvora
 * `/api/lealtad/unirse`). Sin sesión: esta ruta es la ÚNICA puerta a
 * `alta_publica` (solo service_role) y antes valida rate limit y Turnstile.
 *
 * Nunca devuelve el pase de un celular que ya existe (`ya_registrado`): quien
 * tecleara el celular de otro se quedaría con su código y sus puntos.
 */
export async function POST(request: Request) {
  const ip = obtenerIpCliente(request);
  const limite = await consumirRateLimit(`alta:${ip}`, LIMITE_POR_IP, VENTANA_SEGUNDOS);
  if (!limite.permitido) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos o pide tu pase en caja." },
      { status: 429, headers: cabecerasRateLimit(limite) }
    );
  }

  const parsed = esquema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Revisa tus datos y acepta el aviso de privacidad." }, { status: 400 });
  }
  const datos = parsed.data;

  // Un bot llena todo: se le responde como a un celular repetido, sin escribir nada.
  if (datos.sitio) return NextResponse.json({ estado: "ya_registrado" } satisfies ResultadoAlta);

  const codigoAlta = codigoAltaValido(datos.codigoAlta);
  const telefono = aE164(datos.pais, datos.numero);
  if (!codigoAlta) return NextResponse.json({ error: "Este registro ya no está disponible." }, { status: 404 });
  if (!nombreAltaValido(datos.nombre)) {
    return NextResponse.json({ error: "Escribe tu nombre (de 2 a 60 letras)." }, { status: 400 });
  }
  if (!telefono) return NextResponse.json({ error: "Revisa tu número de celular." }, { status: 400 });

  const captcha = await verificarTurnstile(datos.token, ip);
  if (!captcha.ok) {
    if (captcha.motivo === "sin-llave") {
      console.error("[unirse] falta TURNSTILE_SECRET_KEY: el registro con QR está apagado");
    }
    return captcha.motivo === "sin-llave" || captcha.motivo === "sin-respuesta"
      ? NextResponse.json({ error: "No pudimos verificar el registro. Intenta en un momento." }, { status: 503 })
      : NextResponse.json({ error: "Confirma que no eres un robot e intenta de nuevo." }, { status: 403 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("alta_publica", {
    p_codigo_alta: codigoAlta,
    p_nombre: limpiarNombre(datos.nombre),
    p_telefono: telefono,
    p_mes_cumple: datos.mesCumple ?? null,
  });
  if (error) {
    const conocido = MENSAJES.find(([patron]) => patron.test(error.message));
    if (!conocido) console.error("[unirse] falló el alta:", error.message);
    return NextResponse.json(
      { error: conocido?.[1] ?? "No se pudo crear tu pase. Intenta de nuevo." },
      { status: conocido?.[2] ?? 500 }
    );
  }

  const resultado = data as ResultadoAlta | null;
  if (!resultado || (resultado.estado !== "creada" && resultado.estado !== "ya_registrado")) {
    return NextResponse.json({ error: "No se pudo crear tu pase. Intenta de nuevo." }, { status: 500 });
  }
  return NextResponse.json(resultado);
}
