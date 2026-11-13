"use client";

import { useEffect, useState, type RefObject } from "react";
import { Loader2, QrCode, ScanLine, UserPlus } from "lucide-react";
import { EscanerCamara } from "@/components/escaner/escaner-camara";
import { useHayCamara } from "@/components/escaner/boton-escanear";
import { Button } from "@/components/ui/button";
import { buscarPorNombre, buscarTarjeta, mensajeDeError } from "@/features/lealtad/servicio";
import type { TarjetaStaff } from "@/features/lealtad/types";
import { cn } from "@/lib/utils";

/** Solo letras y espacios: se busca por nombre. Con dígitos o URL es un código, folio o celular. */
const PARECE_NOMBRE = /^[\p{L}\s'.]{2,}$/u;

/**
 * Barra de búsqueda del validador: UN campo para todo (lector láser, código,
 * ARM-101, celular o nombre) más la cámara. El lector "teclea" la URL del QR y
 * un Enter, así que el campo tiene el foco siempre que no hay cliente.
 */
export function BarraCaja({
  campoRef,
  onTarjeta,
  onNuevoPase,
}: {
  campoRef: RefObject<HTMLInputElement | null>;
  onTarjeta: (t: TarjetaStaff) => void;
  onNuevoPase: () => void;
}) {
  const hayCamara = useHayCamara();
  const [camara, setCamara] = useState(false);
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<TarjetaStaff[] | null>(null);

  const elegir = (t: TarjetaStaff) => {
    onTarjeta(t);
    setTexto("");
    setResultados(null);
    setError(null);
  };

  const buscar = async (valor: string) => {
    const q = valor.trim();
    if (!q) return;
    setBuscando(true);
    setError(null);
    try {
      const t = await buscarTarjeta(q);
      if (t) return elegir(t);
      const porNombre = PARECE_NOMBRE.test(q) ? await buscarPorNombre(q) : [];
      if (porNombre.length === 1) return elegir(porNombre[0]);
      if (porNombre.length > 1) setResultados(porNombre);
      else setError("No encontramos ese pase. Revisa el código, el folio o el celular.");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBuscando(false);
    }
  };

  // Mientras se escribe un nombre, sugerencias con una pausa corta.
  useEffect(() => {
    const q = texto.trim();
    let vivo = true;
    const t = window.setTimeout(
      () => {
        if (!PARECE_NOMBRE.test(q)) {
          if (vivo) setResultados(null);
          return;
        }
        void buscarPorNombre(q)
          .then((r) => vivo && setResultados(r))
          .catch(() => vivo && setResultados(null));
      },
      PARECE_NOMBRE.test(q) ? 250 : 0
    );
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [texto]);

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(texto);
        }}
        className="flex flex-wrap items-center gap-2 sm:flex-nowrap"
      >
        <label htmlFor="codigo-pase" className="sr-only">
          Código del pase, folio, celular o nombre
        </label>
        <div className="flex h-12 min-w-0 flex-1 basis-full items-center gap-2.5 rounded-xl border border-input bg-panel-2 px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 sm:basis-auto">
          {buscando ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-300" aria-hidden="true" />
          ) : (
            <ScanLine className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <input
            id="codigo-pase"
            ref={campoRef}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && (texto || resultados)) {
                e.stopPropagation();
                setTexto("");
                setResultados(null);
              }
            }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Escanea o escribe ARM-101, código, celular o nombre"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline">Enter para buscar</span>
        </div>
        {hayCamara && (
          <Button type="button" variant="outline" className="h-12 flex-1 rounded-xl sm:flex-none" onClick={() => setCamara(true)}>
            <QrCode className="h-4 w-4" aria-hidden="true" />
            Cámara
          </Button>
        )}
        <Button type="button" variant="ghost" className="h-12 flex-1 rounded-xl text-purple-200 sm:flex-none" onClick={onNuevoPase}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Nuevo pase
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {resultados && texto.trim() && (
        <ul
          aria-label="Clientes encontrados"
          className="absolute inset-x-0 top-14 z-20 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-2xl shadow-black/60"
        >
          {resultados.length === 0 && <li className="px-3 py-2.5 text-sm text-muted-foreground">Sin coincidencias.</li>}
          {resultados.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => elegir(t)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-accent",
                  !t.activa && "opacity-60"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{t.cliente.nombre}</span>
                  <span className="block text-xs text-muted-foreground">{t.folio}</span>
                </span>
                <span className="tabular shrink-0 text-xs font-semibold text-purple-200">${t.puntos} pts</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <EscanerCamara
        open={camara}
        onOpenChange={setCamara}
        modo="uno"
        titulo="Escanear Armada Pass"
        descripcion="Apunta al QR del pase del cliente."
        onCodigo={(valor) => {
          void buscar(valor);
        }}
      />
    </div>
  );
}
