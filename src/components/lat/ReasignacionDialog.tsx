import { useState } from 'react';
import { ArrowRightLeft, Loader2, User } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useColaboradores } from '@/hooks/useSharedQueries';
import { useReasignarConversacion, LatConversacion } from '@/hooks/useLatData';

interface ReasignacionDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversacion: LatConversacion;
  intervenidoPorId: string;
}

export function ReasignacionDialog({
  open,
  onOpenChange,
  conversacion,
  intervenidoPorId,
}: ReasignacionDialogProps) {
  const { data: colaboradores = [] } = useColaboradores();
  const { reasignar, loading } = useReasignarConversacion();

  const [nuevoId, setNuevoId] = useState('');
  const [motivo, setMotivo]   = useState('');

  // Excluir al responsable actual de la lista
  const elegibles = colaboradores.filter(c => c.id !== conversacion.responsable_id);

  async function handleConfirm() {
    if (!nuevoId) return;
    const { ok, error } = await reasignar(
      conversacion.id,
      nuevoId,
      intervenidoPorId,
      motivo.trim() || undefined,
    );
    if (ok) {
      toast.success('Conversación reasignada correctamente');
      setNuevoId('');
      setMotivo('');
      onOpenChange(false);
    } else {
      toast.error(`Error al reasignar: ${error}`);
    }
  }

  const nuevoNombre = colaboradores.find(c => c.id === nuevoId)?.nombre;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowRightLeft className="w-4 h-4 text-primary" />
            Reasignar conversación
          </DialogTitle>
        </DialogHeader>

        {/* Contexto de la conversación */}
        <div className="px-1 py-2 rounded-md bg-muted/50 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="w-3 h-3" />
            <span>
              {conversacion.cliente_nombre ?? 'Cliente sin nombre'} ·{' '}
              <span className="capitalize">{conversacion.canal}</span>
            </span>
          </div>
          {conversacion.responsable_nombre && (
            <p className="text-muted-foreground">
              Asignado a: <span className="text-foreground font-medium">{conversacion.responsable_nombre}</span>
            </p>
          )}
        </div>

        {/* Selector de nuevo asesor */}
        <div className="space-y-1.5">
          <Label className="text-xs">Nuevo asesor</Label>
          <Select value={nuevoId} onValueChange={setNuevoId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Seleccionar asesor..." />
            </SelectTrigger>
            <SelectContent>
              {elegibles.map(c => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: c.color || '#888' }}
                    />
                    {c.nombre}
                    {c.cargo && <span className="text-muted-foreground">· {c.cargo}</span>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Motivo (opcional) */}
        <div className="space-y-1.5">
          <Label className="text-xs">
            Motivo <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <Textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ej: Asesor en pausa, cliente solicitó cambio..."
            rows={2}
            className="text-xs resize-none"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="text-xs gap-1.5"
            onClick={handleConfirm}
            disabled={!nuevoId || loading}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <ArrowRightLeft className="w-3 h-3" />
            )}
            {nuevoNombre ? `Asignar a ${nuevoNombre.split(' ')[0]}` : 'Reasignar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
