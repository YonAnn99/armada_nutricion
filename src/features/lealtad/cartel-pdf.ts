/**
 * Cartel imprimible (tamaño carta) del registro con QR (Symvora 121), con la
 * marca Armada: negro y morado, logo oficial, beneficios y el QR grande.
 * jsPDF y qrcode se cargan con `import()` al descargar.
 */
export interface DatosCartel {
  url: string;
  puntosBienvenida: number;
  nombrePuntos: string;
  /** Líneas de beneficio ya armadas ("5% de cashback en cada compra"...). */
  beneficios: string[];
}

const ANCHO = 215.9;
const ALTO = 279.4;
const CENTRO = ANCHO / 2;
const MORADO: [number, number, number] = [124, 58, 237];
const NEGRO: [number, number, number] = [7, 6, 11];
const LOGO = "/marca/logo-armada.png";

/** El logo como data URL para jsPDF; `null` si no carga (el cartel sale con el nombre en texto). */
async function imagenComoDataUrl(url: string): Promise<{ datos: string; ancho: number; alto: number } | null> {
  try {
    const img = new Image();
    await new Promise<void>((ok, falla) => {
      img.onload = () => ok();
      img.onerror = () => falla(new Error("logo"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    return { datos: canvas.toDataURL("image/png"), ancho: canvas.width, alto: canvas.height };
  } catch {
    return null;
  }
}

export async function generarCartel(datos: DatosCartel): Promise<Blob> {
  const [{ jsPDF }, { default: QRCode }] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF({ unit: "mm", format: "letter" });

  doc.setFillColor(...NEGRO);
  doc.rect(0, 0, ANCHO, ALTO, "F");
  doc.setFillColor(...MORADO);
  doc.rect(0, 0, ANCHO, 6, "F");
  doc.rect(0, ALTO - 6, ANCHO, 6, "F");

  // Logo oficial (isotipo, nombre y "Fuerza para tu vida").
  let y = 18;
  const logo = await imagenComoDataUrl(LOGO);
  if (logo) {
    const ancho = 96;
    const alto = (ancho * logo.alto) / logo.ancho;
    doc.addImage(logo.datos, "PNG", CENTRO - ancho / 2, y, ancho, alto);
    y += alto + 14;
  } else {
    // Sin red para el logo: el nombre en texto.
    y += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(255);
    doc.text("ARMADA NUTRITION", CENTRO, y, { align: "center" });
    y += 16;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(255);
  doc.text("¡OBTÉN TU ARMADA PASS!", CENTRO, y, { align: "center" });
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(216, 180, 254);
  const sub =
    datos.puntosBienvenida > 0
      ? `Regístrate en 15 segundos y recibe +$${datos.puntosBienvenida} en ${datos.nombrePuntos}`
      : "Regístrate en 15 segundos, gratis";
  doc.text(doc.splitTextToSize(sub, 180), CENTRO, y, { align: "center" });
  y += 12;

  const qr = await QRCode.toDataURL(datos.url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 1200,
    color: { dark: "#07060B", light: "#FFFFFF" },
  });
  const lado = 92;
  doc.setFillColor(...MORADO);
  doc.roundedRect(CENTRO - lado / 2 - 5, y - 5, lado + 10, lado + 10, 5, 5, "F");
  doc.addImage(qr, "PNG", CENTRO - lado / 2, y, lado, lado);
  y += lado + 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255);
  for (const b of datos.beneficios.slice(0, 5)) {
    doc.setFillColor(...MORADO);
    doc.circle(40, y - 1.3, 1.6, "F");
    doc.text(doc.splitTextToSize(b, 140), 46, y);
    y += 8;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(161, 161, 181);
  doc.text("Escanea con la cámara de tu celular · Sin crear cuenta y sin descargar apps", CENTRO, ALTO - 16, {
    align: "center",
  });

  return doc.output("blob");
}

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  // Se libera después: revocarlo en el acto cancela la descarga en Firefox.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
