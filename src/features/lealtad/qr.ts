/**
 * QR del pase como SVG (servidor y navegador). Lleva la URL pública del pase:
 * con la cámara del celular abre la tarjeta y el escáner de caja extrae el
 * código de esa URL (`codigoDesdeEscaneo`).
 */
import QRCode from "qrcode";

export function qrSvg(texto: string): Promise<string> {
  return QRCode.toString(texto, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#07060B", light: "#FFFFFF" },
  });
}
