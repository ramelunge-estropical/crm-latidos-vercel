import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  User, Phone as PhoneIcon, Mail, ChevronDown, ChevronRight,
  ClipboardList, MapPin, CreditCard, Building2, Plus, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LatConversacion } from '@/hooks/useLatData';

interface ClienteDBPanelProps {
  clienteId: string;
  conversacion: LatConversacion;
  onCrearGestion?: () => void;
}

function Section({ title, icon: Icon, defaultOpen = true, children }: {
  title: string; icon: typeof User; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-accent/30 transition-colors"
      >
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide flex-1 text-left">{title}</span>
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value?: string | null; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between py-0.5 gap-2">
      <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>
      <span className={`text-[10px] font-medium text-right ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

const statusDot: Record<string, string> = {
  to_do:  'bg-status-todo',
  doing:  'bg-status-doing',
  review: 'bg-status-review',
  done:   'bg-status-done',
};

const priorityCfg: Record<string, { label: string; className: string }> = {
  urgent: { label: 'Urgente', className: 'text-red-600'    },
  high:   { label: 'Alta',    className: 'text-orange-500' },
  medium: { label: 'Media',   className: 'text-primary'    },
  low:    { label: 'Baja',    className: 'text-muted-foreground' },
};

export function ClienteDBPanel({ clienteId, conversacion, onCrearGestion }: ClienteDBPanelProps) {
  const { data: cliente } = useQuery<any>({
    queryKey: ['cliente-db-panel', clienteId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .single();
      return data ?? null;
    },
    enabled: !!clienteId,
  });

  const { data: gestiones = [] } = useQuery<any[]>({
    queryKey: ['gestiones-panel', clienteId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('gestiones')
        .select('id, title, priority, updated_at, pipeline_stages(name, global_status), processes(name)')
        .eq('cliente_id', clienteId)
        .order('updated_at', { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!clienteId,
  });

  if (!cliente) return null;

  const nombre = cliente.nombre_completo ?? cliente.razon_social ?? '—';
  const initials = nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  const activeGestiones = gestiones.filter(g => g.pipeline_stages?.global_status !== 'done');

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-sm font-semibold text-primary">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{nombre}</p>
            <p className="text-[10px] text-muted-foreground">Cliente 360</p>
          </div>
        </div>
      </div>

      {/* Datos clave */}
      <Section title="Datos clave" icon={User}>
        <div className="space-y-0.5">
          <InfoRow label="Tipo" value={cliente.tipo_cliente} highlight />
          <InfoRow label="Teléfono" value={cliente.telefono} />
          <InfoRow label="Correo" value={cliente.email} />
          <InfoRow label="CI / NIT" value={cliente.documento_numero ?? cliente.nit} />
          <InfoRow label="Ciudad" value={cliente.ciudad} />
          <InfoRow label="País" value={cliente.pais} />
          <InfoRow label="Estado" value={cliente.estado} />
          <InfoRow label="Asesor" value={cliente.asesor_nombre} />
        </div>
      </Section>

      {/* Caso actual */}
      <Section title="Caso actual" icon={ClipboardList}>
        <div className="space-y-0.5">
          <InfoRow label="Asunto" value={conversacion.asunto} />
          <InfoRow label="Estado" value={conversacion.estado?.replace('_', ' ')} />
          <InfoRow label="Prioridad" value={conversacion.prioridad} highlight={conversacion.prioridad === 'urgente' || conversacion.prioridad === 'alta'} />
          <InfoRow label="Próxima acción" value={conversacion.proxima_accion} />
          {conversacion.ventana_whatsapp && (
            <InfoRow
              label="Ventana WPP"
              value={new Date(conversacion.ventana_whatsapp) > new Date() ? 'Activa' : 'Expirada'}
              highlight={new Date(conversacion.ventana_whatsapp) > new Date()}
            />
          )}
        </div>
      </Section>

      {/* Gestiones */}
      <Section title={`Gestiones (${gestiones.length})`} icon={ClipboardList} defaultOpen={true}>
        {gestiones.length === 0 ? (
          <p className="text-[11px] text-muted-foreground py-2">Sin gestiones asociadas.</p>
        ) : (
          <div className="space-y-2">
            {gestiones.map((g: any) => {
              const status = g.pipeline_stages?.global_status ?? 'to_do';
              const pCfg = priorityCfg[g.priority] ?? priorityCfg.medium;
              return (
                <div key={g.id} className="flex items-start gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${statusDot[status] ?? 'bg-muted'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium truncate">{g.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {g.processes?.name}{g.pipeline_stages?.name ? ` · ${g.pipeline_stages.name}` : ''}
                      <span className={`ml-1.5 ${pCfg.className}`}>{pCfg.label}</span>
                    </p>
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {format(new Date(g.updated_at), 'dd MMM', { locale: es })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <button
          onClick={onCrearGestion}
          className="mt-2 w-full flex items-center justify-center gap-1 text-[10px] text-primary border border-primary/30 rounded-lg py-1 hover:bg-primary/5 transition-colors"
        >
          <Plus className="w-3 h-3" /> Nueva gestión
        </button>
      </Section>

      {/* Info adicional */}
      {(cliente.profesion || cliente.estado_civil || cliente.nacionalidad) && (
        <Section title="Perfil personal" icon={CreditCard} defaultOpen={false}>
          <div className="space-y-0.5">
            <InfoRow label="Profesión" value={cliente.profesion} />
            <InfoRow label="Estado civil" value={cliente.estado_civil} />
            <InfoRow label="Nacionalidad" value={cliente.nacionalidad} />
            <InfoRow label="Fecha nac." value={cliente.fecha_nacimiento} />
          </div>
        </Section>
      )}

      {(cliente.razon_social || cliente.nit) && (
        <Section title="Empresa" icon={Building2} defaultOpen={false}>
          <div className="space-y-0.5">
            <InfoRow label="Razón social" value={cliente.razon_social} />
            <InfoRow label="NIT" value={cliente.nit} />
            <InfoRow label="Contacto" value={cliente.contacto_nombre} />
            <InfoRow label="Cargo" value={cliente.contacto_cargo} />
          </div>
        </Section>
      )}

      {cliente.notas_rapidas && (
        <Section title="Notas" icon={MapPin} defaultOpen={false}>
          <p className="text-[11px] text-foreground leading-relaxed">{cliente.notas_rapidas}</p>
        </Section>
      )}

      {/* Link a Cliente 360 completo */}
      <div className="px-4 py-3 mt-auto">
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('navigate-to-cliente360', { detail: { clienteId } }));
          }}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground border border-border rounded-lg py-1.5 hover:bg-accent/50 transition-colors"
        >
          <ExternalLink className="w-3 h-3" /> Ver perfil completo
        </button>
      </div>
    </div>
  );
}
