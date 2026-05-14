-- Agrega columna bot_clasificacion a lat_colas para enriquecer el contexto del bot IA Lati
-- Estructura: { categoria, keywords[], frases_ejemplo[], preguntas_calificacion[], exclusiones[], confianza_min, derivar_inmediato }

ALTER TABLE lat_colas
  ADD COLUMN IF NOT EXISTS bot_clasificacion JSONB DEFAULT NULL;

COMMENT ON COLUMN lat_colas.bot_clasificacion IS
  'Hints para bot IA Lati: {categoria, keywords[], frases_ejemplo[], preguntas_calificacion[], exclusiones[], confianza_min, derivar_inmediato}';

-- Poblar matriz intención → cola

UPDATE lat_colas
SET bot_clasificacion = '{
  "categoria": "grupos_bodas",
  "keywords": ["boda","bodas","matrimonio","luna de miel","pedida de mano","boda simbólica","renovación de votos","grupo","grupos","simbólico","paquetes de boda","bodas fuera de Bolivia","invitados","confirmar invitado"],
  "frases_ejemplo": [
    "Estoy interesada en hacer mi matrimonio en Tarija",
    "Quiero ver paquetes de bodas fuera de Bolivia",
    "Estoy buscando luna de miel",
    "Quiero una pedida de mano sorpresa",
    "Somos un grupo de amigos queremos viajar"
  ],
  "preguntas_calificacion": [
    "¿Es para boda, luna de miel, evento grupal o renovación de votos?",
    "¿Para cuántas personas aproximadamente?"
  ],
  "exclusiones": ["emergencia","no me dejan abordar","perdí mi vuelo","visa","soporte","reserva no confirmada"],
  "confianza_min": 0.65
}'::jsonb
WHERE nombre ILIKE '%grupo%' OR nombre ILIKE '%boda%';

UPDATE lat_colas
SET bot_clasificacion = '{
  "categoria": "soporte_aereo",
  "keywords": ["emergencia","no me dejan abordar","perdí mi vuelo","cambio de fecha","anular mi boleto","cancelar vuelo","check-in","reserva no confirmada","pendiente de confirmación","me debitaron","boleto no confirmado","TTL","duplicidad","no me llega el boleto","intento de compra","pago aceptado"],
  "frases_ejemplo": [
    "No me dejan abordar",
    "Perdí mi vuelo cuál es el siguiente",
    "Hice la compra me debitaron pero no me llega el boleto",
    "Mi reserva sale no confirmada",
    "Quiero anular mi boleto"
  ],
  "preguntas_calificacion": [],
  "exclusiones": ["boda","matrimonio","visa","cotización","paquete","grupo"],
  "confianza_min": 0.55,
  "derivar_inmediato": true
}'::jsonb
WHERE nombre ILIKE '%soporte%' AND (nombre ILIKE '%aéreo%' OR nombre ILIKE '%aereo%' OR nombre ILIKE '%interno%');

UPDATE lat_colas
SET bot_clasificacion = '{
  "categoria": "vacacional",
  "keywords": ["promoción","paquete","vuelo","pasaje","destino","cotización","asesor","viaje","turismo","hotel","precio","tarifa","viajar","qué destino","quiero viajar","quiero información"],
  "frases_ejemplo": [
    "Quiero más información sobre Punta Cana",
    "Qué promociones tienen",
    "Quiero un pasaje a Miami",
    "Quiero cotización",
    "Cómo agendo una reunión con un asesor"
  ],
  "preguntas_calificacion": [
    "¿A qué destino te gustaría viajar?",
    "¿Para cuántas personas y en qué fechas aproximadas?"
  ],
  "exclusiones": ["boda","matrimonio","visa","empresa","soporte","emergencia"],
  "confianza_min": 0.55
}'::jsonb
WHERE nombre ILIKE '%vacacional%' OR nombre ILIKE '%frontdesk%';

UPDATE lat_colas
SET bot_clasificacion = '{
  "categoria": "corporativo",
  "keywords": ["empresa","corporativo","canje","pase a bordo","pases a bordo","soy de","mi empresa","viajes de empresa","frecuencia","convenio corporativo"],
  "frases_ejemplo": [
    "Soy de la empresa X y necesito vuelos frecuentes",
    "Necesito canje de millas para mi empresa",
    "Pase a bordo ejecutivo"
  ],
  "preguntas_calificacion": [
    "¿Me puedes indicar el nombre de la empresa?",
    "¿Cuántos viajeros aproximadamente y con qué frecuencia?"
  ],
  "exclusiones": ["boda","visa","emergencia"],
  "confianza_min": 0.65
}'::jsonb
WHERE nombre ILIKE '%corporativo%';

UPDATE lat_colas
SET bot_clasificacion = '{
  "categoria": "tramites_visas",
  "keywords": ["visa","schengen","visa estados unidos","visa eeuu","visa europa","visa dubai","visa cairo","consulado","embajada","pasaporte","formulario","cita","residencia","arraigo","negación","visa de turista","ficonsular","renovación de visa","visa para menor","trámite"],
  "frases_ejemplo": [
    "Visa Estados Unidos",
    "Ya tiene visa o no tiene visa",
    "Visa Schengen primera vez",
    "Quiero sacar mi visa para España"
  ],
  "preguntas_calificacion": [
    "¿Para qué país necesitas la visa?",
    "¿Es primera vez o renovación?"
  ],
  "exclusiones": ["vuelo","pasaje","boda","paquete","emergencia"],
  "confianza_min": 0.70
}'::jsonb
WHERE nombre ILIKE '%trámite%' OR nombre ILIKE '%tramite%' OR nombre ILIKE '%visa%';
