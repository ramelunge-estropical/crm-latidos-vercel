import { useState } from "react";
import {
  Settings, FolderKanban, LayoutList, Shield, Users,
  MapPin, MessageSquare, BarChart3, Puzzle, Sliders,
  ChevronLeft, ChevronRight, Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProcesosConfig }      from "./config/ProcesosConfig";
import { AreasConfig }         from "./config/AreasConfig";
import { ColaboradoresConfig } from "./config/ColaboradoresConfig";

type Section = "procesos" | "areas" | "colaboradores" | "permisos" | null;

const CARDS = [
  {
    id: "procesos" as Section,
    icon: FolderKanban,
    color: "bg-violet-500/10 text-violet-600",
    title: "Procesos & Pipelines",
    desc: "Definí procesos, etapas y flujos de trabajo",
    active: true,
  },
  {
    id: "areas" as Section,
    icon: MapPin,
    color: "bg-amber-500/10 text-amber-600",
    title: "Áreas",
    desc: "Gestioná las áreas de la empresa",
    active: true,
  },
  {
    id: "colaboradores" as Section,
    icon: Users,
    color: "bg-blue-500/10 text-blue-600",
    title: "Colaboradores",
    desc: "Usuarios, cargos y asignación de roles",
    active: true,
  },
  {
    id: "permisos" as Section,
    icon: Shield,
    color: "bg-red-500/10 text-red-600",
    title: "Permisos y Accesos",
    desc: "Control de acceso por rol (en desarrollo)",
    active: false,
    badge: "Próximamente",
  },
  {
    id: null,
    icon: MessageSquare,
    color: "bg-emerald-500/10 text-emerald-600",
    title: "Comunicaciones",
    desc: "Canales, templates y notificaciones",
    active: false,
    badge: "Próximamente",
  },
  {
    id: null,
    icon: BarChart3,
    color: "bg-cyan-500/10 text-cyan-600",
    title: "Dashboards",
    desc: "Personalizar widgets y métricas",
    active: false,
    badge: "Próximamente",
  },
  {
    id: null,
    icon: Sliders,
    color: "bg-rose-500/10 text-rose-600",
    title: "Campos Personalizados",
    desc: "Definir campos adicionales en gestiones",
    active: false,
    badge: "Próximamente",
  },
  {
    id: null,
    icon: Puzzle,
    color: "bg-indigo-500/10 text-indigo-600",
    title: "Integraciones",
    desc: "Conectar con sistemas externos",
    active: false,
    badge: "Próximamente",
  },
];

const SECTION_TITLES: Record<string, string> = {
  procesos:      "Procesos & Pipelines",
  areas:         "Áreas",
  colaboradores: "Colaboradores",
  permisos:      "Permisos y Accesos",
};

function PermisosInfo() {
  const roles = [
    { rol: "Admin",       color: "bg-red-500/10 text-red-600",          permisos: ["Acceso total", "Configuración", "Eliminar datos", "Ver todos los reportes"] },
    { rol: "Gerente",     color: "bg-amber-500/10 text-amber-600",       permisos: ["Ver todo el equipo", "Reasignar gestiones", "Ver reportes", "Configurar pipelines"] },
    { rol: "Colaborador", color: "bg-primary/10 text-primary",           permisos: ["Ver sus gestiones", "Crear gestiones", "Editar sus tareas", "Ver agenda"] },
    { rol: "Viewer",      color: "bg-muted text-muted-foreground",       permisos: ["Solo lectura", "Ver gestiones asignadas", "Ver reportes básicos"] },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
        <Lock className="w-4 h-4 shrink-0" />
        La aplicación de permisos por rol se activará cuando se implemente el sistema de autenticación.
        Por ahora los roles están definidos pero no se aplican restricciones.
      </div>
      <div className="grid grid-cols-2 gap-3">
        {roles.map(r => (
          <div key={r.rol} className="p-4 rounded-xl border border-border bg-card">
            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold mb-3 ${r.color}`}>{r.rol}</span>
            <ul className="space-y-1">
              {r.permisos.map(p => (
                <li key={p} className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConfiguracionesView() {
  const [active, setActive] = useState<Section>(null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card">
        {active ? (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs -ml-1 mr-1"
            onClick={() => setActive(null)}>
            <ChevronLeft className="w-3.5 h-3.5" />Volver
          </Button>
        ) : (
          <Settings className="w-5 h-5 text-primary" />
        )}
        <h2 className="text-lg font-semibold text-foreground">
          {active ? SECTION_TITLES[active] : "Configuraciones"}
        </h2>
        {active && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        {active && <span className="text-sm text-muted-foreground">{SECTION_TITLES[active]}</span>}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto p-6">
        {active === null && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            {CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.title}
                  onClick={() => card.active && card.id && setActive(card.id)}
                  className={[
                    "flex items-start gap-4 p-5 rounded-xl border text-left transition-all",
                    card.active && card.id
                      ? "border-border bg-card hover:shadow-md hover:border-primary/30 cursor-pointer"
                      : "border-border bg-card opacity-60 cursor-default",
                  ].join(" ")}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${card.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-foreground">{card.title}</p>
                      {(card as any).badge && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{(card as any).badge}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
                  </div>
                  {card.active && card.id && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {active === "procesos"      && <ProcesosConfig />}
        {active === "areas"         && <AreasConfig />}
        {active === "colaboradores" && <ColaboradoresConfig />}
        {active === "permisos"      && <PermisosInfo />}
      </div>
    </div>
  );
}
