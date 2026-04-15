import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings, FolderKanban, Shield, Users,
  MapPin, MessageSquare, BarChart3, Puzzle, Sliders,
  ChevronLeft, ChevronRight, Lock, EyeOff,
  GitBranch, LayoutGrid
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GestionesConfig }     from "./config/GestionesConfig";
import { ProcesosConfig }      from "./config/ProcesosConfig";
import { PipelinesConfig }     from "./config/PipelinesConfig";
import { AreasConfig }         from "./config/AreasConfig";
import { ColaboradoresConfig } from "./config/ColaboradoresConfig";

type Section =
  | "gestiones"
  | "procesos"
  | "pipelines"
  | "areas"
  | "colaboradores"
  | "permisos"
  | null;

const SECTION_PERMS: Record<string, { canView: string[]; canEdit: string[] }> = {
  gestiones:     { canView: ["admin", "gerente"], canEdit: ["admin"] },
  procesos:      { canView: ["admin", "gerente"], canEdit: ["admin"] },
  pipelines:     { canView: ["admin", "gerente"], canEdit: ["admin"] },
  areas:         { canView: ["admin", "gerente"], canEdit: ["admin"] },
  colaboradores: { canView: ["admin", "gerente"], canEdit: ["admin"] },
  permisos:      { canView: ["admin"],            canEdit: ["admin"] },
};

const CARDS = [
  {
    id: "gestiones" as Section,
    icon: LayoutGrid,
    color: "bg-teal-500/10 text-teal-600",
    title: "Gestiones",
    desc: "Estados, tipos y subtipos de gestiones",
  },
  {
    id: "procesos" as Section,
    icon: FolderKanban,
    color: "bg-violet-500/10 text-violet-600",
    title: "Procesos",
    desc: "Procesos de negocio y sus áreas asociadas",
  },
  {
    id: "pipelines" as Section,
    icon: GitBranch,
    color: "bg-indigo-500/10 text-indigo-600",
    title: "Pipelines",
    desc: "Etapas y flujos de trabajo por proceso",
  },
  {
    id: "areas" as Section,
    icon: MapPin,
    color: "bg-amber-500/10 text-amber-600",
    title: "Áreas",
    desc: "Gestioná las áreas de la empresa",
  },
  {
    id: "colaboradores" as Section,
    icon: Users,
    color: "bg-blue-500/10 text-blue-600",
    title: "Colaboradores",
    desc: "Usuarios, cargos y asignación de roles",
  },
  {
    id: "permisos" as Section,
    icon: Shield,
    color: "bg-red-500/10 text-red-600",
    title: "Permisos y Accesos",
    desc: "Control de acceso por rol",
  },
  {
    id: null,
    icon: MessageSquare,
    color: "bg-emerald-500/10 text-emerald-600",
    title: "Comunicaciones",
    desc: "Canales, templates y notificaciones",
  },
  {
    id: null,
    icon: BarChart3,
    color: "bg-cyan-500/10 text-cyan-600",
    title: "Dashboards",
    desc: "Personalizar widgets y métricas",
  },
  {
    id: null,
    icon: Sliders,
    color: "bg-rose-500/10 text-rose-600",
    title: "Campos Personalizados",
    desc: "Definir campos adicionales en gestiones",
  },
  {
    id: null,
    icon: Puzzle,
    color: "bg-orange-500/10 text-orange-600",
    title: "Integraciones",
    desc: "Conectar con sistemas externos",
  },
];

const SECTION_TITLES: Record<string, string> = {
  gestiones:     "Gestiones",
  procesos:      "Procesos",
  pipelines:     "Pipelines",
  areas:         "Áreas",
  colaboradores: "Colaboradores",
  permisos:      "Permisos y Accesos",
};

const ROL_LABELS: Record<string, string> = {
  admin: "Admin", gerente: "Gerente", colaborador: "Colaborador", viewer: "Viewer",
};

