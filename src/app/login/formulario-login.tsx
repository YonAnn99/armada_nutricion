"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/features/lealtad/servicio";

const CLAVE_CREDENCIALES = "armada-login-credenciales";

export function FormularioLogin() {
  const router = useRouter();

  // Inicialización perezosa: lee localStorage una sola vez en el primer render
  const [correo, setCorreo] = useState(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_CREDENCIALES);
      if (guardado) {
        const { correo: c, recordar: r } = JSON.parse(guardado);
        if (r) return c;
      }
    } catch {
      // Ignorar
    }
    return "";
  });
  const [contrasena, setContrasena] = useState(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_CREDENCIALES);
      if (guardado) {
        const { contrasena: p, recordar: r } = JSON.parse(guardado);
        if (r) return p;
      }
    } catch {
      // Ignorar
    }
    return "";
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [recordar, setRecordar] = useState(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_CREDENCIALES);
      if (guardado) {
        const { recordar: r } = JSON.parse(guardado);
        return r;
      }
    } catch {
      // Ignorar
    }
    return false;
  });

  // Guardar/borrar credenciales según el switch (efecto con limpieza)
  useEffect(() => {
    try {
      if (recordar) {
        localStorage.setItem(
          CLAVE_CREDENCIALES,
          JSON.stringify({ correo, contrasena, recordar: true })
        );
      } else {
        localStorage.removeItem(CLAVE_CREDENCIALES);
      }
    } catch {
      // Ignorar errores de escritura (p.ej. almacenamiento lleno)
    }
  }, [recordar, correo, contrasena]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email: correo.trim(), password: contrasena });
    if (error) {
      setError(
        /invalid login/i.test(error.message)
          ? "Correo o contraseña incorrectos."
          : /fetch/i.test(error.message)
            ? "Sin conexión. Revisa tu internet."
            : error.message
      );
      setEnviando(false);
      return;
    }
    router.replace("/");
    router.refresh();
  };

  return (
    <form onSubmit={entrar} className="card-glass w-full max-w-sm space-y-4 rounded-3xl p-6">
      <div className="space-y-1.5">
        <Label htmlFor="correo">Correo</Label>
        <Input
          id="correo"
          type="email"
          autoComplete="username"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contrasena">Contraseña</Label>
        <div className="relative">
          <Input
            id="contrasena"
            type={mostrarContrasena ? "text" : "password"}
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setMostrarContrasena((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={mostrarContrasena ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={mostrarContrasena}
          >
            {mostrarContrasena ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={recordar} onCheckedChange={setRecordar} />
          Recordar credenciales
        </label>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-destructive/15 px-3 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full font-bold" disabled={enviando}>
        {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Entrar
      </Button>
    </form>
  );
}
