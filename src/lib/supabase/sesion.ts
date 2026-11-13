import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./server";
import type { Perfil } from "@/features/lealtad/types";

/**
 * Perfil del usuario con sesión (o null). `cache`: una sola consulta por
 * petición aunque lo pidan el layout y la página.
 */
export const obtenerPerfil = cache(async (): Promise<Perfil | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("perfiles").select("*").eq("user_id", user.id).maybeSingle<Perfil>();
  return data && data.activo ? data : null;
});

/** Para páginas del equipo: sin sesión o sin perfil activo, al login. */
export async function exigirStaff(): Promise<Perfil> {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect("/login");
  return perfil;
}

export async function exigirAdmin(): Promise<Perfil> {
  const perfil = await exigirStaff();
  if (perfil.rol !== "admin") redirect("/caja");
  return perfil;
}
