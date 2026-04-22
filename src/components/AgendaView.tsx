import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useColaboradores } from "@/hooks/useSharedQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft, ChevronRight, Phone, Users, CheckSquare, Clock,
  CalendarDays, CalendarCheck, Unlink, Plus, Video, Pencil, Check, X, Search, UserRound,
} from "lucide-react";
import { NuevaActividadDialog } from "./NuevaActividadDialog";
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const SUPABASE_URL    = "https://qadfjbgfdejmhblgvaef.supabase.co";
const GOOGLE_CLIENT_ID   = "894714399449-tqn21sgssiispg8roqj4s5qicmqtv6t1.apps.googleusercontent.com";
const GOOGLE_REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-auth-callback`;
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const TYPE_CONFIG = {
  tarea:   { label: "Tarea",   icon: CheckSquare, badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",   border: "border-l-blue-400",   dot: "bg-blue-400"   },
  llamada: { label: "Llamada", icon: Phone,        badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", border: "border-l-green-400",  dot: "bg-green-400"  },
  reunión: { label: "Reunión", icon: Users,        badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300", border: "border-l-violet-400", dot: "bg-violet-400" },
};

// ── Cliente search ────────────────────────────────────────────────────────────
function useClienteSearch(q: string) {
  return useQuery({
    queryKey: ["clientes-search", q],
    queryFn: async () => {
      if (q.trim().length < 2) return [];
      const { data } = await (supabase as any)
        .from("clientes")
        .select("id, nombre_completo, telefono")
        .ilike("nombre_completo", `%${q}%`)
        .order("nombre_completo")
        .limit(10);
      return (data || []) as { id: string; nombre_completo: string; telefono: string | null }[];
    },
    enabled: q.trim().length >= 2,
  });
}

function ClienteSearch({
  value, onChange, required = false,
}: {
  value: { id: string; nombre: string } | null;
  onChange: (c: { id: string; nombre: string } | null) => void;
  required?: boolean;
}) {
  const [query, setQuery] = useState(value?.nombre || "");
  const [open,  setOpen]  = useState(false);
  const { data: results = [] } = useClienteSearch(query);

  useEffect(() => {
    if (!value) setQuery("");
    else setQuery(value.nombre);
  }, [value?.id]);

  return (
    <div className="relative">
      <UserRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={required ? "Buscar cliente *" : "Buscar cliente (opcional)"}
        className={`pl-8 h-9 text-sm ${required && !value ? "border-orange-400 focus-visible:ring-orange-400" : ""}`}
      />
      {value && (
        <button onClick={() => { onChange(null); setQuery(""); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-md max-h-40 overflow-y-auto">
          {results.map(c => (
            <button key={c.id} onMouseDown={e => { e.preventDefault(); onChange({ id: c.id, nombre: c.nombre_completo }); setQuery(c.nombre_completo); setOpen(false); }}
              className="w-full flex flex-col px-3 py-2 text-left hover:bg-accent transition-colors">
              <span className="text-sm font-medium">{c.nombre_completo}</span>
              {c.telefono && <span className="text-[11px] text-muted-foreground">{c.telefono}</span>}
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-md px-3 py-2 text-xs text-muted-foreground">
          Sin resultados
        </div>
      )}
    </div>
  );
}

// ── Searchable picker (same as NuevaActividadDialog) ─────────────────────────
function ColaboradorSearch({
  colaboradores, selected, onAdd, onRemove, placeholder = "Buscar...", exclude = [],
}: {
  colaboradores: { id: string; nombre: string; color: string }[];
  selected: string[]; onAdd: (id: string) => void; onRemove: (id: string) => void;
  placeholder?: string; exclude?: string[];
}) {
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);
  const ref = useState<HTMLDivElement | null>(null);

  const filtered = colaboradores.filter(c =>
    !selected.includes(c.id) && !exclude.includes(c.id) &&
    c.nombre.toLowerCase().includes(query.toLowerCase())
  );
  const selectedColabs = colaboradores.filter(c => selected.includes(c.id));

  return (
    <div className="space-y-2">
      {selectedColabs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedColabs.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ backgroundColor: c.color }}>
                {c.nombre.charAt(0)}
              </span>
              {c.nombre}
              <button onClick={() => onRemove(c.id)} className="hover:text-destructive transition-colors ml-0.5"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder} className="pl-8 h-9 text-sm" />
        {open && filtered.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-md max-h-40 overflow-y-auto">
            {filtered.map(c => (
              <button key={c.id} onMouseDown={e => { e.preventDefault(); onAdd(c.id); setQuery(""); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: c.color }}>
                  {c.nombre.charAt(0)}
                </span>
                {c.nombre}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────
function EditActividadDialog({ activity, open, onOpenChange, onSaved }: {
  activity: any; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const { data: colaboradores = [] } = useColaboradores();
  const colaboradorId = localStorage.getItem("mis_gestiones_colaborador") || "";

  const [type,          setType]          = useState<"tarea" | "llamada" | "reunión">(activity?.activity_type || "reunión");
  const [title,         setTitle]         = useState(activity?.title || "");
  const [description,   setDescription]   = useState(activity?.description || "");
  const [date,          setDate]          = useState(activity?.scheduled_at ? format(new Date(activity.scheduled_at), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
  const [time,          setTime]          = useState(activity?.scheduled_at ? format(new Date(activity.scheduled_at), "HH:mm") : format(new Date(), "HH:mm"));
  const [duration,      setDuration]      = useState(String(activity?.duration_minutes || 30));
  const [responsableId, setResponsableId] = useState(() => {
    if (!activity?.assigned_to) return colaboradorId;
    const found = colaboradores.find(c => c.nombre === activity.assigned_to);
    return found?.id || colaboradorId;
  });
  const [attendees,     setAttendees]     = useState<string[]>([]);
  const [cliente,       setCliente]       = useState<{ id: string; nombre: string } | null>(
    activity?.cliente_id ? { id: activity.cliente_id, nombre: activity.cliente_nombre || "" } : null
  );
  const [loading,       setLoading]       = useState(false);

  // sync when activity changes
  useEffect(() => {
    if (!activity) return;
    setType(activity.activity_type || "reunión");
    setTitle(activity.title || "");
    setDescription(activity.description || "");
    setDate(activity.scheduled_at ? format(new Date(activity.scheduled_at), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
    setTime(activity.scheduled_at ? format(new Date(activity.scheduled_at), "HH:mm") : format(new Date(), "HH:mm"));
    setDuration(String(activity.duration_minutes || 30));
    setCliente(activity.cliente_id ? { id: activity.cliente_id, nombre: activity.cliente_nombre || "" } : null);
  }, [activity?.id]);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("El título es requerido"); return; }
    setLoading(true);
    try {
      const [h, m] = time.split(":").map(Number);
      const dt = new Date(`${date}T00:00:00`);
      dt.setHours(h, m, 0, 0);

      const responsable = colaboradores.find(c => c.id === responsableId);

      if (type === "llamada" && !cliente) { toast.error("Seleccioná un cliente para la llamada"); setLoading(false); return; }

      const { error } = await (supabase as any).from("activities").update({
        activity_type:    type,
        title:            title.trim(),
        description:      description.trim() || null,
        scheduled_at:     dt.toISOString(),
        duration_minutes: parseInt(duration) || 30,
        assigned_to:      responsable?.nombre || null,
        cliente_id:       cliente?.id || null,
        cliente_nombre:   cliente?.nombre || null,
      }).eq("id", activity.id);

      if (error) throw error;
      toast.success("Actividad actualizada");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="w-4 h-4 text-primary" /> Editar actividad
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Tipo */}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(TYPE_CONFIG) as Array<keyof typeof TYPE_CONFIG>).map(t => {
              const { label, icon: Icon } = TYPE_CONFIG[t];
              return (
                <button key={t} onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                    type === t ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                  }`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              );
            })}
          </div>
          <Input placeholder="Título *" value={title} onChange={e => setTitle(e.target.value)} />
          <div>
            <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
              <UserRound className="w-3 h-3" />
              Cliente {type === "llamada" ? <span className="text-orange-500 font-medium">*</span> : <span className="text-muted-foreground/60">(opcional)</span>}
            </label>
            <ClienteSearch value={cliente} onChange={setCliente} required={type === "llamada"} />
          </div>
          <Textarea placeholder="Descripción" value={description} onChange={e => setDescription(e.target.value)} className="resize-none h-20 text-sm" />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1"><Clock className="w-3 h-3" /> Duración (min)</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["15","30","45","60","90","120"].map(d => <SelectItem key={d} value={d}>{d} min</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Responsable</label>
              <Select value={responsableId} onValueChange={setResponsableId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {type === "reunión" && (
            <div>
              <label className="text-xs text-muted-foreground mb-2 block flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Asistentes
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
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={loading || !title.trim()}>
            {loading ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Activity card ─────────────────────────────────────────────────────────────
function ActivityCard({
  activity: a,
  onToggle,
  onEdit,
}: {
  activity: any;
  onToggle: (id: string, completed: boolean) => void;
  onEdit: (a: any) => void;
}) {
  const cfg = TYPE_CONFIG[a.activity_type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.tarea;
  const Icon = cfg.icon;
  const hasMeet = !!a.meet_link;

  return (
    <div className={`group relative bg-card border border-border border-l-4 ${cfg.border} rounded-xl px-4 py-3 shadow-sm transition-all hover:shadow-md ${a.completed ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Complete toggle */}
        <button
          onClick={() => onToggle(a.id, a.completed)}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
            a.completed
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-border hover:border-emerald-400"
          }`}
        >
          {a.completed && <Check className="w-3 h-3" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Top row: badge + time + actions */}
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
              <Icon className="w-2.5 h-2.5" /> {cfg.label}
            </span>
            {a.scheduled_at && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {format(new Date(a.scheduled_at), "HH:mm")}
                {a.duration_minutes && <span className="text-muted-foreground/60"> · {a.duration_minutes}min</span>}
              </span>
            )}
            {/* Actions */}
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(a)}
                className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Editar"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Title */}
          <p className={`text-sm font-semibold leading-tight ${a.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {a.title}
          </p>

          {/* Description */}
          {a.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.description}</p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {a.cliente_nombre && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground bg-muted px-2 py-0.5 rounded-full">
                <UserRound className="w-3 h-3 text-muted-foreground" />
                {a.cliente_nombre}
              </span>
            )}
            {a.gestiones && (
              <span className="text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                {a.gestiones.title}
              </span>
            )}
            {a.assigned_to && (
              <span className="text-[11px] text-muted-foreground">· {a.assigned_to}</span>
            )}
          </div>

          {/* Meet link */}
          {hasMeet && (
            <div className="mt-2.5">
              <a
                href={a.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors shadow-sm"
              >
                <Video className="w-3.5 h-3.5" />
                Unirse a la reunión
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function AgendaView() {
  const queryClient = useQueryClient();
  const [currentDate,    setCurrentDate]    = useState(new Date());
  const [view,           setView]           = useState<"day" | "week">("week");
  const [showNueva,      setShowNueva]      = useState(false);
  const [defaultNewDate, setDefaultNewDate] = useState<Date | undefined>();
  const [editActivity,   setEditActivity]   = useState<any | null>(null);

  const colaboradorId = localStorage.getItem("mis_gestiones_colaborador") || "";

  const { data: googleToken, refetch: refetchToken } = useQuery({
    queryKey: ["google-token", colaboradorId],
    queryFn: async () => {
      if (!colaboradorId) return null;
      const { data } = await (supabase as any)
        .from("colaborador_google_tokens")
        .select("google_email, updated_at")
        .eq("colaborador_id", colaboradorId)
        .single();
      return data as { google_email: string; updated_at: string } | null;
    },
    enabled: !!colaboradorId,
  });

  const isGoogleConnected = !!googleToken?.google_email;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get("google");
    if (googleStatus === "connected") {
      toast.success("Google Calendar conectado correctamente");
      refetchToken();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (googleStatus === "error") {
      const msg = params.get("msg") || "Error desconocido";
      toast.error(`Error al conectar Google Calendar: ${msg}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnectGoogle = () => {
    if (!colaboradorId) { toast.error("No hay colaborador seleccionado"); return; }
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id",     GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri",  GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope",         GOOGLE_SCOPES);
    authUrl.searchParams.set("access_type",   "offline");
    authUrl.searchParams.set("prompt",        "consent");
    authUrl.searchParams.set("state",         colaboradorId);
    window.location.href = authUrl.toString();
  };

  const handleDisconnectGoogle = async () => {
    await (supabase as any).from("colaborador_google_tokens").delete().eq("colaborador_id", colaboradorId);
    refetchToken();
    toast.success("Google Calendar desconectado");
  };

  const weekStart  = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd    = endOfWeek(currentDate,   { weekStartsOn: 1 });
  const rangeStart = view === "day" ? startOfDay(currentDate) : weekStart;
  const rangeEnd   = view === "day" ? endOfDay(currentDate)   : weekEnd;

  const { data: activities = [] } = useQuery({
    queryKey: ["agenda-activities", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("activities")
        .select("*, gestiones(title, process_id)")
        .gte("scheduled_at", rangeStart.toISOString())
        .lte("scheduled_at", rangeEnd.toISOString())
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const navigate = (dir: number) => {
    if (view === "day") setCurrentDate(d => addDays(d, dir));
    else setCurrentDate(d => (dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1)));
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    await supabase.from("activities").update({
      completed: !completed, completed_at: !completed ? new Date().toISOString() : null,
    }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["agenda-activities"] });
  };

  const dayGroups = useMemo(() => {
    if (view !== "week") return [];
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      return { date: day, acts: activities.filter(a => a.scheduled_at && isSameDay(new Date(a.scheduled_at), day)) };
    });
  }, [activities, weekStart, view]);

  const headerLabel = view === "day"
    ? format(currentDate, "EEEE d 'de' MMMM yyyy", { locale: es })
    : `${format(weekStart, "d MMM", { locale: es })} – ${format(weekEnd, "d MMM yyyy", { locale: es })}`;

  const totalWeek = activities.length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Agenda</h2>
          {totalWeek > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{totalWeek} actividad{totalWeek !== 1 ? "es" : ""}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={v => setView(v as "day" | "week")}>
            <TabsList className="h-8">
              <TabsTrigger value="day"  className="text-xs px-3 h-6">Día</TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-3 h-6">Semana</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button className="px-2 py-1.5 hover:bg-accent transition-colors border-r border-border" onClick={() => navigate(-1)}>
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button className="px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors" onClick={() => setCurrentDate(new Date())}>
              Hoy
            </button>
            <button className="px-2 py-1.5 hover:bg-accent transition-colors border-l border-border" onClick={() => navigate(1)}>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setDefaultNewDate(currentDate); setShowNueva(true); }}>
            <Plus className="w-3.5 h-3.5" /> Nueva
          </Button>
        </div>
      </div>

      {/* Google Calendar banner */}
      <div className={`mx-4 mt-3 rounded-xl border px-4 py-2.5 flex items-center gap-3 shrink-0 ${
        isGoogleConnected ? "bg-emerald-500/5 border-emerald-200 dark:border-emerald-800" : "bg-muted/40 border-border"
      }`}>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isGoogleConnected ? "bg-emerald-500/10" : "bg-muted"}`}>
          <CalendarCheck className={`w-3.5 h-3.5 ${isGoogleConnected ? "text-emerald-600" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          {isGoogleConnected ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Google Calendar conectado · <span className="font-normal text-muted-foreground">{googleToken.google_email}</span>
            </p>
          ) : (
            <p className="text-xs font-medium text-foreground">Conectá tu Google Calendar para sincronizar actividades</p>
          )}
        </div>
        {isGoogleConnected ? (
          <button onClick={handleDisconnectGoogle} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-500 transition-colors shrink-0">
            <Unlink className="w-3 h-3" /> Desconectar
          </button>
        ) : (
          <Button size="sm" className="h-7 text-xs shrink-0 gap-1.5" onClick={handleConnectGoogle}>
            <CalendarCheck className="w-3.5 h-3.5" /> Conectar
          </Button>
        )}
      </div>

      {/* Date label */}
      <div className="px-5 pt-3 pb-1 shrink-0">
        <p className="text-sm font-semibold text-foreground capitalize">{headerLabel}</p>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {view === "week" ? (
          <div className="space-y-2">
            {dayGroups.map(({ date, acts }) => {
              const isToday   = isSameDay(date, new Date());
              const dayName   = format(date, "EEE", { locale: es }).toUpperCase();
              const dayNumber = format(date, "d");
              return (
                <div key={date.toISOString()}>
                  {/* Day header */}
                  <div
                    className="flex items-center gap-3 py-2 cursor-pointer group select-none"
                    onClick={() => { setDefaultNewDate(date); setShowNueva(true); }}
                  >
                    <div className={`flex items-center gap-2 shrink-0 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      <span className="text-[11px] font-bold uppercase w-8">{dayName}</span>
                      <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${
                        isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                      }`}>
                        {dayNumber}
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-border" />
                    {acts.length > 0 ? (
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">{acts.length}</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">+ nueva</span>
                    )}
                  </div>

                  {/* Activities */}
                  {acts.length > 0 && (
                    <div className="space-y-2 ml-11 mb-1">
                      {acts.map(a => (
                        <ActivityCard key={a.id} activity={a} onToggle={toggleComplete} onEdit={setEditActivity} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            {activities.length > 0
              ? activities.map(a => <ActivityCard key={a.id} activity={a} onToggle={toggleComplete} onEdit={setEditActivity} />)
              : <p className="text-sm text-muted-foreground text-center py-12">No hay actividades para este día</p>}
          </div>
        )}
        {view === "week" && activities.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">No hay actividades programadas esta semana</p>
        )}
      </div>

      <NuevaActividadDialog
        open={showNueva}
        onOpenChange={setShowNueva}
        defaultDate={defaultNewDate}
      />

      {editActivity && (
        <EditActividadDialog
          activity={editActivity}
          open={!!editActivity}
          onOpenChange={o => { if (!o) setEditActivity(null); }}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["agenda-activities"] })}
        />
      )}
    </div>
  );
}
