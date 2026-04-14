
-- ═══════════════════════════════════════════════════════
-- Cliente 360 — Schema completo
-- ═══════════════════════════════════════════════════════

-- ── Tabla principal: clientes ──
CREATE TABLE public.clientes (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_completo     TEXT        NOT NULL,
  email               TEXT,
  email_secundario    TEXT,
  telefono            TEXT,
  telefono_secundario TEXT,
  documento_tipo      TEXT        DEFAULT 'CI',   -- CI, Pasaporte, RUC
  documento_numero    TEXT,
  fecha_nacimiento    DATE,
  nacionalidad        TEXT        DEFAULT 'Boliviana',
  ciudad              TEXT,
  pais                TEXT        DEFAULT 'Bolivia',
  estado              TEXT        NOT NULL DEFAULT 'activo',   -- activo | inactivo | vip | potencial
  profesion           TEXT,
  estado_civil        TEXT,   -- soltero | casado | divorciado | viudo
  -- Comercial
  club_viajes         BOOLEAN     NOT NULL DEFAULT false,
  espacio_a_bordo     BOOLEAN     NOT NULL DEFAULT false,
  pases_a_bordo       INTEGER     NOT NULL DEFAULT 0,
  -- Asignación
  asesor_nombre       TEXT,
  -- Score
  score_valor         INTEGER     NOT NULL DEFAULT 0,
  score_etiqueta      TEXT,
  notas_rapidas       TEXT,
  -- Meta
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view clientes"   ON public.clientes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can create clientes" ON public.clientes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update clientes" ON public.clientes FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Anyone can delete clientes" ON public.clientes FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_clientes_nombre ON public.clientes(nombre_completo);
CREATE INDEX idx_clientes_email  ON public.clientes(email);


-- ── Documentos ──
CREATE TABLE public.cliente_documentos (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id       UUID        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo             TEXT        NOT NULL,   -- pasaporte | carnet | visa_usa | visa_ue | visa_schengen | otro
  numero           TEXT,
  fecha_emision    DATE,
  fecha_vencimiento DATE,
  pais_emisor      TEXT,
  observaciones    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage cliente_documentos" ON public.cliente_documentos FOR ALL TO anon, authenticated USING (true);
CREATE INDEX idx_cliente_documentos_cliente ON public.cliente_documentos(cliente_id);


-- ── Bancos ──
CREATE TABLE public.cliente_bancos (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id    UUID        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  banco         TEXT        NOT NULL,
  tipo_cuenta   TEXT,   -- ahorro | corriente
  observaciones TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_bancos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage cliente_bancos" ON public.cliente_bancos FOR ALL TO anon, authenticated USING (true);
CREATE INDEX idx_cliente_bancos_cliente ON public.cliente_bancos(cliente_id);


-- ── Tarjetas de lealtad ──
CREATE TABLE public.cliente_lealtad (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id         UUID        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  programa           TEXT        NOT NULL,   -- Aerolineas Plus, LATAM Pass, LifeMiles, etc.
  numero_membresia   TEXT,
  estado             TEXT        DEFAULT 'activo',
  nivel              TEXT,   -- Bronce | Plata | Oro | Platino
  millas_acumuladas  INTEGER     DEFAULT 0,
  observaciones      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_lealtad ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage cliente_lealtad" ON public.cliente_lealtad FOR ALL TO anon, authenticated USING (true);
CREATE INDEX idx_cliente_lealtad_cliente ON public.cliente_lealtad(cliente_id);


-- ── Viajes pasados ──
CREATE TABLE public.cliente_viajes (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id    UUID        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  destino       TEXT        NOT NULL,
  fecha_salida  DATE,
  fecha_regreso DATE,
  tipo_viaje    TEXT,   -- vacaciones | negocios | luna_de_miel | familiar
  estado        TEXT        DEFAULT 'completado',   -- completado | cancelado | en_curso
  monto         NUMERIC(12,2),
  observaciones TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_viajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage cliente_viajes" ON public.cliente_viajes FOR ALL TO anon, authenticated USING (true);
CREATE INDEX idx_cliente_viajes_cliente ON public.cliente_viajes(cliente_id);


-- ── Ideas de viaje ──
CREATE TABLE public.cliente_ideas_viaje (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  destino    TEXT        NOT NULL,
  notas      TEXT,
  prioridad  TEXT        DEFAULT 'media',   -- alta | media | baja
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_ideas_viaje ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage cliente_ideas_viaje" ON public.cliente_ideas_viaje FOR ALL TO anon, authenticated USING (true);
CREATE INDEX idx_cliente_ideas_cliente ON public.cliente_ideas_viaje(cliente_id);


-- ── Referidos ──
CREATE TABLE public.cliente_referidos (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id      UUID        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  referido_id     UUID        REFERENCES public.clientes(id),   -- si el referido es cliente registrado
  referido_nombre TEXT,   -- para referidos no registrados
  tipo            TEXT        NOT NULL DEFAULT 'saliente',   -- saliente (este cliente refirió a alguien) | entrante (quién lo trajo)
  fecha           DATE        DEFAULT CURRENT_DATE,
  observaciones   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_referidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage cliente_referidos" ON public.cliente_referidos FOR ALL TO anon, authenticated USING (true);
CREATE INDEX idx_cliente_referidos_cliente ON public.cliente_referidos(cliente_id);


-- ── Grupo familiar ──
CREATE TABLE public.cliente_familiar (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id           UUID        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  familiar_cliente_id  UUID        REFERENCES public.clientes(id),   -- si el familiar es también cliente
  nombre               TEXT        NOT NULL,
  relacion             TEXT        NOT NULL,   -- conyuge | hijo | hija | padre | madre | hermano | hermana | otro
  fecha_nacimiento     DATE,
  documento_numero     TEXT,
  observaciones        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_familiar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage cliente_familiar" ON public.cliente_familiar FOR ALL TO anon, authenticated USING (true);
CREATE INDEX idx_cliente_familiar_cliente ON public.cliente_familiar(cliente_id);


-- ── Pagos, devoluciones y créditos ──
CREATE TABLE public.cliente_pagos (
  id         UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID           NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo       TEXT           NOT NULL,   -- pago | devolucion | credito
  monto      NUMERIC(12,2)  NOT NULL,
  moneda     TEXT           DEFAULT 'BOB',
  concepto   TEXT,
  fecha      DATE           DEFAULT CURRENT_DATE,
  estado     TEXT           DEFAULT 'completado',   -- completado | pendiente | cancelado
  referencia TEXT,
  created_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can manage cliente_pagos" ON public.cliente_pagos FOR ALL TO anon, authenticated USING (true);
CREATE INDEX idx_cliente_pagos_cliente ON public.cliente_pagos(cliente_id);
