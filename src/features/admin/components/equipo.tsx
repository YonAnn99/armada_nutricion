"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNativo } from "@/components/ui/select-nativo";
import { Switch } from "@/components/ui/switch";
import { fetchEquipo, mensajeDeError } from "@/features/lealtad/servicio";
import type { Perfil } from "@/features/lealtad/types";

async function llamar(metodo: "POST" | "PATCH", cuerpo: unknown) {
  const res = await fetch("/api/equipo", {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const r = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(r?.error ?? "No se pudo completar.");
}

/** Cajeros y administradores. El cajero solo ve el validador; el admin, todo. */
export function Equipo({ miUserId }: { miUserId: string }) {
  const [equipo, setEquipo] = useState<Perfil[] | null>(null);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [rol, setRol] = useState<"cajero" | "admin">("cajero");
  const [enviando, setEnviando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [claveDe, setClaveDe] = useState<Perfil | null>(null);
  const [nuevaClave, setNuevaClave] = useState("");

  const cargar = useCallback(async () => {
    try {
      setEquipo(await fetchEquipo());
    } catch (e) {
      toast.error(mensajeDeError(e));
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(t);
  }, [cargar]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await llamar("POST", { nombre, correo, contrasena, rol });
      toast.success(`${nombre} ya puede entrar con ${correo}`);
      setNombre("");
      setCorreo("");
      setContrasena("");
      setRol("cajero");
      await cargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const cambiar = async (p: Perfil, cambios: { activo?: boolean; rol?: "admin" | "cajero"; contrasena?: string }) => {
    setOcupado(p.user_id);
    try {
      await llamar("PATCH", { userId: p.user_id, ...cambios });
      toast.success(cambios.contrasena ? "Contraseña cambiada" : "Equipo actualizado");
      await cargar();
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="card-glass rounded-3xl p-5">
        <h2 className="font-display mb-3 text-sm font-black uppercase tracking-wider">Equipo</h2>
        {!equipo ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-purple-400" aria-label="Cargando" />
        ) : (
          <ul className="space-y-2">
            {equipo.map((p) => {
              const yo = p.user_id === miUserId;
              return (
                <li key={p.user_id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-black/30 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {p.nombre} {yo && <span className="text-xs text-muted-foreground">(tú)</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Desde {new Date(p.creado_en).toLocaleDateString("es-MX", { dateStyle: "medium" })}
                    </p>
                  </div>
                  <SelectNativo
                    value={p.rol}
                    disabled={yo || ocupado === p.user_id}
                    onChange={(e) => void cambiar(p, { rol: e.target.value as "admin" | "cajero" })}
                    className="w-32"
                    aria-label={`Rol de ${p.nombre}`}
                  >
                    <option value="cajero">Cajero</option>
                    <option value="admin">Admin</option>
                  </SelectNativo>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Cambiar contraseña"
                    aria-label={`Cambiar contraseña de ${p.nombre}`}
                    disabled={ocupado === p.user_id}
                    onClick={() => {
                      setNuevaClave("");
                      setClaveDe(p);
                    }}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                  <label className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={p.activo}
                      disabled={yo || ocupado === p.user_id}
                      onCheckedChange={(v) => void cambiar(p, { activo: v })}
                      size="sm"
                    />
                    {p.activo ? "Activo" : "Sin acceso"}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form onSubmit={crear} className="card-glass space-y-3 rounded-3xl p-5">
        <h2 className="font-display text-sm font-black uppercase tracking-wider">Agregar al equipo</h2>
        <div className="space-y-1.5">
          <Label htmlFor="eq-nombre">Nombre</Label>
          <Input id="eq-nombre" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eq-correo">Correo (para entrar)</Label>
          <Input id="eq-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eq-pass">Contraseña inicial</Label>
          <Input id="eq-pass" type="text" minLength={8} value={contrasena} onChange={(e) => setContrasena(e.target.value)} required autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eq-rol">Rol</Label>
          <SelectNativo id="eq-rol" value={rol} onChange={(e) => setRol(e.target.value as "cajero" | "admin")}>
            <option value="cajero">Cajero (solo validador)</option>
            <option value="admin">Admin (todo)</option>
          </SelectNativo>
        </div>
        <Button type="submit" className="w-full font-bold" disabled={enviando || contrasena.length < 8}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Crear acceso
        </Button>
      </form>

      <Dialog open={claveDe != null} onOpenChange={(v) => !v && setClaveDe(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (claveDe && nuevaClave.length >= 8) {
                void cambiar(claveDe, { contrasena: nuevaClave });
                setClaveDe(null);
              }
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Cambiar contraseña</DialogTitle>
              <DialogDescription>Nueva contraseña para {claveDe?.nombre} (mínimo 8 caracteres).</DialogDescription>
            </DialogHeader>
            <Input
              type="text"
              value={nuevaClave}
              minLength={8}
              autoComplete="new-password"
              onChange={(e) => setNuevaClave(e.target.value)}
              aria-label="Nueva contraseña"
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setClaveDe(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={nuevaClave.length < 8}>
                Cambiar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
