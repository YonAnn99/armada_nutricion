/**
 * Crea (o actualiza) un usuario del equipo con su perfil.
 *
 *   npm run usuario -- correo@armada.mx "contraseña" "Nombre" admin|cajero
 *
 * Usa la service role de .env.local: sirve para dar de alta al primer admin.
 * Después, el admin da de alta a los cajeros desde Panel admin → Equipo.
 */
import { createClient } from "@supabase/supabase-js";

const [correo, contrasena, nombre, rol = "cajero"] = process.argv.slice(2);
if (!correo || !contrasena || !nombre || !["admin", "cajero"].includes(rol)) {
  console.error('Uso: npm run usuario -- correo "contraseña" "Nombre" admin|cajero');
  process.exit(1);
}
if (contrasena.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });

let userId;
const { data: creado, error } = await supabase.auth.admin.createUser({
  email: correo,
  password: contrasena,
  email_confirm: true,
});
if (error) {
  if (!/already been registered|already exists/i.test(error.message)) {
    console.error("No se pudo crear el usuario:", error.message);
    process.exit(1);
  }
  const { data: lista } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existente = lista?.users.find((u) => u.email?.toLowerCase() === correo.toLowerCase());
  if (!existente) {
    console.error("El usuario existe pero no se encontró.");
    process.exit(1);
  }
  userId = existente.id;
  await supabase.auth.admin.updateUserById(userId, { password: contrasena });
} else {
  userId = creado.user.id;
}

const { error: errorPerfil } = await supabase
  .from("perfiles")
  .upsert({ user_id: userId, nombre, rol, activo: true }, { onConflict: "user_id" });
if (errorPerfil) {
  console.error("No se pudo guardar el perfil:", errorPerfil.message);
  process.exit(1);
}
console.log(`Listo: ${correo} (${rol})`);
