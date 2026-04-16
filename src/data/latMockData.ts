export type Canal = 'whatsapp' | 'phone' | 'email';
export type EstadoConversacion = 'nuevo' | 'pendiente_respuesta' | 'en_seguimiento' | 'urgente' | 'fuera_ventana' | 'con_tarea' | 'finalizado';
export type EstadoMensaje = 'enviado' | 'entregado' | 'leido' | 'fallido' | 'pendiente';
export type Prioridad = 'alta' | 'media' | 'baja' | 'urgente';
export type TipoGestion = 'venta' | 'soporte' | 'tramite' | 'seguimiento' | 'cotizacion' | 'reclamo';
export type EstadoTarea = 'pendiente' | 'en_progreso' | 'completada' | 'vencida';

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  correo: string;
  ciudad: string;
  canalPreferido: Canal;
  tipoCliente: string;
  estadoCliente: string;
  asesor: string;
}

export interface Conversacion {
  id: string;
  clienteId: string;
  canal: Canal;
  tipoGestion: TipoGestion;
  asunto: string;
  ultimoMensaje: string;
  ultimaInteraccion: Date;
  prioridad: Prioridad;
  estado: EstadoConversacion;
  proximaAccion: string;
  vencimiento?: Date;
  ventanaWhatsapp?: Date;
  noLeidos: number;
}

export interface Mensaje {
  id: string;
  conversacionId: string;
  tipo: 'inbound' | 'outbound' | 'nota_interna' | 'sistema';
  contenido: string;
  timestamp: Date;
  estado: EstadoMensaje;
  adjunto?: { nombre: string; tipo: string; url: string };
  template?: string;
  error?: string;
}

export interface Tarea {
  id: string;
  clienteId: string;
  conversacionId?: string;
  titulo: string;
  descripcion: string;
  tipo: 'seguimiento' | 'callback' | 'recordatorio' | 'compromiso' | 'recontacto' | 'tarea';
  estado: EstadoTarea;
  prioridad: Prioridad;
  fechaVencimiento: Date;
  fechaCreacion: Date;
  canal?: Canal;
  gestion?: string;
}

export interface Plantilla {
  id: string;
  nombre: string;
  idioma: string;
  categoria: string;
  estado: 'aprobada' | 'pendiente' | 'rechazada';
  contenido: string;
  variables: string[];
  canal: Canal;
}

export interface Interes {
  destino: string;
  tipoViaje: string;
  presupuesto: string;
  fechas: string;
  pasajeros: number;
  preferencias: string;
  restricciones: string;
  formaPago: string;
  productos: string[];
  nivelIntencion: 'alto' | 'medio' | 'bajo';
}

export interface ActividadTransversal {
  id: string;
  clienteId: string;
  area: string;
  tipoGestion: string;
  estado: string;
  responsable: string;
  proximoHito: string;
  riesgo: string;
  ultimaActualizacion: Date;
}

export interface Llamada {
  id: string;
  clienteId: string;
  conversacionId?: string;
  tipo: 'entrante' | 'saliente';
  estado: 'en_curso' | 'finalizada' | 'perdida' | 'en_espera';
  duracion: number;
  timestamp: Date;
  notas?: string;
  wrapUp?: string;
}

export interface CondicionCierre {
  id: string;
  descripcion: string;
  completada: boolean;
  tipo: 'info' | 'documento' | 'confirmacion' | 'pago' | 'validacion' | 'tarea';
}

