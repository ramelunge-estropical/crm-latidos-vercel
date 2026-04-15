import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Colaborador {
  id: string;
  nombre: string;
  cargo: string;
  color: string;
  email: string;
  activo: boolean;
  rol: string;
  area_id: string | null;
}

export interface AreaEmpresa {
  id: string;
  nombre: string;
  color: string;
}

const STALE_5MIN  = 5  * 60 * 1000;
const STALE_10MIN = 10 * 60 * 1000;

function dedupByEmail<T extends { id: string; email?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((c) => {
    const key = c.email || c.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// useColaboradores — solo activos (para selectors en gestiones)
export function useColaboradores() {
  return useQuery<Colaborador[]>({
    queryKey: ["colaboradores"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("colaboradores")
        .select("id, nombre, cargo, color, email, activo, rol, area_id")
        .eq("activo", true)
        .order("nombre");
      if (error) return [];
      return dedupByEmail(data as Colaborador[]);
    },
    staleTime: STALE_5MIN,
  });
}

// useAllColaboradores — todos (para gestión en Configuraciones)
export function useAllColaboradores() {
  return useQuery<Colaborador[]>({
    queryKey: ["colaboradores-all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("colaboradores")
        .select("id, nombre, cargo, color, email, activo, rol, area_id")
        .order("nombre");
      if (error) return [];
      return dedupByEmail(data as Colaborador[]);
    },
    staleTime: STALE_5MIN,
  });
}

export function useProcesses() {
  return useQuery({
    queryKey: ["processes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: STALE_5MIN,
  });
}

export function useAllStages() {
  return useQuery({
    queryKey: ["all-stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id, process_id, global_status, order, name")
        .order("order");
      if (error) throw error;
      return data as any[];
    },
    staleTime: STALE_5MIN,
  });
}

export interface GestionTipo {
  id: string;
  nombre: string;
  valor: string;
  color: string;
  orden: number;
  activo: boolean;
}

export interface GestionSubtipo {
  id: string;
  tipo_id: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export function useGestionTipos() {
  return useQuery<GestionTipo[]>({
    queryKey: ["gestion-tipos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gestion_tipos")
        .select("id, nombre, valor, color, orden, activo")
        .order("orden");
      if (error) return [];
      return data as GestionTipo[];
    },
    staleTime: STALE_10MIN,
  });
}

export function useGestionSubtipos() {
  return useQuery<GestionSubtipo[]>({
    queryKey: ["gestion-subtipos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gestion_subtipos")
        .select("id, tipo_id, nombre, orden, activo")
        .order("orden");
      if (error) return [];
      return data as GestionSubtipo[];
    },
    staleTime: STALE_10MIN,
  });
}

export function useProcessAreas() {
  return useQuery<{ process_id: string; area_id: string }[]>({
    queryKey: ["process-areas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("process_areas")
        .select("process_id, area_id");
      if (error) return [];
      return data;
    },
    staleTime: STALE_5MIN,
  });
}

export function useAreasEmpresa() {
  return useQuery<AreaEmpresa[]>({
    queryKey: ["areas_empresa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("areas_empresa")
        .select("id, nombre, color")
        .order("nombre");
      if (error) return [];
      // Dedup por nombre (el seed puede haber corrido más de una vez)
      const seen = new Set<string>();
      return (data as AreaEmpresa[]).filter(a => {
        if (seen.has(a.nombre)) return false;
        seen.add(a.nombre);
        return true;
      });
    },
    staleTime: STALE_10MIN,
  });
}
