import type { Metadata } from "next";
import { Validador } from "@/features/caja/components/validador";

export const metadata: Metadata = { title: "Validador de caja" };

export default function CajaPage() {
  return <Validador />;
}