// CLIENTES
export const clientes: Cliente[] = [
  { id: 'c1', nombre: 'María González Herrera', telefono: '+52 55 1234 5678', correo: 'maria.gonzalez@email.com', ciudad: 'CDMX', canalPreferido: 'whatsapp', tipoCliente: 'Premium', estadoCliente: 'Activo', asesor: 'Ana López' },
  { id: 'c2', nombre: 'Roberto Sánchez Medina', telefono: '+52 33 8765 4321', correo: 'roberto.sanchez@corp.mx', ciudad: 'Guadalajara', canalPreferido: 'email', tipoCliente: 'Corporativo', estadoCliente: 'Activo', asesor: 'Ana López' },
  { id: 'c3', nombre: 'Laura Martínez Ruiz', telefono: '+52 81 5555 0001', correo: 'laura.mtz@gmail.com', ciudad: 'Monterrey', canalPreferido: 'whatsapp', tipoCliente: 'Regular', estadoCliente: 'Activo', asesor: 'Ana López' },
  { id: 'c4', nombre: 'Carlos Pérez Domínguez', telefono: '+52 55 9999 1234', correo: 'cperez@hotmail.com', ciudad: 'CDMX', canalPreferido: 'phone', tipoCliente: 'VIP', estadoCliente: 'Activo', asesor: 'Ana López' },
  { id: 'c5', nombre: 'Patricia Flores Olvera', telefono: '+52 22 3333 4444', correo: 'pat.flores@outlook.com', ciudad: 'Puebla', canalPreferido: 'whatsapp', tipoCliente: 'Regular', estadoCliente: 'Nuevo', asesor: 'Ana López' },
  { id: 'c6', nombre: 'Fernando Díaz Castillo', telefono: '+52 55 7777 8888', correo: 'fdiaz@empresa.com', ciudad: 'CDMX', canalPreferido: 'email', tipoCliente: 'Corporativo', estadoCliente: 'Activo', asesor: 'Ana López' },
];

// CONVERSACIONES
const now = new Date();
const h = (hours: number) => new Date(now.getTime() - hours * 3600000);
const d = (days: number) => new Date(now.getTime() - days * 86400000);

export const conversaciones: Conversacion[] = [
  { id: 'conv1', clienteId: 'c1', canal: 'whatsapp', tipoGestion: 'cotizacion', asunto: 'Luna de miel Maldivas', ultimoMensaje: '¿Ya tienen disponibilidad para junio?', ultimaInteraccion: h(0.5), prioridad: 'alta', estado: 'pendiente_respuesta', proximaAccion: 'Enviar cotización actualizada', vencimiento: h(-4), ventanaWhatsapp: h(-20), noLeidos: 2 },
  { id: 'conv2', clienteId: 'c2', canal: 'email', tipoGestion: 'cotizacion', asunto: 'Viaje corporativo Cancún 25 pax', ultimoMensaje: 'Adjunto la lista actualizada de asistentes', ultimaInteraccion: h(3), prioridad: 'alta', estado: 'en_seguimiento', proximaAccion: 'Revisar lista y confirmar bloqueo', vencimiento: d(-1), noLeidos: 1 },
  { id: 'conv3', clienteId: 'c3', canal: 'whatsapp', tipoGestion: 'venta', asunto: 'Paquete familiar Europa', ultimoMensaje: 'Déjame consultarlo con mi esposo', ultimaInteraccion: h(8), prioridad: 'media', estado: 'en_seguimiento', proximaAccion: 'Recontactar en 48h', ventanaWhatsapp: h(-16), noLeidos: 0 },
  { id: 'conv4', clienteId: 'c4', canal: 'phone', tipoGestion: 'reclamo', asunto: 'Cambio de vuelo no procesado', ultimoMensaje: 'Llamada: cliente molesto por demora', ultimaInteraccion: h(1), prioridad: 'urgente', estado: 'urgente', proximaAccion: 'Escalar a aerolínea y confirmar', vencimiento: h(-2), noLeidos: 0 },
  { id: 'conv5', clienteId: 'c5', canal: 'whatsapp', tipoGestion: 'venta', asunto: 'Boda destino Los Cabos', ultimoMensaje: 'Hola, me interesa cotizar para 40 personas', ultimaInteraccion: h(0.2), prioridad: 'alta', estado: 'nuevo', proximaAccion: 'Responder y agendar llamada', ventanaWhatsapp: h(-23.8), noLeidos: 3 },
  { id: 'conv6', clienteId: 'c6', canal: 'email', tipoGestion: 'tramite', asunto: 'Visas USA grupo ejecutivo', ultimoMensaje: 'Necesitamos confirmar fechas de cita', ultimaInteraccion: h(6), prioridad: 'media', estado: 'con_tarea', proximaAccion: 'Confirmar documentación completa', vencimiento: d(-2), noLeidos: 0 },
  { id: 'conv7', clienteId: 'c1', canal: 'phone', tipoGestion: 'seguimiento', asunto: 'Seguimiento reserva Maldivas', ultimoMensaje: 'Llamada: confirmar datos de pasaporte', ultimaInteraccion: d(1), prioridad: 'media', estado: 'en_seguimiento', proximaAccion: 'Esperar envío de pasaportes', noLeidos: 0 },
  { id: 'conv8', clienteId: 'c3', canal: 'email', tipoGestion: 'soporte', asunto: 'Problema con pago en línea', ultimoMensaje: 'El sistema me rechaza la tarjeta', ultimaInteraccion: h(2), prioridad: 'alta', estado: 'pendiente_respuesta', proximaAccion: 'Verificar con plataforma de pagos', noLeidos: 1 },
];

