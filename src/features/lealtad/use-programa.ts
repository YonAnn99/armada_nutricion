"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchConfig, fetchNiveles, mensajeDeError } from "./servicio";
import type { ConfigAdmin, Nivel } from "./types";

/** Configuración y niveles del programa, para caja y admin. */
export function usePrograma() {
  const [config, setConfig] = useState<ConfigAdmin | null>(null);
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    try {
      const [c, n] = await Promise.all([fetchConfig(), fetchNiveles()]);
      setConfig(c);
      setNiveles(n);
      setError(null);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, []);

  useEffect(() => {
    // Diferido para no encadenar renders en el efecto (react-hooks/set-state-in-effect).
    const t = window.setTimeout(() => void refrescar(), 0);
    return () => window.clearTimeout(t);
  }, [refrescar]);

  return { config, niveles, error, refrescar, setConfig, setNiveles };
}
