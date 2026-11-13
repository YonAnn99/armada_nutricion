import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Armada Pass", template: "%s · Armada Nutrition" },
  description: "Armada Nutrition · Fuerza para tu vida. Programa de lealtad y pase digital.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#050507",
  colorScheme: "dark",
  // Deja dibujar bajo el notch; los botones fijos usan `pb-seguro` (safe-area).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`dark ${inter.variable} ${montserrat.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-center" theme="dark" richColors />
      </body>
    </html>
  );
}