// MENSAJES por conversación
export const mensajes: Record<string, Mensaje[]> = {
  conv1: [
    { id: 'm1', conversacionId: 'conv1', tipo: 'inbound', contenido: 'Hola Ana, ¿cómo estás? Te escribo porque ya decidimos ir a Maldivas en junio.', timestamp: h(24), estado: 'leido' },
    { id: 'm2', conversacionId: 'conv1', tipo: 'outbound', contenido: '¡Hola María! Qué gusto. Déjame revisar disponibilidad para junio y te mando opciones hoy mismo.', timestamp: h(23), estado: 'leido' },
    { id: 'm3', conversacionId: 'conv1', tipo: 'outbound', contenido: 'María, te comparto 3 opciones de resorts. La primera es Soneva Fushi, all-inclusive, villa sobre el agua 🏝️', timestamp: h(20), estado: 'leido', adjunto: { nombre: 'Cotizacion_Maldivas_2025.pdf', tipo: 'pdf', url: '#' } },
    { id: 'm4', conversacionId: 'conv1', tipo: 'inbound', contenido: 'Se ven increíbles. Mi esposo pregunta si incluyen traslado en hidroavión', timestamp: h(18), estado: 'leido' },
    { id: 'm5', conversacionId: 'conv1', tipo: 'nota_interna', contenido: 'Cliente interesada en Soneva Fushi. Verificar disponibilidad de hidroavión incluido en paquete premium.', timestamp: h(17), estado: 'leido' },
    { id: 'm6', conversacionId: 'conv1', tipo: 'outbound', contenido: 'Sí, el paquete premium de Soneva Fushi incluye traslados en hidroavión ida y vuelta desde Malé ✈️', timestamp: h(5), estado: 'entregado' },
    { id: 'm7', conversacionId: 'conv1', tipo: 'inbound', contenido: '¿Ya tienen disponibilidad para junio?', timestamp: h(0.5), estado: 'leido' },
  ],
  conv2: [
    { id: 'm8', conversacionId: 'conv2', tipo: 'inbound', contenido: 'Buenos días, le escribo para confirmar el viaje corporativo a Cancún para 25 personas.', timestamp: d(3), estado: 'leido' },
    { id: 'm9', conversacionId: 'conv2', tipo: 'outbound', contenido: 'Buenos días Roberto. Perfecto, necesito la lista de asistentes para proceder con el bloqueo de habitaciones.', timestamp: d(3), estado: 'leido' },
    { id: 'm10', conversacionId: 'conv2', tipo: 'inbound', contenido: 'Adjunto la lista actualizada de asistentes', timestamp: h(3), estado: 'leido', adjunto: { nombre: 'Lista_Asistentes_Corp.xlsx', tipo: 'xlsx', url: '#' } },
  ],
  conv4: [
    { id: 'm11', conversacionId: 'conv4', tipo: 'sistema', contenido: 'Llamada entrante de Carlos Pérez - Duración: 12 min', timestamp: h(1.5), estado: 'leido' },
    { id: 'm12', conversacionId: 'conv4', tipo: 'nota_interna', contenido: 'Cliente muy molesto. Solicitó cambio de vuelo hace 5 días y no se ha procesado. Aerolínea indica que el cambio requiere autorización de supervisor. URGENTE.', timestamp: h(1.2), estado: 'leido' },
    { id: 'm13', conversacionId: 'conv4', tipo: 'outbound', contenido: 'Carlos, ya escalé tu caso directamente con la aerolínea. Te confirmo en las próximas 2 horas.', timestamp: h(1), estado: 'enviado' },
  ],
  conv5: [
    { id: 'm14', conversacionId: 'conv5', tipo: 'inbound', contenido: 'Hola, buenas tardes. Me recomendó una amiga. Estoy organizando mi boda en Los Cabos para marzo del próximo año, seremos como 40 personas. ¿Me pueden ayudar?', timestamp: h(0.3), estado: 'leido' },
    { id: 'm15', conversacionId: 'conv5', tipo: 'inbound', contenido: 'Necesitaríamos hotel, vuelos y coordinación del evento 💒', timestamp: h(0.25), estado: 'leido' },
    { id: 'm16', conversacionId: 'conv5', tipo: 'inbound', contenido: '¿Manejan paquetes de boda destino?', timestamp: h(0.2), estado: 'leido' },
  ],
  conv6: [
    { id: 'm17', conversacionId: 'conv6', tipo: 'outbound', contenido: 'Fernando, le informo que ya tenemos pre-aprobación de citas para el grupo ejecutivo. Necesitamos confirmar fechas.', timestamp: h(8), estado: 'leido' },
    { id: 'm18', conversacionId: 'conv6', tipo: 'inbound', contenido: 'Necesitamos confirmar fechas de cita', timestamp: h(6), estado: 'leido' },
  ],
  conv3: [
    { id: 'm19', conversacionId: 'conv3', tipo: 'outbound', contenido: 'Laura, te mando el resumen del paquete Europa 15 días: Madrid, París, Roma. $45,000 MXN por persona, todo incluido.', timestamp: h(12), estado: 'leido' },
    { id: 'm20', conversacionId: 'conv3', tipo: 'inbound', contenido: 'Déjame consultarlo con mi esposo', timestamp: h(8), estado: 'leido' },
  ],
  conv7: [
    { id: 'm21', conversacionId: 'conv7', tipo: 'sistema', contenido: 'Llamada saliente a María González - Duración: 8 min', timestamp: d(1), estado: 'leido' },
    { id: 'm22', conversacionId: 'conv7', tipo: 'nota_interna', contenido: 'Confirmar datos de pasaporte de ambos viajeros antes de emitir reserva Soneva Fushi.', timestamp: d(1), estado: 'leido' },
  ],
  conv8: [
    { id: 'm23', conversacionId: 'conv8', tipo: 'inbound', contenido: 'Hola, intenté pagar en línea y el sistema me rechaza la tarjeta. Ya intenté con 2 tarjetas diferentes.', timestamp: h(2.5), estado: 'leido' },
    { id: 'm24', conversacionId: 'conv8', tipo: 'outbound', contenido: 'Laura, lamento el inconveniente. Voy a verificar con el equipo de soporte técnico. ¿Podrías compartirme una captura del error?', timestamp: h(2), estado: 'entregado' },
    { id: 'm25', conversacionId: 'conv8', tipo: 'inbound', contenido: 'El sistema me rechaza la tarjeta', timestamp: h(2), estado: 'leido', adjunto: { nombre: 'error_pago.jpg', tipo: 'image', url: '#' } },
  ],
};

