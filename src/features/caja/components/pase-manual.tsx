"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNativo } from "@/components/ui/select-nativo";
import { Switch } from "@/components/ui/switch";
import { TelefonoInput } from "@/components/ui/telefono-input";
import { PaseArmada } from "@/features/lealtad/components/pase-armada";
import { hoyMexico, MESES, nombreAltaValido } from "@/features/lealtad/motor";
import { crearPaseManual, mensajeDeError } from "@/features/lealtad/servicio";
import type { ConfigLealtad, Nivel, TarjetaStaff } from "@/features/lealtad/types";
import { aE164, PAIS_POR_DEFECTO } from "@/lib/telefono";
import { cn } from "@/lib/utils";

/**
 * "+ Crear pase manual (vista en vivo)" del simulador: el cajero registra al
 * cliente en el mostrador y ve su pase mientras escribe. Si el celular ya
 * existe, abre ese pase (el cliente está enfrente).
 */
export function PaseManual({
  abierto,
  onAbiertoChange,
  config,
  niveles,
  onCreado,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  config: ConfigLealtad;
  niveles: Nivel[];
  onCreado: (t: TarjetaStaff) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [pais, setPais] = useState(PAIS_POR_DEFECTO);
  const [numero, setNumero] = useState("");
  const [mes, setMes] = useState("");
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Permisos de dinámicas para este pase (por defecto: lo que dice el admin)
  const [permisos, setPermisos] = useState<Record<"niveles" | "cashback" | "sellos" | "promo" | "cumple" | "compartida", boolean>>({
    niveles: config.niveles_activos,
    cashback: config.cashback_activo,
    sellos: config.sellos_activos,
    promo: config.promo_activa,
    cumple: config.cumple_activo,
    compartida: config.compartida_activa,
  });

  const telefono = aE164(pais, numero);
  const nombreOk = nombreAltaValido(nombre);
  const bienvenida = config.cashback_activo ? config.puntos_bienvenida : 0;

  const limpiar = () => {
    setNombre("");
    setNumero("");
    setMes("");
    setTocado(false);
    setPermisos({
      niveles: config.niveles_activos,
      cashback: config.cashback_activo,
      sellos: config.sellos_activos,
      promo: config.promo_activa,
      cumple: config.cumple_activo,
      compartida: config.compartida_activa,
    });
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setTocado(true);
    if (!nombreOk || !telefono) return;
    setEnviando(true);
    try {
      const r = await crearPaseManual(nombre, telefono, mes ? Number(mes) : null, permisos);
      if (r.estado === "existente") toast.info(`Ese celular ya tiene pase: #${r.tarjeta.folio}`);
      else toast.success(`Pase #${r.tarjeta.folio} creado${bienvenida ? ` con +${bienvenida} ${config.nombre_puntos}` : ""}`);
      onCreado(r.tarjeta);
      limpiar();
      onAbiertoChange(false);
    } catch (err) {
      toast.error(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crear pase manual</DialogTitle>
          <DialogDescription>Registra al cliente en el mostrador. El pase se actualiza mientras escribes.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-2">
          <form onSubmit={crear} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pm-nombre">Nombre completo</Label>
              <Input
                id="pm-nombre"
                value={nombre}
                maxLength={60}
                onChange={(e) => setNombre(e.target.value)}
                aria-invalid={tocado && !nombreOk}
                autoFocus
              />
              {tocado && !nombreOk && <p className="text-xs text-red-300">Escribe el nombre (de 2 a 60 letras).</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-celular">WhatsApp</Label>
              <TelefonoInput
                id="pm-celular"
                pais={pais}
                numero={numero}
                onPaisChange={setPais}
                onNumeroChange={setNumero}
                invalido={tocado && !telefono}
                placeholder="10 dígitos"
              />
              {tocado && !telefono && <p className="text-xs text-red-300">Revisa el número de celular.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-mes">Mes de cumpleaños</Label>
              <SelectNativo id="pm-mes" value={mes} onChange={(e) => setMes(e.target.value)}>
                <option value="">Sin dato</option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </SelectNativo>
            </div>

            {/* Dinámicas asignables */}
            <div className="rounded-2xl border border-border bg-black/30 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-purple-300">Dinámicas para este cliente</p>
              <p className="mb-2 text-xs text-muted-foreground">Por defecto se usan las del admin. Desactiva las que no apliquen.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { id: "niveles", texto: "Niveles", activo: config.niveles_activos },
                  { id: "cashback", texto: "Cashback", activo: config.cashback_activo },
                  { id: "sellos", texto: "Sellos", activo: config.sellos_activos },
                  { id: "promo", texto: "Promo relámpago", activo: config.promo_activa },
                  { id: "cumple", texto: "Cumpleaños", activo: config.cumple_activo },
                  { id: "compartida", texto: "Tarjeta compartida", activo: config.compartida_activa },
                ].map((p) => (
                  <label
                    key={p.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold",
                      !p.activo && "opacity-40"
                    )}
                  >
                    {p.texto}
                    <Switch
                      checked={permisos[p.id as keyof typeof permisos]}
                      onCheckedChange={(v) => setPermisos((x) => ({ ...x, [p.id]: v }))}
                      size="sm"
                      disabled={!p.activo}
                    />
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full font-bold" disabled={enviando}>
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear pase
            </Button>
          </form>
          <div className="flex justify-center">
            <PaseArmada
              datos={{
                tarjeta: {
                  codigo: "",
                  folio: "ARM-NUEVO",
                  gasto_historico: 0,
                  puntos: bienvenida,
                  sellos: 0,
                  premios_canjeados: 0,
                  regla_vip: null,
                  cupon_reactivacion: false,
                  cumple_canjeado_anio: null,
                  permite_niveles: permisos.niveles,
                  permite_cashback: permisos.cashback,
                  permite_sellos: permisos.sellos,
                  permite_promo: permisos.promo,
                  permite_cumple: permisos.cumple,
                  permite_compartida: permisos.compartida,
                  activa: true,
                },
                nombre: nombre.trim() || "Nombre del cliente",
                mesCumple: mes ? Number(mes) : null,
                config,
                niveles,
                hoy: hoyMexico(),
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
