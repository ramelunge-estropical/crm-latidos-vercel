import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useColaboradores } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Users, CheckSquare, Calendar, Clock, X, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const SUPABASE_URL = "https://qadfjbgfdejmhblgvaef.supabase.co";
const SUPABASE_ANON_KEY = (supabase as any).supabaseKey || "";

interface NuevaActividadDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: Date;
  gestionId?: string;
  gestionTitle?: string;
}

const TYPE_CONFIG = {
  tarea:   { label: "Tarea",   icon: CheckSquare, color: "text-blue-600"   },
  llamada: { label: "Llamada", icon: Phone,        color: "text-green-600" },
  reunión: { label: "Reunión", icon: Users,        color: "text-violet-600" },
};

async function syncToGoogleCalendar(colaboradorId: string, activity: any, attendeeEmails: string[]) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${(supabase as any).supabaseKey}`,
      },
      body: JSON.stringify({
        action: "create",
        colaboradorId,
        activity,
        attendeeEmails,
      }),
    });
    return await res.json();
  } catch {
    return null;
  }
}

export function NuevaActividadDialog({
  open, onOpenChange, defaultDate, gestionId, gestionTitle,
}: NuevaActividadDialogProps) {
  const queryClient = useQueryClient();
  const { data: colaboradores = [] } = useColaboradores();

  const colaboradorId = localStorage.getItem("mis_gestiones_colaborador") || "";

  const [type,        setType]        = useState<"tarea" | "llamada" | "reunión">("reunión");
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [date,        setDate]        = useState(
    defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
  );
  const [time,        setTime]        = useState("09:00");
  const [duration,    setDuration]    = useState("30");
  const [responsableId, setResponsableId] = useState(colaboradorId);
  const [attendees,   setAttendees]   = useState<string[]>([]);
  const [loading,     setLoading]     = useState(false);

  const toggleAttendee = (id: string) => {
    setAttendees(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const reset = () => {
    setType("reunión"); setTitle(""); setDescription("");
    setDate(format(new Date(), "yyyy-MM-dd")); setTime("09:00");
    setDuration("30"); setResponsableId(colaboradorId); setAttendees([]);
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("El título es requerido"); return; }
    setLoading(true);
    try {
      const [h, m] = time.split(":").map(Number);
      const dt = new Date(`${date}T00:00:00`);
      dt.setHours(h, m, 0, 0);
      const scheduledAt = dt.toISOString();

      const responsable = colaboradores.find(c => c.id === responsableId);

      const { data: inserted, error } = await supabase.from("activities").insert({
        gestion_id:       gestionId || null,
        activity_type:    type,
        title:            title.trim(),
        description:      description.trim() || null,
        scheduled_at:     scheduledAt,
        duration_minutes: duration ? parseInt(duration) : 30,
        assigned_to:      responsable?.nombre || null,
      }).select().single();

      if (error) throw error;

      // Sync to Google Calendar of responsable
      const attendeeColabs = colaboradores.filter(c => attendees.includes(c.id));
      const attendeeEmails = attendeeColabs.map(c => c.email).filter(Boolean) as string[];

      const syncResult = await syncToGoogleCalendar(responsableId, {
        id:               inserted.id,
        title:            title.trim(),
        description:      description.trim() || (gestionTitle ? `Gestión: ${gestionTitle}` : ""),
        scheduled_at:     scheduledAt,
        duration_minutes: parseInt(duration) || 30,
      }, attendeeEmails);

      if (syncResult?.ok) {
        toast.success(`Actividad creada y sincronizada con Google Calendar${attendeeEmails.length ? ` · ${attendeeEmails.length} invitado(s)` : ""}`);
      } else {
        toast.success("Actividad creada");
        if (responsableId) toast.info("Conectá Google Calendar para sincronizar automáticamente");
      }

      queryClient.invalidateQueries({ queryKey: ["agenda-activities"] });
      queryClient.invalidateQueries({ queryKey: ["activities", gestionId] });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error("Error al crear la actividad");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4 text-primary" />
            Nueva actividad
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Tipo */}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(TYPE_CONFIG) as Array<keyof typeof TYPE_CONFIG>).map(t => {
              const { label, icon: Icon, color } = TYPE_CONFIG[t];
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                    type === t
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${type === t ? "text-primary" : color}`} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Título */}
          <Input
            placeholder="Título *"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          {/* Descripción */}
          <Textarea
            placeholder="Descripción (opcional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="resize-none h-20 text-sm"
          />

          {gestionTitle && (
            <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
              Gestión: <span className="font-medium text-foreground">{gestionTitle}</span>
            </div>
          )}

          {/* Fecha y hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Fecha</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Hora</label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>

          {/* Duración y responsable */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                <Clock className="w-3 h-3" /> Duración (min)
              </label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["15","30","45","60","90","120"].map(d => (
                    <SelectItem key={d} value={d}>{d} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Responsable</label>
              <Select value={responsableId} onValueChange={setResponsableId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Asistentes (solo para reuniones) */}
          {type === "reunión" && (
            <div>
              <label className="text-xs text-muted-foreground mb-2 block flex items-center gap-1">
                <Users className="w-3 h-3" /> Asistentes
                <span className="text-[10px]">(reciben invite de Google Calendar)</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                {colaboradores
                  .filter(c => c.id !== responsableId)
                  .map(c => {
                    const selected = attendees.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleAttendee(c.id)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all text-left ${
                          selected
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: c.color }}
                        >
                          {c.nombre.charAt(0)}
                        </div>
                        <span className="truncate flex-1">{c.nombre}</span>
                        {selected && <Check className="w-3 h-3 shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loading || !title.trim()}>
            {loading ? "Guardando..." : "Crear actividad"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
