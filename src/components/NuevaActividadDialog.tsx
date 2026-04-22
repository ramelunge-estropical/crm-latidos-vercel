import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useColaboradores } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Users, CheckSquare, Calendar, Clock, X, Search, Video } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const SUPABASE_URL = "https://qadfjbgfdejmhblgvaef.supabase.co";

interface NuevaActividadDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: Date;
  gestionId?: string;
  gestionTitle?: string;
}

const TYPE_CONFIG = {
  tarea:   { label: "Tarea",   icon: CheckSquare, color: "text-blue-600"    },
  llamada: { label: "Llamada", icon: Phone,        color: "text-green-600"  },
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
      body: JSON.stringify({ action: "create", colaboradorId, activity, attendeeEmails }),
    });
    return await res.json();
  } catch {
    return null;
  }
}

// Searchable collaborator picker that shows chips for selected items
function ColaboradorSearch({
  colaboradores,
  selected,
  onAdd,
  onRemove,
  placeholder = "Buscar colaborador...",
  exclude = [],
}: {
  colaboradores: { id: string; nombre: string; color: string }[];
  selected: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  placeholder?: string;
  exclude?: string[];
}) {
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = colaboradores.filter(c =>
    !selected.includes(c.id) &&
    !exclude.includes(c.id) &&
    c.nombre.toLowerCase().includes(query.toLowerCase())
  );

  const selectedColabs = colaboradores.filter(c => selected.includes(c.id));

  return (
    <div ref={ref} className="space-y-2">
      {/* Chips */}
      {selectedColabs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedColabs.map(c => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
            >
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                style={{ backgroundColor: c.color }}
              >
                {c.nombre.charAt(0)}
              </span>
              {c.nombre}
              <button onClick={() => onRemove(c.id)} className="hover:text-destructive transition-colors ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-8 h-9 text-sm"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-md max-h-48 overflow-y-auto">
            {filtered.map(c => (
              <button
                key={c.id}
                onMouseDown={e => { e.preventDefault(); onAdd(c.id); setQuery(""); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: c.color }}
                >
                  {c.nombre.charAt(0)}
                </span>
                <span>{c.nombre}</span>
              </button>
            ))}
          </div>
        )}
        {open && query.length > 0 && filtered.length === 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-md px-3 py-2 text-xs text-muted-foreground">
            Sin resultados
          </div>
        )}
      </div>
    </div>
  );
}

export function NuevaActividadDialog({
  open, onOpenChange, defaultDate, gestionId, gestionTitle,
}: NuevaActividadDialogProps) {
  const queryClient  = useQueryClient();
  const { data: colaboradores = [] } = useColaboradores();
  const colaboradorId = localStorage.getItem("mis_gestiones_colaborador") || "";

  const [type,          setType]          = useState<"tarea" | "llamada" | "reunión">("reunión");
  const [title,         setTitle]         = useState("");
  const [description,   setDescription]   = useState("");
  const [date,          setDate]          = useState(
    defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
  );
  const [time,          setTime]          = useState("09:00");
  const [duration,      setDuration]      = useState("30");
  const [responsableId, setResponsableId] = useState(colaboradorId);
  const [attendees,     setAttendees]     = useState<string[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [meetLink,      setMeetLink]      = useState<string | null>(null);

  const reset = () => {
    setType("reunión"); setTitle(""); setDescription("");
    setDate(format(new Date(), "yyyy-MM-dd")); setTime("09:00");
    setDuration("30"); setResponsableId(colaboradorId); setAttendees([]); setMeetLink(null);
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

      const attendeeColabs = colaboradores.filter(c => attendees.includes(c.id));
      const attendeeEmails = attendeeColabs.map(c => c.email).filter(Boolean) as string[];

      const syncResult = await syncToGoogleCalendar(responsableId, {
        id:               inserted.id,
        activity_type:    type,
        title:            title.trim(),
        description:      description.trim() || (gestionTitle ? `Gestión: ${gestionTitle}` : ""),
        scheduled_at:     scheduledAt,
        duration_minutes: parseInt(duration) || 30,
      }, attendeeEmails);

      queryClient.invalidateQueries({ queryKey: ["agenda-activities"] });
      queryClient.invalidateQueries({ queryKey: ["activities", gestionId] });

      if (syncResult?.ok) {
        if (syncResult.meetLink) {
          setMeetLink(syncResult.meetLink);
          toast.success("Reunión creada con link de Google Meet");
        } else {
          toast.success(`Actividad creada y sincronizada${attendeeEmails.length ? ` · ${attendeeEmails.length} invitado(s)` : ""}`);
          reset();
          onOpenChange(false);
        }
      } else {
        toast.success("Actividad creada");
        if (responsableId) toast.info("Conectá Google Calendar para sincronizar automáticamente");
        reset();
        onOpenChange(false);
      }
    } catch {
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

          {/* Asistentes (solo reuniones) */}
          {type === "reunión" && (
            <div>
              <label className="text-xs text-muted-foreground mb-2 block flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Asistentes
                <span className="text-[10px] text-muted-foreground/70">(reciben invite de Google Calendar)</span>
              </label>
              <ColaboradorSearch
                colaboradores={colaboradores}
                selected={attendees}
                onAdd={id => setAttendees(prev => [...prev, id])}
                onRemove={id => setAttendees(prev => prev.filter(a => a !== id))}
                placeholder="Buscar por nombre..."
                exclude={responsableId ? [responsableId] : []}
              />
            </div>
          )}
        </div>

        {/* Meet link — shown after successful creation */}
        {meetLink && (
          <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3">
            <Video className="w-4 h-4 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-800 dark:text-green-300">Link de Google Meet generado</p>
              <a
                href={meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-700 dark:text-green-400 underline truncate block"
              >
                {meetLink}
              </a>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(meetLink); toast.success("Link copiado"); }}
              className="text-xs text-green-700 dark:text-green-400 hover:text-green-900 font-medium shrink-0"
            >
              Copiar
            </button>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          {meetLink ? (
            <Button size="sm" onClick={() => { reset(); onOpenChange(false); }}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={loading || !title.trim()}>
                {loading ? "Guardando..." : "Crear actividad"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
