"use client";

import { useEffect, useState } from "react";
import { Copy, Download, ExternalLink, Loader2, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { descargarBlob, generarCartel } from "@/features/lealtad/cartel-pdf";
import { pct, urlAlta } from "@/features/lealtad/motor";
import { qrSvg } from "@/features/lealtad/qr";
import { guardarConfig, mensajeDeError, regenerarCodigoAlta } from "@/features/lealtad/servicio";
import type { ConfigAdmin } from "@/features/lealtad/types";
import { copiar } from "@/lib/portapapeles";

/**
 * "QR para tu mostrador" (Symvora 121): el cartel que el cliente escanea para
 * registrarse solo. "Cambiar código" invalida los carteles impresos.
 */
export function QrMostrador({ config, onConfig }: { config: ConfigAdmin; onConfig: (c: ConfigAdmin) => void }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [aviso, setAviso] = useState(config.aviso_privacidad_url ?? "");
  const [guardando, setGuardando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const url = config.alta_publica && config.codigo_alta ? urlAlta(config.codigo_alta) : null;

  useEffect(() => {
    if (!url) return;
    let vivo = true;
    void qrSvg(url).then((s) => vivo && setSvg(s));
    return () => {
      vivo = false;
    };
  }, [url]);

  const alternar = async (v: boolean) => {
    setGuardando(true);
    try {
      onConfig(await guardarConfig({ alta_publica: v }));
      toast.success(v ? "Registro con QR activado" : "Registro con QR apagado");
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const guardarAviso = async () => {
    const limpio = aviso.trim();
    if (limpio && !/^https:\/\/\S+$/.test(limpio)) {
      toast.error("El aviso debe ser un enlace que empiece con https://");
      return;
    }
    setGuardando(true);
    try {
      onConfig(await guardarConfig({ aviso_privacidad_url: limpio || null }));
      toast.success("Aviso de privacidad guardado");
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const descargar = async () => {
    if (!url) return;
    setDescargando(true);
    try {
      const beneficios = [
        config.cashback_activo && `${pct(config.cashback_pct)}% de cashback en ${config.nombre_puntos} en cada compra`,
        config.sellos_activos && `Junta ${config.sellos_meta} ${config.sellos_titulo.toLowerCase()}: ${config.sellos_premio}`,
        config.niveles_activos && "Sube de nivel y gana descuentos permanentes",
        config.cumple_activo && `Regalo en tu cumpleaños: ${config.cumple_texto}`,
      ].filter(Boolean) as string[];
      const blob = await generarCartel({
        url,
        puntosBienvenida: config.cashback_activo ? config.puntos_bienvenida : 0,
        nombrePuntos: config.nombre_puntos,
        beneficios,
      });
      descargarBlob(blob, "cartel-armada-pass.pdf");
    } catch (e) {
      toast.error(mensajeDeError(e, "No se pudo generar el cartel."));
    } finally {
      setDescargando(false);
    }
  };

  const cambiarCodigo = async () => {
    setCambiando(true);
    try {
      const codigo = await regenerarCodigoAlta();
      onConfig({ ...config, codigo_alta: codigo });
      toast.success("Código cambiado. Imprime el cartel nuevo.");
      setConfirmando(false);
    } catch (e) {
      toast.error(mensajeDeError(e));
    } finally {
      setCambiando(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="card-glass space-y-5 rounded-3xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-sm font-black uppercase tracking-wider">Registro autónomo con QR</h2>
            <p className="text-sm text-muted-foreground">
              El cliente escanea el cartel del mostrador, escribe su nombre y WhatsApp y recibe su pase al momento. Un
              celular ya registrado nunca recibe el pase por aquí: se le pide ir a caja.
            </p>
          </div>
          <Switch checked={config.alta_publica} onCheckedChange={alternar} disabled={guardando} aria-label="Activar registro con QR" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="aviso">Enlace a tu aviso de privacidad (opcional)</Label>
          <div className="flex gap-2">
            <Input id="aviso" value={aviso} onChange={(e) => setAviso(e.target.value)} placeholder="https://armadanutrition.com/privacidad" />
            <Button variant="outline" onClick={guardarAviso} disabled={guardando || aviso === (config.aviso_privacidad_url ?? "")}>
              Guardar
            </Button>
          </div>
        </div>

        {url && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2 font-mono text-xs">
              <span className="min-w-0 flex-1 truncate">{url}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={descargar} disabled={descargando} className="font-bold">
                {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Descargar cartel (PDF)
              </Button>
              <Button variant="outline" onClick={() => void copiar(url, "Enlace de registro copiado")}>
                <Copy className="h-4 w-4" /> Copiar enlace
              </Button>
              <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
                <ExternalLink className="h-4 w-4" /> Probar
              </a>
              <Button variant="ghost" onClick={() => setConfirmando(true)}>
                <RefreshCw className="h-4 w-4" /> Cambiar código
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="card-glass flex flex-col items-center justify-center gap-3 rounded-3xl p-6 text-center">
        {url && svg ? (
          <>
            <div className="w-56 rounded-2xl border-4 border-purple-500 bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="font-display text-xs font-black uppercase tracking-widest">Escanéame para obtener tu pase</p>
          </>
        ) : (
          <>
            <QrCode className="h-12 w-12 text-purple-400" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Activa el registro con QR para generar el código del mostrador.</p>
          </>
        )}
      </section>

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cambiar el código del mostrador?</DialogTitle>
            <DialogDescription>
              Los carteles impresos dejarán de funcionar y tendrás que imprimir el nuevo. Los pases que ya existen no cambian.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button onClick={cambiarCodigo} disabled={cambiando}>
              {cambiando && <Loader2 className="h-4 w-4 animate-spin" />}
              Sí, cambiar código
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
