/**
 * Saneado y parseo de números para inputs controlados con estado de texto.
 *
 * Evita el bug de React 19 + type="number": "05" queda visible aunque el estado sea 5.
 * Usa type="text" + inputMode + estado string, saneando en cada onChange.
 */

export interface OpcionesNumero {
  /** Permite punto decimal (por defecto false). */
  decimal?: boolean;
  /** Permite signo negativo (por defecto false). */
  negativo?: boolean;
  /** Mínimo permitido (para aviso visual, no bloquea la escritura). */
  min?: number;
  /** Máximo permitido (para aviso visual, no bloquea la escritura). */
  max?: number;
}

/**
 * Limpia una cadena cruda a una representación numérica canónica.
 *
 * Reglas:
 * - Solo dígitos, un punto opcional, signo opcional al inicio.
 * - Quita ceros a la izquierda: "05" → "5", "00" → "0", "000" → "0".
 * - ".5" → "0.5"; "12." → "12." (se permite final abierto mientras se escribe).
 * - "-" → "-" (solo signo, válido mientras se escribe).
 * - "1.2.3" → "1.23"; "1-2" → "12".
 */
export function sanearNumero(bruto: string, { decimal = false, negativo = false }: OpcionesNumero = {}): string {
  // 1) Solo caracteres permitidos
  let s = String(bruto ?? "").replace(/[^\d.-]/g, "");

  // 2) Signo solo al inicio
  const signo = negativo && s.startsWith("-") ? "-" : "";
  s = signo + s.slice(signo.length).replace(/-/g, "");

  // 3) Un solo punto decimal
  if (decimal) {
    const i = s.indexOf(".");
    if (i >= 0) {
      s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
    }
    // ".5" → "0.5"
    if (s.startsWith(".")) s = "0" + s;
  } else {
    // Sin decimales: quita todos los puntos
    s = s.replace(/\./g, "");
  }

  // 4) Quita ceros a la izquierda del entero (pero deja al menos un dígito si hay parte fraccionaria)
  const neg = s.startsWith("-");
  const cuerpo = neg ? s.slice(1) : s;
  const punto = cuerpo.indexOf(".");
  const entero = punto >= 0 ? cuerpo.slice(0, punto) : cuerpo;
  const frac = punto >= 0 ? cuerpo.slice(punto + 1) : "";

  // "00" → "0", "05" → "5", "" → "0" (si no hay parte fraccionaria)
  const enteroLimpio = entero.replace(/^0+(?=\d)/, "");
  const core =
    (enteroLimpio || (frac !== "" || entero === "" ? enteroLimpio : "0")) +
    (punto >= 0 ? "." + frac : "");

  return (neg ? "-" : "") + core;
}

/**
 * Convierte el texto saneado a number para enviar al servidor.
 * "" → 0, "-0" → 0, "0.5" → 0.5, "5" → 5.
 */
export function parsearNumero(texto: string): number {
  const t = texto.trim();
  if (t === "" || t === "-" || t === "-0" || t === "+") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** true si el número está dentro de [min, max] (si están definidos). */
export function dentroDeRango(n: number, { min, max }: OpcionesNumero = {}): boolean {
  if (min !== undefined && n < min) return false;
  if (max !== undefined && n > max) return false;
  return true;
}