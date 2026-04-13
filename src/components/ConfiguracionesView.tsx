import { Settings, Database, Shield, Palette } from "lucide-react";

export function ConfiguracionesView() {
  const sections = [
    { icon: Database, label: "Procesos y etapas", desc: "Configurá los procesos, etapas y reglas de negocio" },
    { icon: Shield, label: "Permisos y roles", desc: "Gestioná usuarios, roles y permisos de acceso" },
    { icon: Palette, label: "Personalización", desc: "Ajustá colores, logo y preferencias visuales" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card">
        <Settings className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Configuraciones</h2>
      </div>
      <div className="flex-1 p-6">
        <div className="grid gap-4 max-w-2xl">
          {sections.map((s) => (
            <div key={s.label} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <s.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
