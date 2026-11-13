import type { Metadata } from "next";
import { Suspense } from "react";
import { PanelAdmin } from "@/features/admin/components/panel-admin";
import { exigirAdmin } from "@/lib/supabase/sesion";

export const metadata: Metadata = { title: "Panel admin" };

export default async function AdminPage() {
  const perfil = await exigirAdmin();
  return (
    <Suspense>
      <PanelAdmin miUserId={perfil.user_id} />
    </Suspense>
  );
}
