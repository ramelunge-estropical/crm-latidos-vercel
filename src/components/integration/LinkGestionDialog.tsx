// Diálogo para crear o vincular una gestión desde una conversación de Bandeja.
// No modifica la UI del panel: se abre desde el menú contextual (3 puntos) del header.
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Search, Loader2, Plus, Link2 } from "lucide-react";
import { toast } from "sonner";

type Operation = "summarize" | "suggest";

interface ConversationLite {
  id: string;
  canal?: string;
  cliente_id?: string | null;
  cliente_nombre?: string | null;
  asunto?: string | null;
  ultimo_mensaje?: string | null;
  responsable_id?: string | null;
  responsable_nombre?: string | null;
  // Permite también pasar la conversación-mock de Bandeja (sin DB).
  __mock?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conversation: ConversationLite;
  onLinked?: (gestionId: string) => void;
}

export function LinkGestionDialog({ open, onOpenChange, conversation, onLinked }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"crear" | "vincular">("crear");

  // ── Crear nueva gestión ──────────────────────────────────────────
  const [title, setTitle] = useState(conversation.asunto || "");
  const [type, setType] = useState<"comercial" | "proyecto" | "operativa" | "caso">("comercial");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [processId, setProcessId] = useState<string>("");
  const [stageId, setStageId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [aiBusy, setAiBusy] = useState<Operation | null>(null);
  const [creating, setCreating] = useState(false);

  // ── Vincular existente ───────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState(false);

  const { data: processes = [] } = useQuery({
    queryKey: ["processes-link"],
    queryFn: async () => {
      const { data } = await supabase.from("processes").select("id, name").order("name");
      return data || [];
    },
    enabled: open,
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["stages-link", processId],
    queryFn: async () => {
      if (!processId) return [];
      const { data } = await supabase
        .from("pipeline_stages")
        .select("id, name, order")
        .eq("process_id", processId)
        .order("order");
      return data || [];
    },
    enabled: !!processId,
  });

  const { data: gestiones = [] } = useQuery({
    queryKey: ["gestiones-link-search", search],
    queryFn: async () => {
      let q = supabase
        .from("gestiones")
        .select("id, codigo, title, type, cliente_nombre")
        .order("created_at", { ascending: false })
        .limit(40);
      if (search.trim()) q = q.or(`title.ilike.%${search}%,codigo.ilike.%${search}%,cliente_nombre.ilike.%${search}%`);
      const { data } = await q;
      return data || [];
    },
    enabled: open && tab === "vincular",
  });

  const firstStageId = useMemo(() => stages[0]?.id || "", [stages]);

  // ── IA helpers ───────────────────────────────────────────────────
  async function runAI(op: Operation) {
    setAiBusy(op);
    try {
      const { data, error } = await supabase.functions.invoke("gestion-link-ai", {
        body: {
          operation: op,
          conversation: {
            canal: conversation.canal,
            asunto: conversation.asunto,
            cliente_nombre: conversation.cliente_nombre,
            ultimo_mensaje: conversation.ultimo_mensaje,
          },
        },
      });
      if (error) throw error;
      const r = (data as any)?.result || {};
      if (op === "summarize") {
        const txt = [r.resumen, r.siguiente_paso ? `Siguiente paso: ${r.siguiente_paso}` : ""].filter(Boolean).join("\n\n");
        if (txt) setDescription(txt);
        toast.success("Resumen generado");
      } else if (op === "suggest") {
        if (r.titulo_sugerido) setTitle(r.titulo_sugerido);
        if (r.tipo) setType(r.tipo);
        if (r.prioridad) setPriority(r.prioridad);
        toast.success("Sugerencias aplicadas");
      }
    } catch (e: any) {
      toast.error(e.message || "Error con IA");
    } finally {
      setAiBusy(null);
    }
  }

  // ── Acciones ─────────────────────────────────────────────────────
  async function handleCreate() {
    if (!title.trim()) return toast.error("Falta el título");
    if (!processId) return toast.error("Elegí un proceso");
    const stage = stageId || firstStageId;
    if (!stage) return toast.error("El proceso no tiene etapas");

    setCreating(true);
    try {
      const { data: g, error } = await (supabase as any)
        .from("gestiones")
        .insert({
          title: title.trim(),
          type,
          priority,
          process_id: processId,
          stage_id: stage,
          description: description || null,
          cliente_id: conversation.cliente_id || null,
          cliente_nombre: conversation.cliente_nombre || null,
          responsable_id: conversation.responsable_id || null,
          responsable_nombre: conversation.responsable_nombre || null,
          conversacion_id_origen: conversation.__mock ? null : conversation.id,
          canal_origen: conversation.canal || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Vincular conversación (solo si es de DB)
      if (!conversation.__mock) {
        await (supabase as any)
          .from("lat_conversaciones")
          .update({ gestion_id: g.id })
          .eq("id", conversation.id);
      }

      // Evento de auditoría
      await (supabase as any).from("gestion_conversation_events").insert({
        gestion_id: g.id,
        conversacion_id: conversation.__mock ? null : conversation.id,
        event_type: "gestion_created_from_conv",
        event_data: { canal: conversation.canal, asunto: conversation.asunto, mock: !!conversation.__mock },
      });

      toast.success(`Gestión ${g.codigo || ""} creada y vinculada`);
      queryClient.invalidateQueries({ queryKey: ["gestiones"] });
      queryClient.invalidateQueries({ queryKey: ["lat_conversaciones"] });
      onLinked?.(g.id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "No se pudo crear la gestión");
    } finally {
      setCreating(false);
    }
  }

  async function handleLink(gestionId: string) {
    setLinking(true);
    try {
      if (!conversation.__mock) {
        const { error } = await (supabase as any)
          .from("lat_conversaciones")
          .update({ gestion_id: gestionId })
          .eq("id", conversation.id);
        if (error) throw error;
      }
      await (supabase as any).from("gestion_conversation_events").insert({
        gestion_id: gestionId,
        conversacion_id: conversation.__mock ? null : conversation.id,
        event_type: "conv_linked",
        event_data: { canal: conversation.canal, asunto: conversation.asunto, mock: !!conversation.__mock },
      });
      toast.success("Conversación vinculada");
      queryClient.invalidateQueries({ queryKey: ["lat_conversaciones"] });
      onLinked?.(gestionId);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "No se pudo vincular");
    } finally {
      setLinking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4" /> Vincular conversación a gestión
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="crear" className="text-xs gap-1"><Plus className="w-3 h-3" />Crear nueva</TabsTrigger>
            <TabsTrigger value="vincular" className="text-xs gap-1"><Link2 className="w-3 h-3" />Vincular existente</TabsTrigger>
          </TabsList>

          <TabsContent value="crear" className="space-y-3 mt-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => runAI("summarize")} disabled={!!aiBusy}>
                {aiBusy === "summarize" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                Resumir conversación
              </Button>
              <Button size="sm" variant="outline" onClick={() => runAI("suggest")} disabled={!!aiBusy}>
                {aiBusy === "suggest" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                Sugerir tipo y prioridad
              </Button>
            </div>

            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Título</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={type} onValueChange={(v) => setType(v as any)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comercial">Comercial</SelectItem>
                      <SelectItem value="proyecto">Proyecto</SelectItem>
                      <SelectItem value="operativa">Operativa</SelectItem>
                      <SelectItem value="caso">Caso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Prioridad</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baja</SelectItem>
                      <SelectItem value="medium">Media</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Proceso</Label>
                  <Select value={processId} onValueChange={setProcessId}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Elegir proceso" /></SelectTrigger>
                    <SelectContent>
                      {processes.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Etapa inicial</Label>
                  <Select value={stageId || firstStageId} onValueChange={setStageId} disabled={!processId}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Etapa" /></SelectTrigger>
                    <SelectContent>
                      {stages.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Resumen / contexto</Label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Resumen del caso, próximo paso, etc."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                Crear y vincular
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="vincular" className="space-y-3 mt-4">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título, código o cliente..."
                className="h-8 text-sm pl-8"
              />
            </div>
            <div className="max-h-80 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {gestiones.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Sin resultados</p>
              )}
              {gestiones.map((g: any) => (
                <button
                  key={g.id}
                  onClick={() => handleLink(g.id)}
                  disabled={linking}
                  className="w-full text-left px-3 py-2 hover:bg-accent/50 flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <Badge variant="outline" className="text-[9px] font-mono">{g.codigo || "—"}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{g.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {g.type} {g.cliente_nombre ? `· ${g.cliente_nombre}` : ""}
                    </p>
                  </div>
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
