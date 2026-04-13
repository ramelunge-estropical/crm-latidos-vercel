import { Plus } from "lucide-react";
import { GestionCard } from "./GestionCard";

interface Gestion {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
}

interface BoardColumnProps {
  name: string;
  globalStatus: string;
  gestiones: Gestion[];
  onAddGestion: () => void;
}

const statusColors: Record<string, string> = {
  todo: "bg-status-todo",
  planned: "bg-status-planned",
  doing: "bg-status-doing",
  review: "bg-status-review",
  done: "bg-status-done",
};

export function BoardColumn({ name, globalStatus, gestiones, onAddGestion }: BoardColumnProps) {
  return (
    <div className="flex flex-col w-72 flex-shrink-0 bg-muted/50 rounded-xl">
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 py-3">
        <div className={`w-2.5 h-2.5 rounded-full ${statusColors[globalStatus] || "bg-muted-foreground"}`} />
        <h3 className="text-sm font-semibold text-foreground">{name}</h3>
        <span className="ml-auto text-xs font-medium text-muted-foreground bg-background rounded-full px-2 py-0.5">
          {gestiones.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-2 min-h-[200px]">
        {gestiones.map((g) => (
          <GestionCard
            key={g.id}
            title={g.title}
            description={g.description}
            priority={g.priority}
            dueDate={g.due_date}
          />
        ))}
      </div>

      {/* Add button */}
      <button
        onClick={onAddGestion}
        className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-b-xl transition-colors"
      >
        <Plus className="w-4 h-4" />
        Agregar gestión
      </button>
    </div>
  );
}
