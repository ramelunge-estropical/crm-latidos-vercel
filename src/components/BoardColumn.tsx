import { Plus, ShieldCheck } from "lucide-react";
import { Droppable } from "@hello-pangea/dnd";
import { GestionCard } from "./GestionCard";

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
  codigo?: string | null;
  area_id?: string | null;
  cliente_nombre?: string | null;
}

interface BoardColumnProps {
  stageId: string;
  name: string;
  globalStatus: string;
  gestiones: Gestion[];
  progressMap?: Record<string, number>;
  taskCountMap?: Record<string, { done: number; total: number }>;
  areasMap?: Record<string, { nombre: string; color: string }>;
  hasRules?: boolean;
  canAdd?: boolean;
  onAddGestion: () => void;
  onEditGestion: (g: Gestion) => void;
  onMarkDone?: (gestionId: string) => void;
}

const statusColors: Record<string, string> = {
  to_do:  "bg-status-todo",
  doing:  "bg-status-doing",
  review: "bg-status-review",
  done:   "bg-status-done",
};

const nameTranslations: Record<string, string> = {
  "to do":       "Por hacer",
  "todo":        "Por hacer",
  "to_do":       "Por hacer",
  "backlog":     "Por hacer",
  "new":         "Por hacer",
  "doing":       "En curso",
  "in progress": "En curso",
  "in_progress": "En curso",
  "wip":         "En curso",
  "active":      "En curso",
  "review":      "En revisión",
  "in review":   "En revisión",
  "in_review":   "En revisión",
  "testing":     "En revisión",
  "done":        "Completo",
  "completed":   "Completo",
  "finished":    "Completo",
  "closed":      "Completo",
};

// globalStatus is canonical — use as fallback when name has no translation
const statusTranslations: Record<string, string> = {
  to_do:  "Por hacer",
  doing:  "En curso",
  review: "En revisión",
  done:   "Completo",
};

export function BoardColumn({
  stageId, name, globalStatus, gestiones, progressMap,
  taskCountMap, areasMap, hasRules, canAdd = true,
  onAddGestion, onEditGestion, onMarkDone,
}: BoardColumnProps) {
  const displayName = nameTranslations[name.toLowerCase()] ?? statusTranslations[globalStatus] ?? name;
  const isDoneColumn = globalStatus === "done";

  // Done cards at the bottom within the column
  const sorted = isDoneColumn ? gestiones : [
    ...gestiones.filter(g => g.stage_id !== undefined), // all in order
  ];

  return (
    <div className="flex flex-col w-72 flex-shrink-0 bg-muted/50 rounded-xl">
      <div className="flex items-center gap-2 px-3 py-3">
        <div className={`w-2.5 h-2.5 rounded-full ${statusColors[globalStatus] || "bg-muted-foreground"}`} />
        <h3 className="text-sm font-semibold text-foreground">{displayName}</h3>
        {hasRules && <ShieldCheck className="w-3.5 h-3.5 text-primary/60" />}
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
            {sorted.map((g, i) => {
              const area  = g.area_id ? areasMap?.[g.area_id] : undefined;
              const tasks = taskCountMap?.[g.id];
              return (
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
                  codigo={g.codigo}
                  areaNombre={area?.nombre}
                  areaColor={area?.color}
                  clienteNombre={g.cliente_nombre}
                  tasksDone={tasks?.done}
                  tasksTotal={tasks?.total}
                  isDone={isDoneColumn}
                  onClick={() => onEditGestion(g)}
                  onMarkDone={onMarkDone ? () => onMarkDone(g.id) : undefined}
                />
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {canAdd && (
        <button
          onClick={onAddGestion}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-b-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> Agregar gestión
        </button>
      )}
    </div>
  );
}
