import { useState, useEffect, useRef, useCallback } from "react";
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
    };
    if (draft?.id) {
      await (supabase as any).from("email_drafts").update(payload).eq("id", draft.id);
    } else {
      await (supabase as any).from("email_drafts").insert(payload);
    }
    qc.invalidateQueries({ queryKey: ["email_draft", conversacionId] });
  }, [conversacionId, draft?.id, qc]);

  const saveDebounced = useCallback((d: Partial<EmailDraft>) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => save(d), 1200);
  }, [save]);

  const cancelSave = useCallback(() => {
    if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
  }, []);

  const remove = useCallback(async () => {
    if (!draft?.id) return;
    await (supabase as any).from("email_drafts").delete().eq("id", draft.id);
    qc.invalidateQueries({ queryKey: ["email_draft", conversacionId] });
  }, [draft?.id, qc, conversacionId]);

  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  return { draft, save, saveDebounced, cancelSave, remove };
}
