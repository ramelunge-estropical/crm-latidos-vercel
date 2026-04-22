import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, CheckCircle2, Clock, AlertTriangle, TrendingUp,
  CalendarClock, CalendarX2, User, Tag,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-red-500/15 text-red-600" },
  high:   { label: "Alta",    className: "bg-orange-500/15 text-orange-600" },
  medium: { label: "Media",   className: "bg-primary/10 text-primary" },
  low:    { label: "Baja",    className: "bg-muted text-muted-foreground" },
};

const typeLabels: Record<string, string> = {
  comercial: "Comercial",
  proyecto:  "Proyecto",
  operativa: "Operativa",
  caso:      "Caso",
};

const STATUS_CONFIG = [
  { id: "to_do",  label: "Por hacer",   bar: "bg-status-todo",   text: "text-muted-foreground" },
  { id: "doing",  label: "En curso",    bar: "bg-status-doing",  text: "text-amber-600"        },
  { id: "review", label: "En revisión", bar: "bg-status-review", text: "text-violet-600"       },
  { id: "done",   label: "Completo",    bar: "bg-status-done",   text: "text-emerald-600"      },
];

function fmtDueDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return format(d, "d MMM", { locale: es });
}

function DaysChip({ iso, overdue }: { iso: string; overdue: boolean }) {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = differenceInDays(d, today);
  if (overdue) return (
    <span className="text-[10px] font-medium text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded">
      Vencida hace {Math.abs(diff)}d
    </span>
  );
  if (diff === 0) return <span className="text-[10px] font-medium text-orange-600 bg-orange-500/10 px-1.5 py-0.5 rounded">Hoy</span>;
  return <span className="text-[10px] text-muted-foreground">En {diff}d · {fmtDueDate(iso)}</span>;
}

type GestionRow = {
  id: string;
  title: string;
  priority: string;
  due_date: string | null;
  cliente_nombre: string | null;
  responsable_nombre: string | null;
  type: string | null;
  pipeline_stages: { global_status: string } | null;
};

