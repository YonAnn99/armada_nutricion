/* eslint-disable @next/next/no-img-element -- logos estáticos pequeños de /public, también en páginas del servidor */
import { cn } from "@/lib/utils";

/**
 * Logo oficial de Armada Nutrition (isotipo "AV" y nombre), en `public/marca/`.
 * - `horizontal` (por defecto): isotipo + nombre, para encabezados.
 * - `compacta`: solo el isotipo (celular).
 * - `completa`: el logo con "Fuerza para tu vida", para portadas (login, registro, pase).
 */
export function Marca({
  className,
  compacta = false,
  completa = false,
}: {
  className?: string;
  compacta?: boolean;
  completa?: boolean;
}) {
  if (completa) {
    return (
      <img
        src="/marca/logo-armada.png"
        alt="Armada Nutrition · Fuerza para tu vida"
        width={860}
        height={380}
        className={cn("h-auto w-56", className)}
      />
    );
  }
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img src="/marca/isotipo.png" alt={compacta ? "Armada Nutrition" : ""} width={271} height={219} className="h-8 w-auto" />
      {!compacta && (
        <img src="/marca/wordmark.png" alt="Armada Nutrition" width={824} height={66} className="h-3.5 w-auto" />
      )}
    </div>
  );
}
