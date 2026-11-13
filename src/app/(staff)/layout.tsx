import { exigirStaff } from "@/lib/supabase/sesion";
import { EncabezadoStaff } from "./encabezado";

/** Pantallas del equipo: siempre con sesión y perfil activo (la base también lo exige). */
export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const perfil = await exigirStaff();
  return (
    <div className="min-h-dvh">
      <EncabezadoStaff nombre={perfil.nombre} rol={perfil.rol} />
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-5 sm:px-6">{children}</main>
    </div>
  );
}
