import { supabase } from "@/integrations/supabase/client";

export async function setColaboradorPresence(
  colaboradorId: string | null | undefined,
  conectado: boolean,
) {
  if (!colaboradorId) return;

  const payload = conectado
    ? {
        colaborador_id: colaboradorId,
        conectado: true,
        estado: "disponible",
        ultima_actividad: new Date().toISOString(),
      }
    : {
        colaborador_id: colaboradorId,
        conectado: false,
        estado: "desconectado",
        ultima_actividad: new Date().toISOString(),
      };

  await (supabase as any)
    .from("colaborador_presencia")
    .upsert(payload, { onConflict: "colaborador_id" });
}
