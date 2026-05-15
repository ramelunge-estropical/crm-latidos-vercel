import { useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EmailDraft {
  id?: string;
  conversacion_id: string;
  reply_type: "reply" | "reply_all" | "forward" | "new";
  in_reply_to_message_id?: string | null;
  email_to: string[];
  email_cc: string[];
  email_bcc: string[];
  subject: string;
  body_html: string;
  body_text?: string;
  attachments: any[];
  created_by?: string;
}

export function useEmailDraft(conversacionId: string | null) {
  const qc = useQueryClient();

  const { data: draft } = useQuery<EmailDraft | null>({
    queryKey: ["email_draft", conversacionId],
    enabled: !!conversacionId,
    queryFn: async () => {
      if (!conversacionId) return null;
      // Limpia duplicados: solo conserva el más reciente
      const { data: rows } = await (supabase as any)
        .from("email_drafts")
        .select("id, updated_at")
        .eq("conversacion_id", conversacionId)
        .order("updated_at", { ascending: false });

      if (rows && rows.length > 1) {
        const toDelete = rows.slice(1).map((r: any) => r.id);
        await (supabase as any).from("email_drafts").delete().in("id", toDelete);
      }

      const { data, error } = await (supabase as any)
        .from("email_drafts")
        .select("*")
        .eq("conversacion_id", conversacionId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    staleTime: 5_000,
  });

  const saveTimer = useRef<number | null>(null);

  const save = useCallback(async (d: Partial<EmailDraft>) => {
    if (!conversacionId) return;
    const payload = {
      conversacion_id: conversacionId,
      reply_type: d.reply_type ?? "reply",
      in_reply_to_message_id: d.in_reply_to_message_id ?? null,
      email_to: d.email_to ?? [],
      email_cc: d.email_cc ?? [],
      email_bcc: d.email_bcc ?? [],
      subject: d.subject ?? "",
      body_html: d.body_html ?? "",
      body_text: d.body_text ?? null,
      attachments: d.attachments ?? [],
      created_by: d.created_by ?? null,
      updated_at: new Date().toISOString(),
    };

    // Siempre buscar el draft existente para evitar insertar duplicados
    const { data: existing } = await (supabase as any)
      .from("email_drafts")
      .select("id")
      .eq("conversacion_id", conversacionId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await (supabase as any).from("email_drafts").update(payload).eq("id", existing.id);
    } else {
      await (supabase as any).from("email_drafts").insert(payload);
    }
    qc.invalidateQueries({ queryKey: ["email_draft", conversacionId] });
  }, [conversacionId, qc]);

  const saveDebounced = useCallback((d: Partial<EmailDraft>) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => save(d), 1200);
  }, [save]);

  const cancelSave = useCallback(() => {
    if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
  }, []);

  // Borra TODOS los borradores de esta conversación (evita que queden huérfanos)
  const remove = useCallback(async () => {
    if (!conversacionId) return;
    await (supabase as any).from("email_drafts").delete().eq("conversacion_id", conversacionId);
    qc.invalidateQueries({ queryKey: ["email_draft", conversacionId] });
  }, [conversacionId, qc]);

  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  return { draft, save, saveDebounced, cancelSave, remove };
}