// PLANTILLAS
export const plantillas: Plantilla[] = [
  { id: 'pl1', nombre: 'Bienvenida', idioma: 'es', categoria: 'utilidad', estado: 'aprobada', contenido: 'Hola {{nombre}}, bienvenido/a a Latidos Viajes. Soy {{asesor}} y estaré encantado/a de ayudarte. ¿En qué puedo asistirte?', variables: ['nombre', 'asesor'], canal: 'whatsapp' },
  { id: 'pl2', nombre: 'Cotización lista', idioma: 'es', categoria: 'utilidad', estado: 'aprobada', contenido: '{{nombre}}, tu cotización para {{destino}} ya está lista. Te la comparto en un momento. ¿Tienes alguna pregunta?', variables: ['nombre', 'destino'], canal: 'whatsapp' },
  { id: 'pl3', nombre: 'Seguimiento 48h', idioma: 'es', categoria: 'utilidad', estado: 'aprobada', contenido: 'Hola {{nombre}}, ¿pudiste revisar la propuesta que te envié? Quedo atento/a a tus comentarios.', variables: ['nombre'], canal: 'whatsapp' },
  { id: 'pl4', nombre: 'Confirmación de pago', idioma: 'es', categoria: 'utilidad', estado: 'aprobada', contenido: '{{nombre}}, confirmamos que hemos recibido tu pago por ${{monto}} MXN. Tu reserva está asegurada. 🎉', variables: ['nombre', 'monto'], canal: 'whatsapp' },
  { id: 'pl5', nombre: 'Recordatorio documentos', idioma: 'es', categoria: 'utilidad', estado: 'pendiente', contenido: '{{nombre}}, te recordamos que aún necesitamos: {{documentos}}. ¿Podrías enviárnoslos lo antes posible?', variables: ['nombre', 'documentos'], canal: 'whatsapp' },
  { id: 'pl6', nombre: 'Reactivación', idioma: 'es', categoria: 'marketing', estado: 'aprobada', contenido: 'Hola {{nombre}}, hace tiempo que no conversamos. Tenemos nuevas ofertas para {{temporada}}. ¿Te interesa?', variables: ['nombre', 'temporada'], canal: 'whatsapp' },
];

