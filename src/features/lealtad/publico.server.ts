import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { consumirRateLimit, obtenerIpCliente } from "@/lib/rate-limit";
import { codigoAltaValido, codigoDesdeEscaneo } from "./motor";
import type { ProgramaAltaPublica, TarjetaPublica } from "./types";

/**
 * Lecturas públicas (Symvora `tarjeta-publica.server.ts` / `alta-publica.server.ts`).
 *
 * Cliente ANÓNIMO a propósito, sin cookies: las abre el cliente final sin
 * cuenta y las funciones solo devuelven lo que se pinta.
 *
 * `null` si el código no es válido, no existe o se pasó del límite (60 por
 * minuto por IP): para quien prueba códigos al azar, las tres se ven igual.
 * `cache`: la página y su `generateMetadata` consultan UNA vez por petición.
 */
function clienteAnonimo() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function dentroDelLimite(clave: string): Promise<boolean> {
  const cabeceras = await headers();
  const ip = obtenerIpCliente(new Request("http://armada.local", { headers: cabeceras }));
  const limite = await consumirRateLimit(`${clave}:${ip}`, 60, 60);
  return limite.permitido;
}

export const obtenerTarjetaPublica = cache(async (codigoCrudo: string): Promise<TarjetaPublica | null> => {
  const codigo = codigoDesdeEscaneo(codigoCrudo);
  if (!codigo || !(await dentroDelLimite("tarjeta-publica"))) return null;
  const { data, error } = await clienteAnonimo().rpc("tarjeta_publica", { p_codigo: codigo });
  if (error) {
    console.error("[tarjeta-publica] falló el RPC:", error.message);
    return null;
  }
  return (data as TarjetaPublica | null) ?? null;
});

export const obtenerProgramaAlta = cache(async (codigoCrudo: string): Promise<ProgramaAltaPublica | null> => {
  const codigo = codigoAltaValido(codigoCrudo);
  if (!codigo || !(await dentroDelLimite("alta-publica"))) return null;
  const { data, error } = await clienteAnonimo().rpc("programa_alta_publica", { p_codigo_alta: codigo });
  if (error) {
    console.error("[alta-publica] falló el RPC:", error.message);
    return null;
  }
  return (data as ProgramaAltaPublica | null) ?? null;
});
