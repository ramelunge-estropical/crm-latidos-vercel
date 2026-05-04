import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isThisWeek, isPast, startOfWeek, endOfWeek, isAfter, isBefore, addDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  Star, AlertTriangle, CheckCircle2, Clock, Mail,
  TrendingUp, TrendingDown, Minus, CalendarClock,
  ChevronRight, CircleAlert, Inbox, Flame, Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type Gestion = {
  id: string;
  title: string;
  priority: string;
  due_date: string | null;
  cliente_nombre: string | null;
  type: string | null;
  pipeline_stages: { name: string; global_status: string } | null;
};

type Activity = {
  id: string;
  title: string;
  activity_type: string;
  scheduled_at: string | null;
  completed: boolean;
  cliente_nombre: string | null;
};

type Conversacion = {
  id: string;
  asunto: string | null;
  cliente_nombre: string | null;
  ultimo_mensaje: string | null;
  ultima_interaccion: string | null;
  no_leidos: number | null;
  canal: string;
  estado: string | null;
};

const priorityColor: Record<string, string> = {
  urgent: "text-red-500",
  high:   "text-orange-500",
  medium: "text-primary",
  low:    "text-muted-foreground",
};

const typeLabel: Record<string, string> = {
  comercial: "Comercial",
  proyecto:  "Proyecto",
  operativa: "Operativa",
  caso:      "Caso",
};

function ScoreRing({ score }: { score: number }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const fill = circ * (score / 100);
  const color = score >= 80 ? "#22c55e" : score >= 55 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "Excelente" : score >= 55 ? "En progreso" : "Atención";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="104" height="104" className="-rotate-90">
        <circle cx="52" cy="52" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
        <circle
          cx="52" cy="52" r={r} fill="none"
          stroke={color} strokeWidth="9"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-foreground">{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
      <span className="text-xs font-medium" style={{ color }}>{label}</span>
    </div>
  );
}