// INTERESES por cliente
export const intereses: Record<string, Interes> = {
  c1: { destino: 'Maldivas - Soneva Fushi', tipoViaje: 'Luna de miel', presupuesto: '$120,000 - $180,000 MXN', fechas: 'Junio 2025', pasajeros: 2, preferencias: 'All-inclusive, villa sobre agua, hidroavión', restricciones: 'Ninguna conocida', formaPago: 'Tarjeta de crédito (2 pagos)', productos: ['Vuelo + Hotel', 'Traslado hidroavión', 'Seguro de viaje'], nivelIntencion: 'alto' },
  c2: { destino: 'Cancún - Riviera Maya', tipoViaje: 'Corporativo / Incentivo', presupuesto: '$850,000 MXN (grupo)', fechas: 'Septiembre 2025', pasajeros: 25, preferencias: 'Hotel 5*, salones de eventos, team building', restricciones: 'Requiere factura empresarial', formaPago: 'Transferencia corporativa', productos: ['Hospedaje grupal', 'Salón de eventos', 'Actividades team building', 'Transportación'], nivelIntencion: 'alto' },
  c3: { destino: 'Europa: Madrid, París, Roma', tipoViaje: 'Familiar', presupuesto: '$180,000 MXN (4 pax)', fechas: 'Julio-Agosto 2025', pasajeros: 4, preferencias: 'Hoteles céntricos, tours familiares', restricciones: '2 menores de edad', formaPago: 'Meses sin intereses', productos: ['Vuelos intercontinentales', 'Hoteles', 'Trenes Europa', 'Tours guiados'], nivelIntencion: 'medio' },
  c5: { destino: 'Los Cabos', tipoViaje: 'Boda destino', presupuesto: '$600,000 - $800,000 MXN', fechas: 'Marzo 2026', pasajeros: 40, preferencias: 'Hotel con wedding planner, playa privada', restricciones: 'Grupo con niños', formaPago: 'Por definir', productos: ['Hospedaje grupal', 'Coordinación boda', 'Vuelos grupo', 'Transportación'], nivelIntencion: 'alto' },
};

// ACTIVIDADES TRANSVERSALES
export const actividadesTransversales: ActividadTransversal[] = [
  { id: 'at1', clienteId: 'c5', area: 'Grupos / Bodas', tipoGestion: 'Cotización grupal boda destino', estado: 'En evaluación', responsable: 'Diana Ramírez', proximoHito: 'Confirmar bloqueo de habitaciones', riesgo: 'Lista de invitados incompleta', ultimaActualizacion: h(4) },
  { id: 'at2', clienteId: 'c5', area: 'Grupos / Bodas', tipoGestion: 'Bloqueo de espacios ceremonia', estado: 'Pendiente confirmación', responsable: 'Diana Ramírez', proximoHito: 'Pago de anticipo para bloqueo', riesgo: 'Fecha muy solicitada, riesgo de perder espacio', ultimaActualizacion: h(12) },
  { id: 'at3', clienteId: 'c3', area: 'Soporte Online', tipoGestion: 'Problema con pago web', estado: 'En investigación', responsable: 'Soporte TI', proximoHito: 'Diagnóstico de pasarela de pagos', riesgo: 'Cliente puede abandonar compra', ultimaActualizacion: h(2) },
  { id: 'at4', clienteId: 'c6', area: 'Trámites (Visas)', tipoGestion: 'Visa USA grupo ejecutivo (8 pax)', estado: 'Documentación en revisión', responsable: 'Miguel Torres', proximoHito: 'Confirmar citas en embajada', riesgo: 'Documentación incompleta de 3 ejecutivos', ultimaActualizacion: h(6) },
  { id: 'at5', clienteId: 'c2', area: 'Grupos / Bodas', tipoGestion: 'Evento corporativo Cancún', estado: 'Bloqueo confirmado', responsable: 'Diana Ramírez', proximoHito: 'Enviar contrato de servicios', riesgo: 'Ninguno por ahora', ultimaActualizacion: d(1) },
  { id: 'at6', clienteId: 'c1', area: 'Trámites (Visas)', tipoGestion: 'Verificación de pasaportes', estado: 'Pendiente documentos', responsable: 'Miguel Torres', proximoHito: 'Recibir escaneo de pasaportes', riesgo: 'Pasaporte de acompañante próximo a vencer', ultimaActualizacion: d(1) },
];

