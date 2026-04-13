import { Calendar, User, Tag } from "lucide-react";
import { Draggable } from "@hello-pangea/dnd";
import { Progress } from "@/components/ui/progress";

interface GestionCardProps {
  id: string;
  index: number;
  title: string;
  description?: string | null;
  priority: string;
  dueDate?: string | null;
  responsable?: string | null;
  type?: string | null;
  subtype?: string | null;
  progress?: number;
  onClick: () => void;
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-priority-urgent/15 text-priority-urgent" },
  high: { label: "Alta", className: "bg-priority-high/15 text-priority-high" },
  medium: { label: "Media", className: "bg-primary/10 text-primary" },
  low: { label: "Baja", className: "bg-muted text-muted-foreground" },
};

const typeConfig: Record<string, { label: string; className: string }> = {
  comercial: { label: "Comercial", className: "bg-blue-500/10 text-blue-600" },
  proyecto: { label: "Proyecto", className: "bg-violet-500/10 text-violet-600" },
  operativa: { label: "Operativa", className: "bg-amber-500/10 text-amber-600" },
  caso: { label: "Caso", className: "bg-emerald-500/10 text-emerald-600" },
};

export function GestionCard({ id, index, title, description, priority, dueDate, responsable, type, subtype, progress, onClick }: GestionCardProps) {
  const pConfig = priorityConfig[priority] || priorityConfig.medium;
  const tConfig = type ? typeConfig[type] : null;

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
          {/* Type badge */}
          {tConfig && (
            <div className="flex items-center gap-1 mb-1.5">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${tConfig.className}`}>
                <Tag className="w-2.5 h-2.5" />
                {tConfig.label}
              </span>
              {subtype && (
                <span className="text-[10px] text-muted-foreground">· {subtype}</span>
              )}
            </div>
          )}

          <h4 className="text-sm font-medium text-card-foreground leading-snug mb-1">{title}</h4>

          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{description}</p>
          )}

          {/* Progress bar */}
          {progress !== undefined && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-muted-foreground">Progreso</span>
                <span className="text-[10px] font-medium text-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
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
