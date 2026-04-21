import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Search, MessageSquare, Phone as PhoneIcon, Mail, Loader2, UserPlus, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreateClienteDialog } from '@/components/CreateClienteDialog';

type Canal = 'whatsapp' | 'phone' | 'email';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback cuando se crea o reactiva la conversación. */
  onConversacionCreated: (conversacionId: string) => void;
}

/**
 * Modal "Nueva conversación":
 *  - Solo pide CLIENTE + CANAL.
 *  - No pide asunto ni mensaje inicial → el asesor escribe luego desde el chat.
 *  - Si ya existe una conversación del mismo cliente/canal, la reutiliza
 *    (no crea hilos paralelos en WhatsApp) y deja un evento de sistema
 *    "Nueva comunicación iniciada HH:MM" en el hilo.
 */
export function NuevaConversacionDialog({ open, onOpenChange, onConversacionCreated }: Props) {
  const [step, setStep]               = useState<'cliente' | 'canal'>('cliente');
  const [search, setSearch]           = useState('');
  const [clienteId, setClienteId]     = useState<string | null>(null);
  const [clienteData, setClienteData] = useState<any>(null);
  const [canal, setCanal]             = useState<Canal>('whatsapp');
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
    if ((canal === 'whatsapp' || canal === 'phone') && !clienteData.telefono) {
      toast.error('El cliente no tiene teléfono registrado');
      return;
    }
    if (canal === 'email' && !clienteData.email) {
      toast.error('El cliente no tiene correo registrado');
      return;
    }

    setCreating(true);
    try {
      // Buscar conversación existente del mismo cliente/canal (cualquier estado salvo cerrado)
      const { data: existentes } = await (supabase as any)
        .from('lat_conversaciones')
        .select('id, estado, en_foco')
        .eq('cliente_id', clienteId)
        .eq('canal', canal)
        .neq('estado', 'cerrado')
        .order('updated_at', { ascending: false })
        .limit(1);

      let convId: string;
      const ahora = new Date();
      const hhmm = `${ahora.getHours().toString().padStart(2, '0')}:${ahora.getMinutes().toString().padStart(2, '0')}`;

      if (existentes && existentes.length > 0) {
        // ── Reutilizar conversación existente ──
        convId = existentes[0].id;
        await (supabase as any)
          .from('lat_conversaciones')
          .update({
            en_foco: true,
            estado: existentes[0].estado === 'liberado' ? 'abierto' : existentes[0].estado,
            ultima_interaccion: ahora.toISOString(),
          })
          .eq('id', convId);

        // Evento de sistema visible en el hilo
        await (supabase as any).from('lat_mensajes').insert({
          conversacion_id: convId,
          tipo:            'sistema',
          contenido:       `Nueva comunicación iniciada ${hhmm} (${canalLabel(canal)})`,
          estado:          'enviado',
        });
        toast.success('Conversación existente reactivada');
      } else {
        // ── Crear nueva conversación ──
        const nombre = clienteData.nombre_completo ?? clienteData.razon_social ?? '—';
        const tel    = clienteData.telefono ?? null;
        const { data: nueva, error } = await (supabase as any)
          .from('lat_conversaciones')
          .insert({
            cliente_id:        clienteId,
            cliente_nombre:    nombre,
            telefono:          tel,
            canal,
            estado:            'abierto',
            asunto:            null,
            ultimo_mensaje:    `Nueva comunicación iniciada ${hhmm}`,
            prioridad:         'media',
            en_foco:           true,
            ultima_interaccion: ahora.toISOString(),
          })
          .select('id')
          .single();
        if (error) throw error;
        convId = nueva.id;

        // Evento de sistema en hilo nuevo
        await (supabase as any).from('lat_mensajes').insert({
          conversacion_id: convId,
          tipo:            'sistema',
          contenido:       `Nueva comunicación iniciada ${hhmm} (${canalLabel(canal)})`,
          estado:          'enviado',
        });
        toast.success('Conversación creada');
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
                      Si ya hay una conversación de WhatsApp con este cliente, se reutiliza el mismo hilo.
                      Vas a redactar el mensaje desde el chat. Fuera de ventana de 24h se usa plantilla aprobada.
                    </p>
                  )}
                  {canal === 'phone' && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Se abre el hilo de la llamada. Usá el softphone para hacer el call efectivo.
                    </p>
                  )}
                  {canal === 'email' && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Se abre el hilo del correo. Vas a redactar el mensaje desde el chat.
                    </p>
                  )}
                </div>

                <button
                  onClick={handleIniciar}
                  disabled={creating}
                  className="w-full flex items-center justify-center gap-1.5 text-[11px] px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  Abrir conversación
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