export function ResumenDiarioView() {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  // ── Stats cards (existing) ───────────────────────────
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["daily-summary", todayStr],
    queryFn: async () => {
      const [gestiones, activities, recentHistory] = await Promise.all([
        supabase.from("gestiones").select("id, priority, stage_id", { count: "exact" }),
        supabase.from("activities").select("id, completed, scheduled_at").gte("scheduled_at", `${todayStr}T00:00:00`).lte("scheduled_at", `${todayStr}T23:59:59`),
        supabase.from("stage_history").select("id").gte("changed_at", `${todayStr}T00:00:00`),
      ]);
      return {
        totalGestiones: gestiones.count || 0,
        urgentCount: gestiones.data?.filter((g) => g.priority === "urgent" || g.priority === "high").length || 0,
        todayActivities: activities.data?.length || 0,
        completedToday: activities.data?.filter((a) => a.completed).length || 0,
        movesToday: recentHistory.data?.length || 0,
      };
    },
  });

  // ── Gestiones con etapa para las 3 secciones nuevas ──
  const { data: gestiones = [], isLoading: gestLoading } = useQuery<GestionRow[]>({
    queryKey: ["gestiones-resumen-detail"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("gestiones")
        .select("id, title, priority, due_date, cliente_nombre, responsable_nombre, type, pipeline_stages(global_status)")
        .order("due_date", { ascending: true, nullsFirst: false });
      return (data || []) as GestionRow[];
    },
  });

  // ── Derivados ────────────────────────────────────────
  const { vencidas, proximas, dist } = useMemo(() => {
    const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
    const in7 = new Date(todayMidnight); in7.setDate(in7.getDate() + 7);

    const nonDone = gestiones.filter(g => g.pipeline_stages?.global_status !== "done");

    const vencidas = nonDone
      .filter(g => g.due_date && new Date(`${g.due_date}T00:00:00`) < todayMidnight)
      .sort((a, b) => (a.due_date! < b.due_date! ? 1 : -1)); // más reciente primero

    const proximas = nonDone.filter(g => {
      if (!g.due_date) return false;
      const d = new Date(`${g.due_date}T00:00:00`);
      return d >= todayMidnight && d <= in7;
    });

    const dist: Record<string, number> = { to_do: 0, doing: 0, review: 0, done: 0 };
    for (const g of gestiones) {
      const s = g.pipeline_stages?.global_status;
      if (s && s in dist) dist[s]++;
    }

    return { vencidas, proximas, dist };
  }, [gestiones]);

  const total = gestiones.length || 1;

  const cards = [
    { label: "Total gestiones",  value: stats?.totalGestiones || 0, icon: TrendingUp,   color: "text-primary"          },
    { label: "Urgentes / Altas", value: stats?.urgentCount || 0,    icon: AlertTriangle, color: "text-priority-urgent"  },
    { label: "Actividades hoy",  value: stats?.todayActivities || 0,icon: Clock,         color: "text-blue-500"         },
    { label: "Completadas hoy",  value: stats?.completedToday || 0, icon: CheckCircle2,  color: "text-green-500"        },
    { label: "Movimientos hoy",  value: stats?.movesToday || 0,     icon: BarChart3,     color: "text-violet-500"       },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card sticky top-0 z-10">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Resumen Diario</h2>
        <span className="text-xs text-muted-foreground">{format(today, "EEEE d 'de' MMMM", { locale: es })}</span>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <c.icon className={`w-4 h-4 ${c.color}`} />
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
              {statsLoading
                ? <Skeleton className="h-8 w-12" />
                : <p className="text-2xl font-bold text-foreground">{c.value}</p>
              }
            </div>
          ))}
        </div>

        {/* ── Distribución por estado ── */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Distribución por estado</h3>
          {gestLoading ? (
            <Skeleton className="h-6 w-full rounded-full" />
          ) : (
            <>
              {/* Barra segmentada */}
              <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-4">
                {STATUS_CONFIG.map(s => {
                  const pct = (dist[s.id] / total) * 100;
                  return pct > 0 ? (
                    <div
                      key={s.id}
                      className={`${s.bar} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${s.label}: ${dist[s.id]}`}
                    />
                  ) : null;
                })}
              </div>
              {/* Leyenda */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {STATUS_CONFIG.map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.bar}`} />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                      <p className={`text-lg font-bold leading-tight ${s.text}`}>{dist[s.id]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Próximos vencimientos ── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-foreground">Próximos vencimientos</h3>
              <span className="ml-auto text-xs text-muted-foreground">7 días</span>
            </div>
            {gestLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : proximas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sin vencimientos próximos</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
                {proximas.map(g => {
                  const p = priorityConfig[g.priority] || priorityConfig.medium;
                  return (
                    <div key={g.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{g.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {g.cliente_nombre && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <User className="w-3 h-3" />{g.cliente_nombre}
                            </span>
                          )}
                          {g.type && (
                            <span className="text-[10px] text-muted-foreground">
                              <Tag className="w-3 h-3 inline mr-0.5" />{typeLabels[g.type] ?? g.type}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${p.className}`}>{p.label}</span>
                        {g.due_date && <DaysChip iso={g.due_date} overdue={false} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Gestiones vencidas ── */}
          <div className="rounded-xl border border-red-200 bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarX2 className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-semibold text-foreground">Gestiones vencidas</h3>
              {vencidas.length > 0 && (
                <span className="ml-auto text-xs font-medium text-red-600 bg-red-500/10 px-2 py-0.5 rounded-full">
                  {vencidas.length}
                </span>
              )}
            </div>
            {gestLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : vencidas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sin gestiones vencidas</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
                {vencidas.map(g => {
                  const p = priorityConfig[g.priority] || priorityConfig.medium;
                  return (
                    <div key={g.id} className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-200/50 hover:bg-red-500/10 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{g.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {g.cliente_nombre && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <User className="w-3 h-3" />{g.cliente_nombre}
                            </span>
                          )}
                          {g.type && (
                            <span className="text-[10px] text-muted-foreground">
                              <Tag className="w-3 h-3 inline mr-0.5" />{typeLabels[g.type] ?? g.type}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${p.className}`}>{p.label}</span>
                        {g.due_date && <DaysChip iso={g.due_date} overdue={true} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