// CONDICIONES DE CIERRE por conversación
export const condicionesCierre: Record<string, CondicionCierre[]> = {
  conv1: [
    { id: 'cc1', descripcion: 'Cotización enviada al cliente', completada: true, tipo: 'info' },
    { id: 'cc2', descripcion: 'Disponibilidad confirmada con hotel', completada: false, tipo: 'confirmacion' },
    { id: 'cc3', descripcion: 'Pasaportes recibidos y verificados', completada: false, tipo: 'documento' },
    { id: 'cc4', descripcion: 'Anticipo recibido (30%)', completada: false, tipo: 'pago' },
    { id: 'cc5', descripcion: 'Seguro de viaje contratado', completada: false, tipo: 'tarea' },
  ],
  conv2: [
    { id: 'cc6', descripcion: 'Lista de asistentes completa', completada: true, tipo: 'documento' },
    { id: 'cc7', descripcion: 'Bloqueo de habitaciones confirmado', completada: true, tipo: 'confirmacion' },
    { id: 'cc8', descripcion: 'Contrato firmado', completada: false, tipo: 'documento' },
    { id: 'cc9', descripcion: 'Pago corporativo procesado', completada: false, tipo: 'pago' },
    { id: 'cc10', descripcion: 'Factura emitida', completada: false, tipo: 'tarea' },
  ],
  conv4: [
    { id: 'cc11', descripcion: 'Cambio de vuelo procesado por aerolínea', completada: false, tipo: 'confirmacion' },
    { id: 'cc12', descripcion: 'Confirmación enviada al cliente', completada: false, tipo: 'info' },
    { id: 'cc13', descripcion: 'Cliente confirma satisfacción', completada: false, tipo: 'confirmacion' },
  ],
  conv5: [
    { id: 'cc14', descripcion: 'Primera respuesta enviada', completada: false, tipo: 'info' },
    { id: 'cc15', descripcion: 'Llamada de descubrimiento agendada', completada: false, tipo: 'tarea' },
    { id: 'cc16', descripcion: 'Cotización grupal enviada', completada: false, tipo: 'info' },
    { id: 'cc17', descripcion: 'Lista de invitados recibida', completada: false, tipo: 'documento' },
    { id: 'cc18', descripcion: 'Anticipo de bloqueo recibido', completada: false, tipo: 'pago' },
  ],
  conv6: [
    { id: 'cc19', descripcion: 'Documentación completa de todos los ejecutivos', completada: false, tipo: 'documento' },
    { id: 'cc20', descripcion: 'Citas en embajada confirmadas', completada: false, tipo: 'confirmacion' },
    { id: 'cc21', descripcion: 'Pago de trámites recibido', completada: false, tipo: 'pago' },
  ],
};

