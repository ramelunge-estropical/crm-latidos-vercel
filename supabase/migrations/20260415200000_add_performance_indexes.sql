-- Índices de performance para las queries más frecuentes

-- gestiones: filtros principales
CREATE INDEX IF NOT EXISTS idx_gestiones_process_id      ON gestiones(process_id);
CREATE INDEX IF NOT EXISTS idx_gestiones_stage_id        ON gestiones(stage_id);
CREATE INDEX IF NOT EXISTS idx_gestiones_responsable_id  ON gestiones(responsable_id);
CREATE INDEX IF NOT EXISTS idx_gestiones_type            ON gestiones(type);
CREATE INDEX IF NOT EXISTS idx_gestiones_due_date        ON gestiones(due_date);

-- pipeline_stages: join frecuente con gestiones
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_process_id ON pipeline_stages(process_id);

-- gestion_tareas: siempre filtrada por gestion_id
CREATE INDEX IF NOT EXISTS idx_gestion_tareas_gestion_id ON gestion_tareas(gestion_id);

-- gestion_comments / gestion_attachments: filtrados por gestion_id
CREATE INDEX IF NOT EXISTS idx_gestion_comments_gestion_id    ON gestion_comments(gestion_id);
CREATE INDEX IF NOT EXISTS idx_gestion_attachments_gestion_id ON gestion_attachments(gestion_id);

-- stage_history: filtrado por gestion_id y rango de fecha
CREATE INDEX IF NOT EXISTS idx_stage_history_gestion_id  ON stage_history(gestion_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_changed_at  ON stage_history(changed_at);

-- activities: filtrado por gestion_id y rango de scheduled_at
CREATE INDEX IF NOT EXISTS idx_activities_gestion_id    ON activities(gestion_id);
CREATE INDEX IF NOT EXISTS idx_activities_scheduled_at  ON activities(scheduled_at);

-- colaboradores: filtro activo
CREATE INDEX IF NOT EXISTS idx_colaboradores_activo ON colaboradores(activo);
