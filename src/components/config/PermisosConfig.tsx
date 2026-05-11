import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllColaboradores } from "@/hooks/useSharedQueries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Users, Eye, Briefcase, Crown } from "lucide-react";
import { toast } from "sonner";

const ROLES: { value: string; label: string; badge: string; icon: typeof Crown; desc: string }[] = [
  {
    value: "sadmin",
    label: "Super Admin",
    badge: "bg-rose-500/10 text-rose-600 border-rose-300",
    icon: Crown,
    desc: "Ve todos los chats, acceso total al CRM y LAT, gestión completa de roles",
  },
  {
    value: "admin",
    label: "Admin",
    badge: "bg-red-500/10 text-red-600 border-red-300",
    icon: ShieldCheck,
    desc: "Acceso total a Configuraciones, colaboradores, pipelines y reportes",
  },
  {
    value: "supervisor",
    label: "Supervisor",
    badge: "bg-violet-500/10 text-violet-600 border-violet-300",
    icon: ShieldCheck,
    desc: "Reasignar conversaciones LAT, ver estado de colas, sin editar configuraciones",
  },
  {
    value: "gerente",
    label: "Gerente",
    badge: "bg-amber-500/10 text-amber-600 border-amber-300",
    icon: Briefcase,
    desc: "Ver Configuraciones en solo lectura, ver todo el equipo en gestiones",
  },
  {
    value: "colaborador",
    label: "Colaborador",
    badge: "bg-primary/10 text-primary border-primary/30",
    icon: Users,
    desc: "Sus propias gestiones y conversaciones asignadas, sin acceso a Configuraciones",
  },
  {
    value: "viewer",
    label: "Viewer",
    badge: "bg-muted text-muted-foreground border-border",
    icon: Eye,
    desc: "Solo lectura en gestiones asignadas, sin crear ni editar",
  },
];

export function PermisosConfig({ readonly = false }: { readonly?: boolean }) {
  const queryClient  = useQueryClient();
  const { data: colaboradores = [] } = useAllColaboradores();
  const [saving, setSaving] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    queryClient.invalidateQueries({ queryKey: ["colaboradores-all"] });
  };

  const handleRol = async (id: string, rol: string) => {
    setSaving(id);
    const { error } = await (supabase as any).from("colaboradores").update({ rol }).eq("id", id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    invalidate();
    toast.success("Rol actualizado");
  };

  const handleActivo = async (id: string, activo: boolean) => {
    await (supabase as any).from("colaboradores").update({ activo: !activo }).eq("id", id);
    invalidate();
  };

  const rolCfg = (rol: string) => ROLES.find(r => r.value === rol) ?? ROLES[4];

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Tabla de colaboradores */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Roles por colaborador</h3>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Colaborador</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Cargo</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-44">Rol</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground w-20">Activo</th>
              </tr>
            </thead>
            <tbody>
              {colaboradores.map((c: any, i: number) => {
                const cfg = rolCfg(c.rol);
                const Icon = cfg.icon;
                return (
                  <tr key={c.id} className={`border-b border-border/50 last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                          style={{ backgroundColor: c.color ?? "#6366f1" }}
                        >
                          {c.nombre?.charAt(0) ?? "?"}
                        </span>
                        <div>
                          <p className="font-medium text-foreground text-xs">{c.nombre}</p>
                          <p className="text-[10px] text-muted-foreground">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.cargo ?? "—"}</td>
                    <td className="px-4 py-3">
                      {readonly ? (
                        <Badge variant="outline" className={`text-[10px] ${cfg.badge}`}>
                          <Icon className="w-3 h-3 mr-1" />{cfg.label}
                        </Badge>
                      ) : (
                        <Select
                          value={c.rol ?? "colaborador"}
                          onValueChange={val => handleRol(c.id, val)}
                          disabled={saving === c.id}
                        >
                          <SelectTrigger className="h-7 text-[11px] w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map(r => (
                              <SelectItem key={r.value} value={r.value} className="text-xs">
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={c.activo !== false}
                        onCheckedChange={() => handleActivo(c.id, c.activo !== false)}
                        disabled={readonly}
                        className="scale-75"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Descripción de roles */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Qué puede hacer cada rol</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROLES.map(r => {
            const Icon = r.icon;
            return (
              <div key={r.value} className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={`text-[10px] ${r.badge}`}>
                    <Icon className="w-3 h-3 mr-1" />{r.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