// TAREAS
export const tareas: Tarea[] = [
  { id: 't1', clienteId: 'c1', conversacionId: 'conv1', titulo: 'Enviar cotización actualizada Maldivas', descripcion: 'Incluir opción Soneva Fushi con hidroavión', tipo: 'tarea', estado: 'pendiente', prioridad: 'alta', fechaVencimiento: h(-4), fechaCreacion: d(1), canal: 'whatsapp', gestion: 'Cotización' },
  { id: 't2', clienteId: 'c3', titulo: 'Recontactar Laura - Europa', descripcion: 'Seguimiento después de consultar con esposo', tipo: 'recontacto', estado: 'pendiente', prioridad: 'media', fechaVencimiento: d(-1), fechaCreacion: h(8), canal: 'whatsapp', gestion: 'Venta' },
  { id: 't3', clienteId: 'c4', conversacionId: 'conv4', titulo: 'Confirmar cambio de vuelo con aerolínea', descripcion: 'Escalar caso urgente', tipo: 'tarea', estado: 'en_progreso', prioridad: 'urgente', fechaVencimiento: h(-2), fechaCreacion: h(1), canal: 'phone', gestion: 'Reclamo' },
  { id: 't4', clienteId: 'c5', conversacionId: 'conv5', titulo: 'Responder consulta boda Los Cabos', descripcion: 'Primera respuesta y agendar llamada', tipo: 'callback', estado: 'pendiente', prioridad: 'alta', fechaVencimiento: h(-1), fechaCreacion: h(0.2), canal: 'whatsapp', gestion: 'Cotización' },
  { id: 't5', clienteId: 'c2', conversacionId: 'conv2', titulo: 'Revisar lista asistentes corporativo', descripcion: 'Verificar datos y confirmar bloqueo', tipo: 'tarea', estado: 'pendiente', prioridad: 'alta', fechaVencimiento: h(-6), fechaCreacion: h(3), canal: 'email', gestion: 'Cotización' },
  { id: 't6', clienteId: 'c6', conversacionId: 'conv6', titulo: 'Confirmar fechas de cita visa', descripcion: 'Coordinar con embajada', tipo: 'tarea', estado: 'pendiente', prioridad: 'media', fechaVencimiento: d(-2), fechaCreacion: h(6), canal: 'email', gestion: 'Trámite' },
  { id: 't7', clienteId: 'c1', titulo: 'Solicitar pasaportes a María', descripcion: 'Necesarios para reserva en Maldivas', tipo: 'seguimiento', estado: 'pendiente', prioridad: 'media', fechaVencimiento: d(-3), fechaCreacion: d(2), canal: 'whatsapp', gestion: 'Trámite' },
];

// LLAMADAS
export const llamadas: Llamada[] = [
  { id: 'll1', clienteId: 'c4', conversacionId: 'conv4', tipo: 'entrante', estado: 'finalizada', duracion: 720, timestamp: h(1.5), notas: 'Cliente reporta que su cambio de vuelo no fue procesado después de 5 días', wrapUp: 'Escalar a supervisor de aerolínea. Confirmar en 2h.' },
  { id: 'll2', clienteId: 'c1', conversacionId: 'conv7', tipo: 'saliente', estado: 'finalizada', duracion: 480, timestamp: d(1), notas: 'Seguimiento de reserva Maldivas. Solicitar datos de pasaporte.', wrapUp: 'Cliente enviará pasaportes esta semana.' },
  { id: 'll3', clienteId: 'c5', tipo: 'saliente', estado: 'finalizada', duracion: 0, timestamp: h(0.1), notas: 'Sin respuesta - dejar mensaje', wrapUp: 'Intentar de nuevo en 1h o responder por WhatsApp.' },
];

// ESTADO DE CANALES
export interface EstadoCanal {
  canal: Canal;
  estado: 'activo_simulado' | 'pendiente' | 'error';
  proveedor: string;
  ultimaSync?: Date;
  ultimoError?: string;
  detalles: string;
}

export const estadoCanales: EstadoCanal[] = [
  { canal: 'whatsapp', estado: 'activo_simulado', proveedor: 'Gupshup (pendiente)', ultimaSync: h(0.1), detalles: 'Modo simulado activo. Mensajes persistidos localmente. Webhook pendiente de configuración.' },
  { canal: 'email', estado: 'activo_simulado', proveedor: 'SMTP (pendiente)', ultimaSync: h(1), detalles: 'Modo simulado. Correos registrados pero no enviados realmente.' },
  { canal: 'phone', estado: 'activo_simulado', proveedor: 'Twilio (pendiente)', detalles: 'Softphone mockup. Llamadas simuladas con persistencia local.' },
];

// HELPERS
export const getCliente = (id: string) => clientes.find(c => c.id === id);
export const getConversacion = (id: string) => conversaciones.find(c => c.id === id);
export const getMensajes = (convId: string) => mensajes[convId] || [];
export const getIntereses = (clienteId: string) => intereses[clienteId];
export const getActividadesCliente = (clienteId: string) => actividadesTransversales.filter(a => a.clienteId === clienteId);
export const getCondicionesCierre = (convId: string) => condicionesCierre[convId] || [];
export const getTareasCliente = (clienteId: string) => tareas.filter(t => t.clienteId === clienteId);
export const getLlamadasCliente = (clienteId: string) => llamadas.filter(l => l.clienteId === clienteId);
