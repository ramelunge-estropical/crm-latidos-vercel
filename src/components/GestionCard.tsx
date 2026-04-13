import { Calendar, User } from "lucide-react";

interface GestionCardProps {
  title: string;
  description?: string | null;
  priority: string;
  dueDate?: string | null;
  ownerName?: string;
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgente", className: "bg-priority-urgent/15 text-priority-urgent" },
  high: { label: "Alta", className: "bg-priority-high/15 text-priority-high" },
  medium: { label: "Media", className: "bg-primary/10 text-primary" },
  low: { label: "Baja", className: "bg-muted text-muted-foreground" },
};

export function GestionCard({
  title,
  description,
  priority,
  dueDate,
  ownerName,
}: GestionCardProps) {
  const pConfig = priorityConfig[priority] || priorityConfig.medium;

  return (
    <div className="group bg-card rounded-lg border border-border p-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-sm font-medium text-card-foreground leading-snug">{title}</h4>
      </div>

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

        {ownerName && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
            <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-2.5 h-2.5 text-primary" />
            </div>
          </span>
        )}
      </div>
    </div>
  );
}
