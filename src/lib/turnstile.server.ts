import { timeoutSignal } from "@/lib/http-timeout";

/**
 * Verifica en el servidor el token de Cloudflare Turnstile.
 *
 * En el login y el registro de cuentas lo valida Supabase Auth (`captchaToken`);
 * aqui es para formularios propios sin cuenta, como el registro a la tarjeta de
 * lealtad con el QR del local (POST /api/lealtad/unirse).
 *
 * Falla CERRADO: sin `TURNSTILE_SECRET_KEY`, sin token o si Cloudflare no
 * responde, devuelve un motivo y la ruta no escribe nada. `sin-llave` se
 * distingue para responder 503 (falta configurar) y no 403 (eres un bot).
 */
export type ResultadoTurnstile = { ok: true } | { ok: false; motivo: "sin-llave" | "sin-token" | "rechazado" | "sin-respuesta" };

const URL_VERIFICAR = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * En desarrollo (`next dev`) sin llaves no se exige: así se puede probar el
 * registro con Supabase local. En producción falta la llave = 503.
 */
export function turnstileOpcional(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.TURNSTILE_SECRET_KEY;
}

export async function verificarTurnstile(token: string | null | undefined, ip?: string): Promise<ResultadoTurnstile> {
  if (turnstileOpcional()) return { ok: true };
  const secreto = process.env.TURNSTILE_SECRET_KEY;
  if (!secreto) return { ok: false, motivo: "sin-llave" };
  if (!token) return { ok: false, motivo: "sin-token" };

  const cuerpo = new URLSearchParams({ secret: secreto, response: token });
  if (ip && ip !== "desconocida") cuerpo.set("remoteip", ip);

  try {
    const res = await fetch(URL_VERIFICAR, {
      method: "POST",
      body: cuerpo,
      signal: timeoutSignal(5_000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, motivo: "sin-respuesta" };
    const datos = (await res.json()) as { success?: boolean };
    return datos.success === true ? { ok: true } : { ok: false, motivo: "rechazado" };
  } catch {
    return { ok: false, motivo: "sin-respuesta" };
  }
}
