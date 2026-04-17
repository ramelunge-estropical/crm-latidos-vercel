-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Abrir escritura a anon en tablas que solo permitían authenticated
-- La app usa la clave anon (sin auth real), por eso el INSERT/UPDATE/DELETE
-- falla con "new row violates row-level security policy".
-- ═══════════════════════════════════════════════════════════════════════════

-- ── areas_empresa ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_read_areas"        ON areas_empresa;
DROP POLICY IF EXISTS "auth_all_areas"         ON areas_empresa;
DROP POLICY IF EXISTS "Allow all areas_empresa" ON areas_empresa;
CREATE POLICY "Allow all areas_empresa"
  ON areas_empresa FOR ALL
  USING (true) WITH CHECK (true);

-- ── processes ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view processes"   ON processes;
DROP POLICY IF EXISTS "Authenticated users can create processes" ON processes;
DROP POLICY IF EXISTS "Authenticated users can update processes" ON processes;
DROP POLICY IF EXISTS "Authenticated users can delete processes" ON processes;
DROP POLICY IF EXISTS "Allow all processes"                      ON processes;
CREATE POLICY "Allow all processes"
  ON processes FOR ALL
  USING (true) WITH CHECK (true);

-- ── pipeline_stages ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view stages"   ON pipeline_stages;
DROP POLICY IF EXISTS "Authenticated users can create stages" ON pipeline_stages;
DROP POLICY IF EXISTS "Authenticated users can update stages" ON pipeline_stages;
DROP POLICY IF EXISTS "Authenticated users can delete stages" ON pipeline_stages;
DROP POLICY IF EXISTS "Allow all pipeline_stages"             ON pipeline_stages;
CREATE POLICY "Allow all pipeline_stages"
  ON pipeline_stages FOR ALL
  USING (true) WITH CHECK (true);

-- ── gestiones ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view gestiones"   ON gestiones;
DROP POLICY IF EXISTS "Authenticated users can create gestiones" ON gestiones;
DROP POLICY IF EXISTS "Authenticated users can update gestiones" ON gestiones;
DROP POLICY IF EXISTS "Authenticated users can delete gestiones" ON gestiones;
DROP POLICY IF EXISTS "Allow all gestiones"                      ON gestiones;
CREATE POLICY "Allow all gestiones"
  ON gestiones FOR ALL
  USING (true) WITH CHECK (true);

-- ── gestion_tareas ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'gestion_tareas') THEN
    EXECUTE $q$
      DROP POLICY IF EXISTS "Allow all gestion_tareas" ON gestion_tareas;
      CREATE POLICY "Allow all gestion_tareas"
        ON gestion_tareas FOR ALL USING (true) WITH CHECK (true);
    $q$;
  END IF;
END $$;
