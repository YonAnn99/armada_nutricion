"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, ScanLine } from "lucide-react";
import { Marca } from "@/components/marca";
import { cn } from "@/lib/utils";
import { supabase } from "@/features/lealtad/servicio";

export function EncabezadoStaff({ nombre, rol }: { nombre: string; rol: "admin" | "cajero" }) {
  const ruta = usePathname();
  const router = useRouter();
  const secciones = [
    { href: "/caja", texto: "Caja", icono: ScanLine },
    ...(rol === "admin" ? [{ href: "/admin", texto: "Panel", icono: LayoutDashboard }] : []),
  ];

  const salir = async () => {
    await supabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Inicio" className="shrink-0">
          <Marca className="hidden sm:flex" />
          <Marca className="sm:hidden" compacta />
        </Link>
        <nav aria-label="Secciones" className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-panel p-1 sm:flex-none sm:justify-start">
          {secciones.map((s) => {
            const activa = ruta.startsWith(s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm transition-colors duration-150",
                  activa ? "bg-accent font-semibold text-white" : "font-medium text-muted-foreground hover:text-foreground"
                )}
              >
                <s.icono className="h-4 w-4" aria-hidden="true" />
                <span>{s.texto}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden text-right md:block">
            <p className="text-sm font-medium leading-tight">{nombre}</p>
            <p className="text-xs text-muted-foreground">{rol === "admin" ? "Administrador" : "Cajero"}</p>
          </div>
          <button
            type="button"
            onClick={salir}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
