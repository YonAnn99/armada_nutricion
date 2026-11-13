import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/supabase/sesion";

/** La raíz manda al equipo a su pantalla: el admin al panel, el cajero a caja. */
export default async function Inicio() {
  const perfil = await obtenerPerfil();
  if (!perfil) redirect("/login");
  redirect(perfil.rol === "admin" ? "/admin" : "/caja");
}
