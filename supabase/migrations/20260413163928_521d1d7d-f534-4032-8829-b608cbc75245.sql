-- Create enum for gestion types
CREATE TYPE public.gestion_type AS ENUM ('comercial', 'proyecto', 'operativa', 'caso');

-- Add type and subtype columns to gestiones
ALTER TABLE public.gestiones ADD COLUMN type public.gestion_type NOT NULL DEFAULT 'operativa';
ALTER TABLE public.gestiones ADD COLUMN subtype text;