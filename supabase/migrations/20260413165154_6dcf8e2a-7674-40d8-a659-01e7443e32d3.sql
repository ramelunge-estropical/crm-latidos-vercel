-- processes: allow anon
CREATE POLICY "Anon users can view processes" ON public.processes FOR SELECT TO anon USING (true);
CREATE POLICY "Anon users can create processes" ON public.processes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon users can update processes" ON public.processes FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon users can delete processes" ON public.processes FOR DELETE TO anon USING (true);

-- pipeline_stages: allow anon
CREATE POLICY "Anon users can view stages" ON public.pipeline_stages FOR SELECT TO anon USING (true);
CREATE POLICY "Anon users can create stages" ON public.pipeline_stages FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon users can update stages" ON public.pipeline_stages FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon users can delete stages" ON public.pipeline_stages FOR DELETE TO anon USING (true);

-- gestiones: allow anon
CREATE POLICY "Anon users can view gestiones" ON public.gestiones FOR SELECT TO anon USING (true);
CREATE POLICY "Anon users can create gestiones" ON public.gestiones FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon users can update gestiones" ON public.gestiones FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon users can delete gestiones" ON public.gestiones FOR DELETE TO anon USING (true);

-- stage_rules: allow anon
CREATE POLICY "Anon users can view stage_rules" ON public.stage_rules FOR SELECT TO anon USING (true);
CREATE POLICY "Anon users can manage stage_rules" ON public.stage_rules FOR ALL TO anon USING (true) WITH CHECK (true);

-- stage_history: allow anon
CREATE POLICY "Anon users can view stage_history" ON public.stage_history FOR SELECT TO anon USING (true);
CREATE POLICY "Anon users can insert stage_history" ON public.stage_history FOR INSERT TO anon WITH CHECK (true);