import { useState } from 'react';
import {
  User, Phone as PhoneIcon, Mail, Star, MessageSquare,
  Sparkles, History, ClipboardCheck, ChevronDown, ChevronRight,
  CheckCircle2, Circle, AlertTriangle, FileText, CreditCard,
  Shield, Target, Users, Globe, Briefcase, Brain
} from 'lucide-react';
import {
  Cliente, Conversacion, getIntereses, getActividadesCliente,
  getCondicionesCierre, getTareasCliente, getLlamadasCliente,
  estadoCanales
} from '@/data/latMockData';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Cliente360Props {
  cliente: Cliente;
  conversacion: Conversacion;
}

function Section({ title, icon: Icon, defaultOpen = true, children, badge }: {
  title: string; icon: typeof User; defaultOpen?: boolean; children: React.ReactNode; badge?: React.ReactNode;
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
        {badge}
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between py-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-[10px] font-medium text-right max-w-[60%] ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

export function Cliente360Panel({ cliente, conversacion }: Cliente360Props) {
  const intereses = getIntereses(cliente.id);
  const actividades = getActividadesCliente(cliente.id);
  const condiciones = getCondicionesCierre(conversacion.id);
  const tareasCliente = getTareasCliente(cliente.id);
  const llamadasCliente = getLlamadasCliente(cliente.id);

  const completadas = condiciones.filter(c => c.completada).length;
  const totalCondiciones = condiciones.length;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">
              {cliente.nombre.split(' ').map(n => n[0]).slice(0, 2).join('')}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{cliente.nombre}</p>
            <p className="text-[10px] text-muted-foreground">Cliente 360</p>
          </div>
        </div>
      </div>

      {/* 1. Datos clave */}
      <Section title="Datos clave" icon={User}>
        <div className="space-y-0.5">
          <InfoRow label="Teléfono" value={cliente.telefono} />
          <InfoRow label="Correo" value={cliente.correo} />
          <InfoRow label="Ciudad" value={cliente.ciudad} />
          <InfoRow label="Canal preferido" value={cliente.canalPreferido} />
          <InfoRow label="Tipo" value={cliente.tipoCliente} highlight />
          <InfoRow label="Estado" value={cliente.estadoCliente} />
          <InfoRow label="Asesor" value={cliente.asesor} />
        </div>
      </Section>

      {/* 2. Caso actual */}
      <Section title="Caso actual" icon={Target}>
        <div className="space-y-0.5">
          <InfoRow label="Motivo" value={conversacion.asunto} />
          <InfoRow label="Tipo" value={conversacion.tipoGestion} />
          <InfoRow label="Estado" value={conversacion.estado.replace('_', ' ')} />
          <InfoRow label="Prioridad" value={conversacion.prioridad} highlight={conversacion.prioridad === 'urgente' || conversacion.prioridad === 'alta'} />
          <InfoRow label="Próxima acción" value={conversacion.proximaAccion} />
          {conversacion.vencimiento && (
            <InfoRow label="Vencimiento" value={formatDistanceToNow(conversacion.vencimiento, { addSuffix: true, locale: es })} highlight />
          )}
        </div>
      </Section>

      {/* 3. Resumen inteligente */}
      <Section title="Resumen inteligente" icon={Brain} defaultOpen={true}>
        <div className="bg-primary/5 rounded-lg p-2.5 text-[11px] text-foreground leading-relaxed space-y-1.5">
          {conversacion.id === 'conv1' && <>
            <p><strong>Quién:</strong> María González, clienta premium. Viaja en pareja.</p>
            <p><strong>Qué busca:</strong> Luna de miel en Maldivas, junio 2025. Interés específico en Soneva Fushi con hidroavión.</p>
            <p><strong>Etapa:</strong> Evaluación de cotización. Alta probabilidad de cierre.</p>
            <p><strong>Siguiente paso:</strong> Confirmar disponibilidad junio y enviar cotización actualizada.</p>
          </>}
          {conversacion.id === 'conv5' && <>
            <p><strong>Quién:</strong> Patricia Flores, cliente nueva. Referida por amiga.</p>
            <p><strong>Qué busca:</strong> Boda destino Los Cabos, ~40 personas, marzo 2026.</p>
            <p><strong>Etapa:</strong> Primer contacto. Necesita respuesta rápida.</p>
            <p><strong>Siguiente paso:</strong> Responder inmediatamente, agendar llamada de descubrimiento.</p>
          </>}
          {conversacion.id === 'conv4' && <>
            <p><strong>Quién:</strong> Carlos Pérez, cliente VIP. Relación de largo plazo.</p>
            <p><strong>Qué busca:</strong> Resolución urgente de cambio de vuelo no procesado.</p>
            <p><strong>Etapa:</strong> Reclamo activo. Riesgo de pérdida de cliente.</p>
            <p><strong>Siguiente paso:</strong> Confirmar resolución con aerolínea en máximo 2 horas.</p>
          </>}
          {!['conv1', 'conv5', 'conv4'].includes(conversacion.id) && <>
            <p><strong>Quién:</strong> {cliente.nombre}, {cliente.tipoCliente}.</p>
            <p><strong>Gestión:</strong> {conversacion.asunto}</p>
            <p><strong>Siguiente paso:</strong> {conversacion.proximaAccion}</p>
          </>}
        </div>
      </Section>

      {/* 4. Intereses */}
      {intereses && (
        <Section title="Intereses" icon={Star}>
          <div className="space-y-0.5">
            <InfoRow label="Destino" value={intereses.destino} />
            <InfoRow label="Tipo viaje" value={intereses.tipoViaje} />
            <InfoRow label="Presupuesto" value={intereses.presupuesto} />
            <InfoRow label="Fechas" value={intereses.fechas} />
            <InfoRow label="Pasajeros" value={String(intereses.pasajeros)} />
            <InfoRow label="Preferencias" value={intereses.preferencias} />
            {intereses.restricciones !== 'Ninguna conocida' && (
              <InfoRow label="Restricciones" value={intereses.restricciones} highlight />
            )}
            <InfoRow label="Forma de pago" value={intereses.formaPago} />
            <InfoRow label="Intención" value={intereses.nivelIntencion} highlight={intereses.nivelIntencion === 'alto'} />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {intereses.productos.map(p => (
                <span key={p} className="text-[9px] bg-muted px-1.5 py-0.5 rounded">{p}</span>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* 5. Actividad transversal */}
      {actividades.length > 0 && (
        <Section title="Actividad transversal" icon={Users}>
          <div className="space-y-2">
            {actividades.map(act => (
              <div key={act.id} className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  {act.area === 'Grupos / Bodas' && <Users className="w-3 h-3 text-primary" />}
                  {act.area === 'Soporte Online' && <Globe className="w-3 h-3 text-warning" />}
                  {act.area === 'Trámites (Visas)' && <Briefcase className="w-3 h-3 text-info" />}
                  <span className="text-[10px] font-semibold text-foreground">{act.area}</span>
                </div>
                <InfoRow label="Gestión" value={act.tipoGestion} />
                <InfoRow label="Estado" value={act.estado} />
                <InfoRow label="Responsable" value={act.responsable} />
                <InfoRow label="Próximo hito" value={act.proximoHito} />
                {act.riesgo && act.riesgo !== 'Ninguno por ahora' && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3 text-warning" />
                    <span className="text-[10px] text-warning">{act.riesgo}</span>
                  </div>
                )}
                <span className="text-[9px] text-muted-foreground">
                  Actualizado {formatDistanceToNow(act.ultimaActualizacion, { addSuffix: true, locale: es })}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 6. Herramientas IA */}
      <Section title="Herramientas IA" icon={Sparkles} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            'Resumir conversación',
            'Redactar respuesta',
            'Extraer datos',
            'Detectar intención',
            'Sugerir siguiente paso',
            'Sugerir plantilla',
            'Detectar objeciones',
            'Generar nota interna',
          ].map(action => (
            <button
              key={action}
              className="text-[10px] text-left px-2 py-1.5 rounded-md border border-border hover:bg-accent/50 hover:border-primary/30 transition-colors text-foreground"
            >
              {action}
            </button>
          ))}
        </div>
      </Section>

      {/* 7. Historial */}
      <Section title="Historial" icon={History} defaultOpen={false}>
        <div className="space-y-1.5">
          {llamadasCliente.length > 0 && llamadasCliente.map(ll => (
            <div key={ll.id} className="flex items-start gap-2 text-[10px]">
              <PhoneIcon className="w-3 h-3 text-phone mt-0.5" />
              <div>
                <span className="text-foreground">Llamada {ll.tipo} - {Math.floor(ll.duracion / 60)} min</span>
                <p className="text-muted-foreground">{format(ll.timestamp, 'dd MMM HH:mm', { locale: es })}</p>
              </div>
            </div>
          ))}
          <div className="flex items-start gap-2 text-[10px]">
            <MessageSquare className="w-3 h-3 text-whatsapp mt-0.5" />
            <div>
              <span className="text-foreground">Último contacto: {conversacion.canal}</span>
              <p className="text-muted-foreground">{formatDistanceToNow(conversacion.ultimaInteraccion, { addSuffix: true, locale: es })}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* 8. Contexto de gestión */}
      <Section title="Contexto de gestión" icon={ClipboardCheck} defaultOpen={false}>
        <div className="space-y-0.5">
          <InfoRow label="Estado" value={conversacion.estado.replace('_', ' ')} />
          <InfoRow label="Prioridad" value={conversacion.prioridad} />
          <InfoRow label="Próxima acción" value={conversacion.proximaAccion} />
          {tareasCliente.length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] text-muted-foreground">Tareas abiertas:</span>
              {tareasCliente.filter(t => t.estado !== 'completada').map(t => (
                <div key={t.id} className="flex items-center gap-1.5 mt-1">
                  <Circle className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-foreground">{t.titulo}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* 9. Condiciones de cierre */}
      {condiciones.length > 0 && (
        <Section
          title="Condiciones de cierre"
          icon={Shield}
          defaultOpen={true}
          badge={
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              completadas === totalCondiciones ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
            }`}>
              {completadas}/{totalCondiciones}
            </span>
          }
        >
          <div className="space-y-1.5">
            {condiciones.map(cc => (
              <div key={cc.id} className="flex items-start gap-2">
                {cc.completada ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] ${cc.completada ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {cc.descripcion}
                  </span>
                  {cc.tipo === 'pago' && <CreditCard className="w-3 h-3 text-warning" />}
                  {cc.tipo === 'documento' && <FileText className="w-3 h-3 text-info" />}
                </div>
              </div>
            ))}
            {completadas === totalCondiciones && (
              <button className="w-full mt-2 py-1.5 rounded-md bg-success text-success-foreground text-xs font-medium hover:bg-success/90">
                Mover a Finalizado
              </button>
            )}
            {completadas < totalCondiciones && (
              <p className="text-[9px] text-muted-foreground mt-1">
                Faltan {totalCondiciones - completadas} condiciones para poder finalizar
              </p>
            )}
          </div>
        </Section>
      )}

      {/* Estado del canal */}
      <Section title="Estado del canal" icon={Globe} defaultOpen={false}>
        <div className="space-y-1.5">
          {estadoCanales.map(ec => (
            <div key={ec.canal} className="flex items-center gap-2 text-[10px]">
              <span className={`w-1.5 h-1.5 rounded-full ${
                ec.estado === 'activo_simulado' ? 'bg-success' : ec.estado === 'error' ? 'bg-destructive' : 'bg-warning'
              }`} />
              <span className="text-foreground capitalize">{ec.canal}</span>
              <span className="text-muted-foreground ml-auto">{ec.estado === 'activo_simulado' ? 'Simulado' : ec.estado}</span>
            </div>
          ))}
          <p className="text-[9px] text-muted-foreground mt-1">Modo mockup activo. Sin conexiones externas reales.</p>
        </div>
      </Section>
    </div>
  );
}
