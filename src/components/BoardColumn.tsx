import { Plus } from "lucide-react";
import { Droppable } from "@hello-pangea/dnd";
import { GestionCard } from "./GestionCard";
import { ShieldCheck } from "lucide-react";

interface Gestion {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  responsable_nombre: string | null;
  owner_id: string | null;
  stage_id: string;
  type: string | null;
  subtype: string | null;
}

interface BoardColumnProps {
  stageId: string;
  name: string;
  globalStatus: string;
  gestiones: Gestion[];
  progressMap?: Record<string, number>;
  hasRules?: boolean;
  onAddGestion: () => void;
  onEditGestion: (g: Gestion) => void;
}

const statusColors: Record<string, string> = {
  todo: "bg-status-todo",
  planned: "bg-status-planned",
  doing: "bg-status-doing",
  review: "bg-status-review",
  done: "bg-status-done",
};

export function BoardColumn({ stageId, name, globalStatus, gestiones, progressMap, hasRules, onAddGestion, onEditGestion }: BoardColumnProps) {
  return (
    <div className="flex flex-col w-72 flex-shrink-0 bg-muted/50 rounded-xl">
      <div className="flex items-center gap-2 px-3 py-3">
        <div className={`w-2.5 h-2.5 rounded-full ${statusColors[globalStatus] || "bg-muted-foreground"}`} />
        <h3 className="text-sm font-semibold text-foreground">{name}</h3>
        {hasRules && (
          <ShieldCheck className="w-3.5 h-3.5 text-primary/60" title="Tiene reglas de proceso" />
        )}
        <span className="ml-auto text-xs font-medium text-muted-foreground bg-background rounded-full px-2 py-0.5">
          {gestiones.length}
        </span>
      </div>

      <Droppable droppableId={stageId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-2 min-h-[120px] transition-colors rounded-lg mx-1 ${
              snapshot.isDraggingOver ? "bg-primary/5" : ""
            }`}
          >
            {gestiones.map((g, i) => (
              <GestionCard
                key={g.id}
                id={g.id}
                index={i}
                title={g.title}
                description={g.description}
                priority={g.priority}
                dueDate={g.due_date}
                responsable={g.responsable_nombre}
                type={g.type}
                subtype={g.subtype}
                progress={progressMap?.[g.id]}
                onClick={() => onEditGestion(g)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

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
