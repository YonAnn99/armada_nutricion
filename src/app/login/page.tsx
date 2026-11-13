import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Marca } from "@/components/marca";
import { obtenerPerfil } from "@/lib/supabase/sesion";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await obtenerPerfil()) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Marca completa className="w-64" />
        <p className="text-xs font-bold uppercase tracking-widest text-purple-300">Sistema de lealtad · Equipo</p>
      </div>
      <FormularioLogin />
    </main>
  );
}
