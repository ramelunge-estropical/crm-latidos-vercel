import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Search, MessageSquare, Phone as PhoneIcon, Mail, Loader2, UserPlus, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreateClienteDialog } from '@/components/CreateClienteDialog';

type Canal = 'whatsapp' | 'phone' | 'email';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback cuando se inicia exitosamente; conversacionId puede ser null para llamada/email sin conversación */
  onConversacionCreated: (conversacionId: string) => void;
}

export function NuevaConversacionDialog({ open, onOpenChange, onConversacionCreated }: Props) {
  const [step, setStep]               = useState<'cliente' | 'canal'>('cliente');
  const [search, setSearch]           = useState('');
  const [clienteId, setClienteId]     = useState<string | null>(null);
  const [clienteData, setClienteData] = useState<any>(null);
  const [canal, setCanal]             = useState<Canal>('whatsapp');
  const [asunto, setAsunto]           = useState('');
  const [mensaje, setMensaje]         = useState('');
  const [creating, setCreating]       = useState(false);
  const [showCrearCliente, setShowCrearCliente] = useState(false);

  const { data: clientes = [], isLoading: searching } = useQuery<any[]>({
    queryKey: ['nueva-conv-search', search],
    queryFn: async () => {
      if (search.length < 2) return [];
      const q = search;
      const { data } = await (supabase as any)
        .from('clientes')
        .select('id, nombre_completo, razon_social, telefono, email, documento_numero, nit')
        .or(`nombre_completo.ilike.%${q}%,razon_social.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%,documento_numero.ilike.%${q}%,nit.ilike.%${q}%`)
        .limit(10);
      return data ?? [];
    },
    enabled: open && search.length >= 2,
    staleTime: 5_000,
  });

  const reset = () => {
    setStep('cliente');
    setSearch('');
    setClienteId(null);
    setClienteData(null);
    setCanal('whatsapp');
    setAsunto('');
    setMensaje('');
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const seleccionarCliente = (c: any) => {
    setClienteId(c.id);
    setClienteData(c);
    setStep('canal');
    if (!c.telefono && !c.email) {
      toast.warning('El cliente no tiene teléfono ni correo registrado');
    }
  };

  const handleIniciar = async () => {
    if (!clienteId || !clienteData) return;
    if (canal === 'whatsapp' && !clienteData.telefono) {
      toast.error('El cliente no tiene teléfono registrado');
      return;
    }
    if (canal === 'phone' && !clienteData.telefono) {
      toast.error('El cliente no tiene teléfono registrado');
      return;
    }
    if (canal === 'email' && !clienteData.email) {
      toast.error('El cliente no tiene correo registrado');
      return;
    }

    setCreating(true);
    try {
      // Buscar conversación abierta existente del mismo cliente y canal
      const { data: existentes } = await (supabase as any)
        .from('lat_conversaciones')
        .select('id, estado')
        .eq('cliente_id', clienteId)
        .eq('canal', canal)
        .neq('estado', 'cerrado')
        .order('updated_at', { ascending: false })
        .limit(1);

      let convId: string;

      if (existentes && existentes.length > 0) {
        convId = existentes[0].id;
        await (supabase as any)
          .from('lat_conversaciones')
          .update({
            en_foco: true,
            estado: existentes[0].estado === 'liberado' ? 'abierto' : existentes[0].estado,
            ...(asunto ? { asunto } : {}),
            ultima_interaccion: new Date().toISOString(),
          })
          .eq('id', convId);
        toast.success('Conversación existente reactivada');
      } else {
        const nombre = clienteData.nombre_completo ?? clienteData.razon_social ?? '—';
        const tel    = clienteData.telefono ?? null;
        const { data: nueva, error } = await (supabase as any)
          .from('lat_conversaciones')
          .insert({
            cliente_id:       clienteId,
            cliente_nombre:   nombre,
            telefono:         tel,
            canal,
            estado:           'abierto',
            asunto:           asunto || `Nuevo contacto outbound (${canalLabel(canal)})`,
            ultimo_mensaje:   mensaje ? mensaje.slice(0, 100) : '(conversación iniciada por el asesor)',
            prioridad:        'media',
            en_foco:          true,
            ultima_interaccion: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (error) throw error;
        convId = nueva.id;
        toast.success('Conversación creada');
      }

      // Mensaje sistema con la acción outbound
      if (canal === 'phone') {
        await (supabase as any).from('lat_mensajes').insert({
          conversacion_id: convId,
          tipo:            'sistema',
          contenido:       `Llamada saliente iniciada por el asesor${mensaje ? ` — Motivo: ${mensaje}` : ''}`,
          estado:          'enviado',
        });
      } else if (canal === 'email') {
        await (supabase as any).from('lat_mensajes').insert({
          conversacion_id: convId,
          tipo:            'outbound',
          contenido:       `[Email a ${clienteData.email}]${asunto ? `\nAsunto: ${asunto}` : ''}\n\n${mensaje}`,
          estado:          'enviado',
        });
      } else if (canal === 'whatsapp' && mensaje) {
        // Guardar como nota interna para que el asesor pueda mandarlo desde el chat
        await (supabase as any).from('lat_mensajes').insert({
          conversacion_id: convId,
          tipo:            'nota_interna',
          contenido:       `Borrador inicial preparado por el asesor:\n\n${mensaje}`,
          estado:          'enviado',
        });
      }

      onConversacionCreated(convId);
      handleClose();
    } catch (e: any) {
      toast.error(e.message ?? 'Error al iniciar conversación');
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={handleClose}>
        <div onClick={e => e.stopPropagation()} className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Nueva conversación</h2>
            </div>
            <button onClick={handleClose} className="p-1 rounded hover:bg-accent/50">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Stepper */}
          <div className="px-4 pt-3 flex items-center gap-2 text-[10px]">
            <span className={`px-2 py-0.5 rounded-full ${step === 'cliente' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1. Cliente</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className={`px-2 py-0.5 rounded-full ${step === 'canal' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2. Canal</span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
            {step === 'cliente' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-foreground">Buscar cliente</label>
                  <div className="relative mt-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Nombre, teléfono, CI o email..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full bg-muted/50 text-xs rounded-md pl-8 pr-3 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>

                {searching && search.length >= 2 && (
                  <div className="flex justify-center py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}

                {clientes.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden">
                    {clientes.map(c => (
                      <button
                        key={c.id}
                        onClick={() => seleccionarCliente(c)}
                        className="w-full text-left px-3 py-2 hover:bg-accent/50 border-b border-border/50 last:border-0"
                      >
                        <p className="text-[12px] font-medium truncate">{c.nombre_completo ?? c.razon_social}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {c.telefono ?? c.email ?? (c.documento_numero ? `CI ${c.documento_numero}` : '—')}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {search.length >= 2 && !searching && clientes.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-2">Sin resultados</p>
                )}

                <div className="pt-2 border-t border-border">
                  <button
                    onClick={() => setShowCrearCliente(true)}
                    className="w-full flex items-center justify-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Crear nuevo cliente
                  </button>
                </div>
              </div>
            )}

            {step === 'canal' && clienteData && (
              <div className="space-y-3">
                <div className="bg-muted/30 rounded-lg p-2.5">
                  <p className="text-[11px] font-medium">{clienteData.nombre_completo ?? clienteData.razon_social}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {clienteData.telefono ?? '—'} · {clienteData.email ?? '—'}
                  </p>
                  <button onClick={() => setStep('cliente')} className="text-[10px] text-primary underline mt-1">
                    Cambiar cliente
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-foreground">Canal</label>
                  <div className="grid grid-cols-3 gap-1.5 mt-1">
                    {(['whatsapp', 'phone', 'email'] as Canal[]).map(c => {
                      const Icon = c === 'whatsapp' ? MessageSquare : c === 'phone' ? PhoneIcon : Mail;
                      const disabled = (c === 'whatsapp' || c === 'phone') ? !clienteData.telefono : !clienteData.email;
                      return (
                        <button
                          key={c}
                          onClick={() => !disabled && setCanal(c)}
                          disabled={disabled}
                          className={`flex flex-col items-center gap-1 p-2 rounded-md border transition-colors ${
                            canal === c
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:bg-accent/30 text-muted-foreground'
                          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="text-[10px]">{canalLabel(c)}</span>
                        </button>
                      );
                    })}
                  </div>
                  {canal === 'whatsapp' && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Si el cliente está fuera de ventana de 24h, vas a poder enviar una plantilla aprobada desde el chat.
                    </p>
                  )}
                  {canal === 'phone' && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Se registra una llamada saliente. Usá el softphone para hacer el call efectivo.
                    </p>
                  )}
                  {canal === 'email' && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Se registra el envío en el historial. El email externo se envía desde tu cliente de correo habitual.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-medium text-foreground">Asunto</label>
                  <input
                    type="text"
                    value={asunto}
                    onChange={e => setAsunto(e.target.value)}
                    placeholder="Motivo del contacto..."
                    className="w-full mt-1 bg-muted/50 text-xs rounded-md px-2.5 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-foreground">
                    {canal === 'phone' ? 'Motivo de la llamada' : 'Mensaje inicial'}{canal === 'whatsapp' ? ' (opcional)' : ''}
                  </label>
                  <textarea
                    rows={3}
                    value={mensaje}
                    onChange={e => setMensaje(e.target.value)}
                    placeholder={canal === 'phone' ? 'Sobre qué llamás...' : 'Texto del mensaje...'}
                    className="w-full mt-1 bg-muted/50 text-xs rounded-md px-2.5 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>

                <button
                  onClick={handleIniciar}
                  disabled={creating}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  Iniciar conversación
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateClienteDialog
        open={showCrearCliente}
        onOpenChange={setShowCrearCliente}
        onCreated={(id, nombre, telefono, email) => {
          setClienteId(id);
          setClienteData({ id, nombre_completo: nombre, telefono, email });
          setStep('canal');
        }}
      />
    </>
  );
}

function canalLabel(c: Canal): string {
  return c === 'whatsapp' ? 'WhatsApp' : c === 'phone' ? 'Llamada' : 'Email';
}