function PermisosInfo() {
  const roles = [
    {
      rol: "Admin",
      color: "bg-red-500/10 text-red-600",
      permisos: [
        "Acceso total a Configuraciones",
        "Crear/editar/eliminar colaboradores",
        "Cambiar roles",
        "Gestionar procesos, pipelines y áreas",
        "Ver todos los reportes",
      ],
    },
    {
      rol: "Gerente",
      color: "bg-amber-500/10 text-amber-600",
      permisos: [
        "Ver Configuraciones (solo lectura)",
        "Ver colaboradores sin editar",
        "Ver procesos, pipelines y áreas",
        "Ver todo el equipo en gestiones",
        "Ver reportes completos",
      ],
    },
    {
      rol: "Colaborador",
      color: "bg-primary/10 text-primary",
      permisos: [
        "Sin acceso a Configuraciones",
        "Ver sus propias gestiones",
        "Crear y editar gestiones asignadas",
        "Ver agenda propia",
      ],
    },
    {
      rol: "Viewer",
      color: "bg-muted text-muted-foreground",
      permisos: [
        "Sin acceso a Configuraciones",
        "Solo lectura en gestiones asignadas",
        "Sin crear ni editar",
      ],
    },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
        <Lock className="w-4 h-4 shrink-0" />
        La aplicación de restricciones se activará con el sistema de autenticación.
        Los roles ya están definidos en la base de datos.
      </div>
      <div className="grid grid-cols-2 gap-3">
        {roles.map(r => (
          <div key={r.rol} className="p-4 rounded-xl border border-border bg-card">
            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold mb-3 ${r.color}`}>
              {r.rol}
            </span>
            <ul className="space-y-1.5">
              {r.permisos.map(p => (
                <li key={p} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0 mt-1.5" />
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

  const colaboradorId = localStorage.getItem("mis_gestiones_colaborador") || "";

  const { data: currentUser } = useQuery({
    queryKey: ["current-user-rol", colaboradorId],
    queryFn: async () => {
      if (!colaboradorId) return null;
      const { data } = await (supabase as any)
        .from("colaboradores")
        .select("id, nombre, rol, color")
        .eq("id", colaboradorId)
        .single();
      return data as { id: string; nombre: string; rol: string; color: string } | null;
    },
    enabled: !!colaboradorId,
  });

  const userRol = currentUser?.rol || "colaborador";

  const canView = (sectionId: string) => SECTION_PERMS[sectionId]?.canView.includes(userRol) ?? false;
  const canEdit = (sectionId: string) => SECTION_PERMS[sectionId]?.canEdit.includes(userRol) ?? false;

  if (userRol === "colaborador" || userRol === "viewer") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card">
          <Settings className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Configuraciones</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <EyeOff className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Sin acceso</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Tu rol <span className="font-semibold">{ROL_LABELS[userRol]}</span> no tiene permisos
            para acceder a Configuraciones.
            Contactá a un Administrador si necesitás realizar cambios.
          </p>
        </div>
      </div>
    );
  }

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

        {currentUser && (
          <div className="ml-auto flex items-center gap-2">
            <span
              className="inline-flex w-7 h-7 rounded-full items-center justify-center text-white text-[11px] font-bold"
              style={{ backgroundColor: currentUser.color }}>
              {currentUser.nombre.charAt(0)}
            </span>
            <span className="text-xs text-muted-foreground">{currentUser.nombre}</span>
            <Badge variant="outline" className="text-[10px]">
              {ROL_LABELS[userRol]}
            </Badge>
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto p-6">
        {active === null && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            {CARDS.map((card) => {
              const Icon        = card.icon;
              const isAccessible = card.id ? canView(card.id) : false;
              const isComingSoon = !card.id;
              const isBlocked   = card.id && !isAccessible;

              return (
                <button
                  key={card.title}
                  onClick={() => isAccessible && card.id && setActive(card.id)}
                  disabled={!isAccessible}
                  className={[
                    "flex items-start gap-4 p-5 rounded-xl border text-left transition-all",
                    isAccessible
                      ? "border-border bg-card hover:shadow-md hover:border-primary/30 cursor-pointer"
                      : "border-border bg-card opacity-50 cursor-default",
                  ].join(" ")}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${card.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{card.title}</p>
                      {isComingSoon && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">Próximamente</Badge>
                      )}
                      {isBlocked && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-muted-foreground/30">
                          <Lock className="w-2.5 h-2.5 mr-0.5" />Sin acceso
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
                  </div>
                  {isAccessible && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
                </button>
              );
            })}
          </div>
        )}

        {active === "gestiones"     && <GestionesConfig     readonly={!canEdit("gestiones")} />}
        {active === "procesos"      && <ProcesosConfig      readonly={!canEdit("procesos")} />}
        {active === "pipelines"     && <PipelinesConfig     readonly={!canEdit("pipelines")} />}
        {active === "areas"         && <AreasConfig         readonly={!canEdit("areas")} />}
        {active === "colaboradores" && <ColaboradoresConfig readonly={!canEdit("colaboradores")} />}
        {active === "permisos"      && <PermisosInfo />}
      </div>
    </div>
  );
}
