import { Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function Cliente360View() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Cliente 360</h2>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." className="pl-8 h-8 text-xs" />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Vista 360° del cliente</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Acá vas a poder ver todas las gestiones, actividades, comunicaciones y documentos asociados a cada cliente en un solo lugar.
          </p>
        </div>
      </div>
    </div>
  );
}
