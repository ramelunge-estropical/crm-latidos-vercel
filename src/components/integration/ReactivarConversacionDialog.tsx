// Diálogo para reactivar/crear una conversación en Bandeja desde una gestión.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Phone, Mail, RefreshCw, Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  gestionId: string;
  clienteId?: string | null;
  clienteNombre?: string | null;
  onDone?: (conversacionId: string) => void;
}

const canalIcon = { whatsapp: MessageSquare, phone: Phone, email: Mail } as const;

export function ReactivarConversacionDialog({
  open, onOpenChange, gestionId, clienteId, clienteNombre, onDone,
}: Props) {
  const queryClient = useQueryClient();

  const [canal, setCanal] = useState<"whatsapp" | "phone" | "email">("whatsapp");
  const [asunto, setAsunto] = useState("");
  const [motivo, setMotivo] = useState<"seguimiento" | "callback" | "mensaje" | "documento" | "negociacion" | "cierre">("seguimiento");
  const [busy, setBusy] = useState(false);

  // Conversaciones existentes del cliente para reactivar
  const { data: existentes = [] } = useQuery({
    queryKey: ["lat-conv-cliente", clienteId],
    queryFn: async () => {
      if (!clienteId) return [];
      const { data } = await supabase
        .from("lat_conversaciones")
        .select("id, canal, asunto, estado, ultima_interaccion, gestion_id")
        .eq("cliente_id", clienteId)
        .order("ultima_interaccion", { ascending: false })
        .limit(15);
      return data || [];
    },
    enabled: open && !!clienteId,
  });

  async function reactivar(conv: any) {
    setBusy(true);
    try {
      await (supabase as any)
        .from("lat_conversaciones")
        .update({ gestion_id: gestionId, estado: "en_seguimiento", proxima_accion: motivo })
        .eq("id", conv.id);
      await (supabase as any).from("gestion_conversation_events").insert({
        gestion_id: gestionId,
        conversacion_id: conv.id,
        event_type: "conv_reactivated",
        event_data: { motivo, canal: conv.canal },
      });
      toast.success("Conversación reactivada en Bandeja");
      queryClient.invalidateQueries({ queryKey: ["lat_conversaciones"] });
      queryClient.invalidateQueries({ queryKey: ["gestion-conv-events", gestionId] });
      onDone?.(conv.id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function crearNueva() {
    if (!asunto.trim()) return toast.error("Falta el asunto");
    setBusy(true);
    try {
      const { data, error } = await (supabase as any)
        .from("lat_conversaciones")
        .insert({
          canal,
          asunto: asunto.trim(),
          cliente_id: clienteId || null,
          cliente_nombre: clienteNombre || null,
          gestion_id: gestionId,
          estado: "nuevo",
          proxima_accion: motivo,
        })
        .select()
        .single();
      if (error) throw error;

      await (supabase as any).from("gestion_conversation_events").insert({
        gestion_id: gestionId,
        conversacion_id: data.id,
        event_type: "gestion_created_for_conv",
        event_data: { motivo, canal },
      });
      toast.success("Conversación creada en Bandeja");
      queryClient.invalidateQueries({ queryKey: ["lat_conversaciones"] });
      queryClient.invalidateQueries({ queryKey: ["gestion-conv-events", gestionId] });
      onDone?.(data.id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="w-4 h-4" /> Reactivar / crear comunicación
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Motivo</Label>
              <Select value={motivo} onValueChange={(v) => setMotivo(v as any)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seguimiento">Seguimiento</SelectItem>
                  <SelectItem value="callback">Devolución de llamada</SelectItem>
                  <SelectItem value="mensaje">Envío de mensaje</SelectItem>
                  <SelectItem value="documento">Solicitud de documento</SelectItem>
                  <SelectItem value="negociacion">Retomar negociación</SelectItem>
                  <SelectItem value="cierre">Confirmar cierre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Canal (para nueva)</Label>
              <Select value={canal} onValueChange={(v) => setCanal(v as any)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="phone">Llamada</SelectItem>
                  <SelectItem value="email">Correo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {existentes.length > 0 && (
            <div>
              <Label className="text-xs mb-1.5 block">Reactivar conversación existente</Label>
              <div className="border border-border rounded-md divide-y divide-border max-h-40 overflow-y-auto">
                {existentes.map((c: any) => {
                  const Icon = canalIcon[c.canal as keyof typeof canalIcon] || MessageSquare;
                  return (
                    <button
                      key={c.id}
                      onClick={() => reactivar(c)}
                      disabled={busy}
                      className="w-full text-left px-3 py-2 hover:bg-accent/50 flex items-center gap-2 text-sm disabled:opacity-50"
                    >
                      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium">{c.asunto || "(sin asunto)"}</p>
                        <p className="text-[10px] text-muted-foreground">{c.estado}</p>
                      </div>
                      {c.gestion_id && c.gestion_id !== gestionId && (
                        <Badge variant="outline" className="text-[9px]">Otra gestión</Badge>
                      )}
                      <RefreshCw className="w-3 h-3 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-border pt-3">
            <Label className="text-xs mb-1.5 block">Crear nueva conversación</Label>
            <div className="flex gap-2">
              <Input
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Asunto de la conversación"
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={crearNueva} disabled={busy || !asunto.trim()}>
                {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                Crear
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
