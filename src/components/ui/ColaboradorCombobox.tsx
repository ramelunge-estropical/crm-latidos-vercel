import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ColaboradorOption {
  id: string;
  nombre: string;
  color: string;
  cargo?: string | null;
}

interface ColaboradorComboboxProps {
  value: string;                        // selected id, or "none" / "all"
  onValueChange: (id: string) => void;
  colaboradores: ColaboradorOption[];
  emptyLabel?: string;                  // label for the null option (default "Sin asignar")
  showEmpty?: boolean;                  // whether to show the null option (default true)
  placeholder?: string;                 // trigger placeholder
  className?: string;
  triggerClassName?: string;
  size?: "sm" | "default";
  disabled?: boolean;
}

export function ColaboradorCombobox({
  value,
  onValueChange,
  colaboradores,
  emptyLabel = "Sin asignar",
  showEmpty = true,
  placeholder = "Seleccionar...",
  className,
  triggerClassName,
  size = "default",
  disabled = false,
}: ColaboradorComboboxProps) {
  const [open, setOpen] = useState(false);

  const NULL_VALUE = "__none__";
  const selected = colaboradores.find(c => c.id === value);
  const isNull = !selected;

  const handleSelect = (id: string) => {
    onValueChange(id === NULL_VALUE ? NULL_VALUE : id);
    setOpen(false);
  };

  const isSm = size === "sm";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "justify-between font-normal",
            isSm ? "h-6 text-[11px] px-2 gap-1" : "h-9 text-sm px-3 gap-2",
            triggerClassName
          )}
        >
          {selected ? (
            <span className="flex items-center gap-1.5 truncate min-w-0">
              <span
                className={cn(
                  "rounded-full inline-flex items-center justify-center text-white font-bold shrink-0",
                  isSm ? "w-3.5 h-3.5 text-[7px]" : "w-5 h-5 text-[9px]"
                )}
                style={{ backgroundColor: selected.color }}
              >
                {selected.nombre.charAt(0)}
              </span>
              <span className="truncate">{selected.nombre}</span>
            </span>
          ) : (
            <span className="text-muted-foreground truncate">{isNull && value !== NULL_VALUE ? placeholder : emptyLabel}</span>
          )}
          <ChevronsUpDown className={cn("shrink-0 opacity-50", isSm ? "w-3 h-3" : "w-4 h-4")} />
        </Button>
      </PopoverTrigger>

      <PopoverContent className={cn("p-0 w-[var(--radix-popover-trigger-width)] min-w-[200px]", className)} align="start">
        <Command>
          <div className="flex items-center border-b px-3">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0 mr-2" />
            <CommandInput placeholder="Buscar..." className="h-8 text-xs border-0 focus:ring-0 p-0" />
          </div>
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              Sin resultados
            </CommandEmpty>
            <CommandGroup>
              {showEmpty && (
                <CommandItem
                  value={NULL_VALUE}
                  onSelect={() => handleSelect(NULL_VALUE)}
                  className="text-xs text-muted-foreground"
                >
                  <Check className={cn("mr-2 w-3.5 h-3.5", isNull ? "opacity-100" : "opacity-0")} />
                  {emptyLabel}
                </CommandItem>
              )}
              {colaboradores.map(c => (
                <CommandItem
                  key={c.id}
                  value={`${c.nombre} ${c.cargo ?? ""}`}
                  onSelect={() => handleSelect(c.id)}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 w-3.5 h-3.5 shrink-0", value === c.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex items-center gap-1.5 truncate min-w-0">
                    <span
                      className="w-4 h-4 rounded-full inline-flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                      style={{ backgroundColor: c.color }}
                    >
                      {c.nombre.charAt(0)}
                    </span>
                    <span className="truncate">{c.nombre}</span>
                    {c.cargo && <span className="text-muted-foreground shrink-0">· {c.cargo}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
