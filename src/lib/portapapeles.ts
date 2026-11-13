import { toast } from "sonner";

export async function copiar(texto: string, aviso = "Copiado") {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("No se pudo copiar. Mantén presionado el texto para copiarlo.");
  }
}
