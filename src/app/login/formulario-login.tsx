"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/features/lealtad/servicio";

export function FormularioLogin() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <Input
          id="contrasena"
          type="password"
          autoComplete="current-password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          required
        />
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