export function MiDiaView() {
  const colaboradorId = localStorage.getItem("mis_gestiones_colaborador") || "";
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });
  const todayStr  = format(now, "yyyy-MM-dd");
  const weekEndStr = format(addDays(now, 7), "yyyy-MM-dd");

  const { data: user } = useQuery({
    queryKey: ["mi-dia-user", colaboradorId],
    queryFn: async () => {
      if (!colaboradorId) return null;
      const { data } = await (supabase as any)
        .from("colaboradores").select("nombre, cargo, color").eq("id", colaboradorId).single();
      return data as { nombre: string; cargo: string; color: string } | null;
    },
    enabled: !!colaboradorId,
  });

  const { data: gestiones = [] } = useQuery<Gestion[]>({
    queryKey: ["mi-dia-gestiones", colaboradorId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("gestiones")
        .select("id, title, priority, due_date, cliente_nombre, type, pipeline_stages(name, global_status)")
        .eq("responsable_id", colaboradorId)
        .not("pipeline_stages.global_status", "eq", "done");
      return (data ?? []) as Gestion[];
    },
    enabled: !!colaboradorId,
    refetchInterval: 60_000,
  });

  const { data: completedToday = [] } = useQuery<Gestion[]>({
    queryKey: ["mi-dia-completed", colaboradorId, todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("gestiones")
        .select("id, title, pipeline_stages(global_status)")
        .eq("responsable_id", colaboradorId)
        .gte("updated_at", `${todayStr}T00:00:00`)
        .lte("updated_at", `${todayStr}T23:59:59`);
      return ((data ?? []) as Gestion[]).filter(
        (g) => g.pipeline_stages?.global_status === "done"
      );
    },
    enabled: !!colaboradorId,
  });

  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["mi-dia-activities", colaboradorId, todayStr],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("activities")
        .select("id, title, activity_type, scheduled_at, completed, cliente_nombre")
        .or(`assigned_to_id.eq.${colaboradorId},created_by.eq.${colaboradorId}`)
        .gte("scheduled_at", `${todayStr}T00:00:00`)
        .lte("scheduled_at", `${todayStr}T23:59:59`)
        .order("scheduled_at", { ascending: true });
      return (data ?? []) as Activity[];
    },
    enabled: !!colaboradorId,
    refetchInterval: 60_000,
  });

  const { data: weekActivities = [] } = useQuery<Activity[]>({
    queryKey: ["mi-dia-week-activities", colaboradorId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("activities")
        .select("id, title, activity_type, scheduled_at, completed, cliente_nombre")
        .or(`assigned_to_id.eq.${colaboradorId},created_by.eq.${colaboradorId}`)
        .gte("scheduled_at", format(weekStart, "yyyy-MM-dd'T'HH:mm:ss"))
        .lte("scheduled_at", format(weekEnd,   "yyyy-MM-dd'T'HH:mm:ss"))
        .eq("completed", false)
        .not("scheduled_at", "is", null)
        .order("scheduled_at", { ascending: true });
      return (data ?? []) as Activity[];
    },
    enabled: !!colaboradorId,
  });

  const { data: correos = [] } = useQuery<Conversacion[]>({
    queryKey: ["mi-dia-correos", colaboradorId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("lat_conversaciones")
        .select("id, asunto, cliente_nombre, ultimo_mensaje, ultima_interaccion, no_leidos, canal, estado")
        .eq("responsable_id", colaboradorId)
        .eq("canal", "email")
        .order("ultima_interaccion", { ascending: false })
        .limit(20);
      return (data ?? []) as Conversacion[];
    },
    enabled: !!colaboradorId,
  });

  const score = useMemo(() => {
    let s = 60;
    s += completedToday.length * 8;
    s += activities.filter((a) => a.completed).length * 5;
    const overdue = gestiones.filter(
      (g) => g.due_date && isPast(new Date(g.due_date)) && g.pipeline_stages?.global_status !== "done"
    );
    s -= overdue.length * 12;
    const unread = correos.reduce((acc, c) => acc + (c.no_leidos ?? 0), 0);
    s -= Math.min(unread * 3, 20);
    return Math.max(0, Math.min(100, s));
  }, [completedToday, activities, gestiones, correos]);

  const overdue = gestiones.filter(
    (g) => g.due_date && isPast(new Date(g.due_date))
  );
  const urgent = gestiones.filter((g) => g.priority === "urgent" || g.priority === "high");
  const dueThisWeek = gestiones.filter(
    (g) =>
      g.due_date &&
      isAfter(new Date(g.due_date), now) &&
      isBefore(new Date(g.due_date), new Date(weekEndStr))
  );
  const unreadEmails = correos.filter((c) => (c.no_leidos ?? 0) > 0);
  const pendingActivities = activities.filter((a) => !a.completed);
  const completedActivities = activities.filter((a) => a.completed);

  const greeting = () => {
    const h = now.getHours();
    if (h < 12) return "Buenos días";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  };

  const activityTypeIcon: Record<string, string> = {
    call: "📞", meeting: "🤝", email: "✉️", task: "✅", other: "📌",
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

          {/* ── HEADER ────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {format(now, "EEEE d 'de' MMMM, yyyy", { locale: es })}
              </p>
              <h1 className="text-2xl font-bold text-foreground mt-0.5">
                {greeting()}{user ? `, ${user.nombre.split(" ")[0]}` : ""}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {overdue.length > 0
                  ? `Tenés ${overdue.length} gestión${overdue.length > 1 ? "es" : ""} vencida${overdue.length > 1 ? "s" : ""} — revisalas hoy`
                  : pendingActivities.length > 0
                  ? `Tenés ${pendingActivities.length} actividad${pendingActivities.length > 1 ? "es" : ""} pendiente${pendingActivities.length > 1 ? "s" : ""} para hoy`
                  : "Todo en orden por ahora — buen trabajo"}
              </p>
            </div>

            {/* Score */}
            <div className="relative flex flex-col items-center shrink-0">
              <ScoreRing score={score} />
            </div>
          </div>

          {/* ── STATS ROW ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
              label="Completadas hoy"
              value={completedToday.length}
              color="green"
            />
            <StatCard
              icon={<Clock className="w-4 h-4 text-primary" />}
              label="Actividades hoy"
              value={`${completedActivities.length}/${activities.length}`}
              color="blue"
            />
            <StatCard
              icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
              label="Vencidas"
              value={overdue.length}
              color={overdue.length > 0 ? "red" : "green"}
            />
            <StatCard
              icon={<Mail className="w-4 h-4 text-orange-500" />}
              label="Correos sin leer"
              value={unreadEmails.length}
              color={unreadEmails.length > 0 ? "orange" : "green"}
            />
          </div>

          {/* ── MAIN GRID ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* HOY — Actividades */}
            <Section
              title="Actividades de hoy"
              icon={<CalendarClock className="w-4 h-4" />}
              badge={pendingActivities.length > 0 ? String(pendingActivities.length) : undefined}
              badgeColor="blue"
              empty={activities.length === 0}
              emptyText="Sin actividades programadas para hoy"
            >
              {activities.map((a) => (
                <ActivityRow
                  key={a.id}
                  icon={activityTypeIcon[a.activity_type] ?? "📌"}
                  title={a.title}
                  subtitle={a.cliente_nombre ?? ""}
                  time={a.scheduled_at ? format(new Date(a.scheduled_at), "HH:mm") : ""}
                  done={a.completed}
                />
              ))}
            </Section>

            {/* URGENTE / VENCIDAS */}
            <Section
              title="Atención urgente"
              icon={<Flame className="w-4 h-4 text-red-500" />}
              badge={overdue.length + urgent.length > 0 ? String(overdue.length + urgent.filter(g => !overdue.includes(g)).length) : undefined}
              badgeColor="red"
              empty={overdue.length === 0 && urgent.length === 0}
              emptyText="Sin gestiones urgentes ni vencidas 🎉"
            >
              {overdue.map((g) => (
                <GestionRow
                  key={g.id}
                  title={g.title}
                  subtitle={g.cliente_nombre ?? ""}
                  type={typeLabel[g.type ?? ""] ?? ""}
                  badge="Vencida"
                  badgeColor="red"
                  stage={g.pipeline_stages?.name ?? ""}
                />
              ))}
              {urgent
                .filter((g) => !overdue.find((o) => o.id === g.id))
                .slice(0, 4)
                .map((g) => (
                  <GestionRow
                    key={g.id}
                    title={g.title}
                    subtitle={g.cliente_nombre ?? ""}
                    type={typeLabel[g.type ?? ""] ?? ""}
                    badge={g.priority === "urgent" ? "Urgente" : "Alta"}
                    badgeColor={g.priority === "urgent" ? "red" : "orange"}
                    stage={g.pipeline_stages?.name ?? ""}
                  />
                ))}
            </Section>

            {/* SEMANA */}
            <Section
              title="Esta semana"
              icon={<Target className="w-4 h-4" />}
              empty={dueThisWeek.length === 0 && weekActivities.length === 0}
              emptyText="Semana despejada"
            >
              {weekActivities.slice(0, 3).map((a) => (
                <ActivityRow
                  key={a.id}
                  icon={activityTypeIcon[a.activity_type] ?? "📌"}
                  title={a.title}
                  subtitle={a.cliente_nombre ?? ""}
                  time={a.scheduled_at ? format(new Date(a.scheduled_at), "EEE d/M HH:mm", { locale: es }) : ""}
                  done={false}
                />
              ))}
              {dueThisWeek.slice(0, 4).map((g) => (
                <GestionRow
                  key={g.id}
                  title={g.title}
                  subtitle={g.cliente_nombre ?? ""}
                  type={typeLabel[g.type ?? ""] ?? ""}
                  badge={g.due_date ? `Vence ${format(new Date(g.due_date), "d/M", { locale: es })}` : ""}
                  badgeColor="blue"
                  stage={g.pipeline_stages?.name ?? ""}
                />
              ))}
            </Section>

            {/* CORREOS */}
            <Section
              title="Correos"
              icon={<Inbox className="w-4 h-4" />}
              badge={unreadEmails.length > 0 ? String(unreadEmails.reduce((a, c) => a + (c.no_leidos ?? 0), 0)) : undefined}
              badgeColor="orange"
              empty={correos.length === 0}
              emptyText="Sin correos por ahora"
            >
              {correos.slice(0, 6).map((c) => (
                <div key={c.id} className="flex items-start gap-2.5 py-2.5 border-b border-border last:border-0">
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${(c.no_leidos ?? 0) > 0 ? "bg-primary" : "bg-transparent border border-muted-foreground/30"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${(c.no_leidos ?? 0) > 0 ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                      {c.asunto ?? "Sin asunto"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.cliente_nombre ?? "Desconocido"}{c.ultimo_mensaje ? ` — ${c.ultimo_mensaje.slice(0, 50)}` : ""}
                    </p>
                  </div>
                  {c.ultima_interaccion && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(c.ultima_interaccion), "d/M HH:mm")}
                    </span>
                  )}
                </div>
              ))}
            </Section>

          </div>

          {/* ── RESUMEN SEMANA ─────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Resumen de la semana</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {format(weekStart, "d MMM", { locale: es })} — {format(weekEnd, "d MMM", { locale: es })}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <WeekStat
                label="Completadas"
                value={completedToday.length}
                icon={<CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
              />
              <WeekStat
                label="En curso"
                value={gestiones.filter((g) => g.pipeline_stages?.global_status === "doing").length}
                icon={<Clock className="w-3.5 h-3.5 text-primary" />}
              />
              <WeekStat
                label="Vencen esta semana"
                value={dueThisWeek.length}
                icon={<CircleAlert className="w-3.5 h-3.5 text-orange-500" />}
              />
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  const colorMap: Record<string, string> = {
    green:  "bg-green-500/10  border-green-500/20",
    red:    "bg-red-500/10    border-red-500/20",
    blue:   "bg-primary/10   border-primary/20",
    orange: "bg-orange-500/10 border-orange-500/20",
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color] ?? "bg-card border-border"}`}>
      <div className="flex items-center gap-1.5 mb-1.5">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function Section({
  title, icon, badge, badgeColor = "blue", empty, emptyText, children,
}: {
  title: string; icon: React.ReactNode; badge?: string; badgeColor?: string;
  empty: boolean; emptyText: string; children?: React.ReactNode;
}) {
  const badgeColorMap: Record<string, string> = {
    red:    "bg-red-500/15 text-red-600",
    orange: "bg-orange-500/15 text-orange-600",
    blue:   "bg-primary/15 text-primary",
    green:  "bg-green-500/15 text-green-700",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {badge && (
          <span className={`ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-full ${badgeColorMap[badgeColor] ?? ""}`}>
            {badge}
          </span>
        )}
      </div>
      {empty ? (
        <p className="text-xs text-muted-foreground py-3 text-center">{emptyText}</p>
      ) : (
        <div className="space-y-0">{children}</div>
      )}
    </div>
  );
}

function ActivityRow({ icon, title, subtitle, time, done }: { icon: string; title: string; subtitle: string; time: string; done: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 py-2 border-b border-border last:border-0 ${done ? "opacity-50" : ""}`}>
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
      {time && <span className="text-xs text-muted-foreground shrink-0">{time}</span>}
      {done && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
    </div>
  );
}

function GestionRow({ title, subtitle, type, badge, badgeColor, stage }: {
  title: string; subtitle: string; type: string; badge: string; badgeColor: string; stage: string;
}) {
  const badgeColorMap: Record<string, string> = {
    red:    "bg-red-500/15 text-red-600",
    orange: "bg-orange-500/15 text-orange-600",
    blue:   "bg-primary/15 text-primary",
  };
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {subtitle}{type ? ` · ${type}` : ""}{stage ? ` · ${stage}` : ""}
        </p>
      </div>
      {badge && (
        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${badgeColorMap[badgeColor] ?? ""}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function WeekStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/50">
      <div className="flex items-center gap-1">{icon}<span className="text-lg font-bold text-foreground">{value}</span></div>
      <span className="text-[11px] text-muted-foreground text-center">{label}</span>
    </div>
  );
}
