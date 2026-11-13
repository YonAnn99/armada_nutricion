import { NextResponse } from "next/server";
import { z } from "zod";
import { obtenerPerfil } from "@/lib/supabase/sesion";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Alta y cambios del equipo. Solo un admin con sesión; la escritura va con la
 * service role porque crear usuarios de Auth no se puede con la llave anónima.
 */
async function soloAdmin() {
  const perfil = await obtenerPerfil();
  return perfil?.rol === "admin" ? perfil : null;
}

const alta = z.object({
  nombre: z.string().trim().min(1).max(60),
  correo: z.email().max(200),
  contrasena: z.string().min(8).max(72),
  rol: z.enum(["admin", "cajero"]),
});

export async function POST(request: Request) {
  if (!(await soloAdmin())) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const p = alta.safeParse(await request.json().catch(() => null));
  if (!p.success) {
    return NextResponse.json({ error: "Revisa los datos: nombre, correo y una contraseña de al menos 8 caracteres." }, { status: 400 });
  }
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: p.data.correo,
    password: p.data.contrasena,
    email_confirm: true,
  });
  if (error || !data.user) {
    const repetido = /already|registered|exists/i.test(error?.message ?? "");
    return NextResponse.json(
      { error: repetido ? "Ya existe un usuario con ese correo." : "No se pudo crear el usuario." },
      { status: repetido ? 409 : 500 }
    );
  }
  const { error: errorPerfil } = await supabase
    .from("perfiles")
    .insert({ user_id: data.user.id, nombre: p.data.nombre, rol: p.data.rol });
  if (errorPerfil) {
    await supabase.auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ error: "No se pudo guardar el perfil." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

const cambio = z.object({
  userId: z.uuid(),
  activo: z.boolean().optional(),
  rol: z.enum(["admin", "cajero"]).optional(),
  contrasena: z.string().min(8).max(72).optional(),
});

export async function PATCH(request: Request) {
  const yo = await soloAdmin();
  if (!yo) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const p = cambio.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  if (p.data.userId === yo.user_id && (p.data.activo === false || p.data.rol === "cajero")) {
    return NextResponse.json({ error: "No puedes quitarte tu propio acceso de admin." }, { status: 400 });
  }
  const supabase = createSupabaseServiceRoleClient();
  const cambios: { activo?: boolean; rol?: string } = {};
  if (p.data.activo !== undefined) cambios.activo = p.data.activo;
  if (p.data.rol) cambios.rol = p.data.rol;
  if (Object.keys(cambios).length) {
    const { error } = await supabase.from("perfiles").update(cambios).eq("user_id", p.data.userId);
    if (error) return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  }
  if (p.data.contrasena) {
    const { error } = await supabase.auth.admin.updateUserById(p.data.userId, { password: p.data.contrasena });
    if (error) return NextResponse.json({ error: "No se pudo cambiar la contraseña." }, { status: 500 });
  }
  // Desactivar también cierra sus sesiones abiertas.
  if (p.data.activo === false) await supabase.auth.admin.signOut(p.data.userId).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
