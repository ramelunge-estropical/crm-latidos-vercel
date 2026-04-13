import { Calendar, User } from "lucide-react";
import { Draggable } from "@hello-pangea/dnd";

interface GestionCardProps {
  id: string;
  index: number;
  title: string;
  description?: string | null;
  priority: string;
  dueDate?: string | null;
  responsable?: string | null;
  onClick: () => void;
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-priority-urgent/15 text-priority-urgent" },
  high: { label: "Alta", className: "bg-priority-high/15 text-priority-high" },
  medium: { label: "Media", className: "bg-primary/10 text-primary" },
  low: { label: "Baja", className: "bg-muted text-muted-foreground" },
};

export function GestionCard({ id, index, title, description, priority, dueDate, responsable, onClick }: GestionCardProps) {
  const pConfig = priorityConfig[priority] || priorityConfig.medium;

  return (
    <Draggable draggableId={id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`group bg-card rounded-lg border p-3 shadow-sm cursor-pointer transition-all ${
            snapshot.isDragging
              ? "shadow-lg border-primary/40 rotate-[2deg]"
              : "border-border hover:shadow-md hover:border-primary/30"
          }`}
        >
          <h4 className="text-sm font-medium text-card-foreground leading-snug mb-1">{title}</h4>

          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{description}</p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${pConfig.className}`}>
              {pConfig.label}
            </span>

            {dueDate && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {new Date(dueDate).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
              </span>
            )}

            {responsable && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-2.5 h-2.5 text-primary" />
                </div>
                <span className="max-w-[60px] truncate">{responsable}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
