"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNativo } from "@/components/ui/select-nativo";
import { TelefonoInput } from "@/components/ui/telefono-input";
import { PaseArmada } from "@/features/lealtad/components/pase-armada";
import { hoyMexico, MESES, nombreAltaValido } from "@/features/lealtad/motor";
import { crearPaseManual, mensajeDeError } from "@/features/lealtad/servicio";
import type { ConfigLealtad, Nivel, TarjetaStaff } from "@/features/lealtad/types";
import { aE164, PAIS_POR_DEFECTO } from "@/lib/telefono";

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

  const telefono = aE164(pais, numero);
  const nombreOk = nombreAltaValido(nombre);
  const bienvenida = config.cashback_activo ? config.puntos_bienvenida : 0;

  const limpiar = () => {
    setNombre("");
    setNumero("");
    setMes("");
    setTocado(false);
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setTocado(true);
    if (!nombreOk || !telefono) return;
    setEnviando(true);
    try {
      const r = await crearPaseManual(nombre, telefono, mes ? Number(mes) : null);
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
                  permite_niveles: true,
                  permite_cashback: true,
                  permite_sellos: true,
                  permite_promo: true,
                  permite_cumple: true,
                  permite_compartida: true,
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
