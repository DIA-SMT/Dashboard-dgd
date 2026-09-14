-- ==============================================
-- daily_notes: Script Completo (Creación + Soft Delete + Realtime Seguro)
-- ==============================================

-- 1. Crear tabla si no existe
CREATE TABLE IF NOT EXISTS daily_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    content TEXT NOT NULL,
    done BOOLEAN DEFAULT FALSE,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    member_id UUID,
    member_name TEXT
);

-- 2. Asegurar columnas (Soft Delete + Miembros)
ALTER TABLE daily_notes 
ADD COLUMN IF NOT EXISTS habilita INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS member_id UUID,
ADD COLUMN IF NOT EXISTS member_name TEXT;

-- Convertir created_at si era DATE (para seguridad si ya existe)
ALTER TABLE daily_notes 
ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ,
ALTER COLUMN created_at SET DEFAULT now();

-- 3. Habilitar RLS
ALTER TABLE daily_notes ENABLE ROW LEVEL SECURITY;

-- 4. Limpiar políticas viejas
DROP POLICY IF EXISTS "Authenticated users can view today notes" ON daily_notes;
DROP POLICY IF EXISTS "Authenticated users can insert notes" ON daily_notes;
DROP POLICY IF EXISTS "Authenticated users can update today notes" ON daily_notes;
DROP POLICY IF EXISTS "Authenticated users can delete today notes" ON daily_notes;

-- 5. Nuevas Políticas

-- Ver: Solo habilitadas (Quitamos CURRENT_DATE para que el borrado lógico no falle si se hace justo al cambio de día, la lógica de la app ya filtra por fecha)
CREATE POLICY "Authenticated users can view notes"
    ON daily_notes FOR SELECT TO authenticated
    USING (habilita = 1);

-- Insertar: Permitir inserción a cualquier usuario autenticado
CREATE POLICY "Authenticated users can insert notes"
    ON daily_notes FOR INSERT TO authenticated
    WITH CHECK (true);

-- Actualizar: Permitir actualizar si la nota ESTABA habilitada. 
-- El check (TRUE) permite que cambie a habilita = 0 sin error.
CREATE POLICY "Authenticated users can update notes"
    ON daily_notes FOR UPDATE TO authenticated
    USING (habilita = 1)
    WITH CHECK (true);

-- Borrar: Permitir borrar físicamente si fuera necesario (aunque no se usa en la app)
CREATE POLICY "Authenticated users can delete notes"
    ON daily_notes FOR DELETE TO authenticated
    USING (true);

-- 6. Realtime (Seguro: verifica si ya existe)
DO $$
BEGIN
  IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_class pc ON pr.prrelid = pc.oid
      JOIN pg_publication pp ON pr.prpubid = pp.oid
      WHERE pp.pubname = 'supabase_realtime' AND pc.relname = 'daily_notes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_notes;
  END IF;
END $$;
