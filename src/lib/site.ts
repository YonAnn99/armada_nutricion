/**
 * URL pública del sistema (la que llevan los QR y los enlaces de WhatsApp).
 * En producción: NEXT_PUBLIC_APP_URL=https://pase.armadanutrition.com
 */
export function getAppUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
