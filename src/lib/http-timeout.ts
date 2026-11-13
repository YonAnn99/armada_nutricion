/** Una llamada a un tercero nunca debe colgar la función: falla rápido. */
export function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}
