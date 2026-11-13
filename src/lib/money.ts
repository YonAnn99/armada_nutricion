/**
 * Formato de dinero en pesos mexicanos.
 * - `formatMXN`: con centavos, para tickets y totales exactos.
 * - `formatMXN0`: sin centavos, para listas, KPIs y saldos (más fácil de leer).
 */
export function formatMXN(n: number): string {
  return Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export function formatMXN0(n: number): string {
  return Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}
