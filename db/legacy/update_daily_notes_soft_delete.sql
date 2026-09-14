-- Agregar la columna 'habilita' a daily_notes (si no existe)
ALTER TABLE daily_notes 
ADD COLUMN IF NOT EXISTS habilita INTEGER DEFAULT 1;

-- Política de lectura: solo notas de HOY con habilita = 1
-- Usamos DATE(created_at) para compatibilidad con timestamptz
DROP POLICY IF EXISTS "Authenticated users can view today notes" ON daily_notes;
CREATE POLICY "Authenticated users can view today notes"
    ON daily_notes FOR SELECT
    TO authenticated
    USING (DATE(created_at) = CURRENT_DATE AND habilita = 1);

-- Política de actualización: permite actualizar CUALQUIER nota propia
-- (necesario para poder deshabilitar notas de días anteriores con habilita=0)
DROP POLICY IF EXISTS "Authenticated users can update today notes" ON daily_notes;
CREATE POLICY "Authenticated users can update their notes"
    ON daily_notes FOR UPDATE
    TO authenticated
    USING (true);

-- Política de inserción: solo para usuarios autenticados
DROP POLICY IF EXISTS "Authenticated users can insert notes" ON daily_notes;
CREATE POLICY "Authenticated users can insert notes"
    ON daily_notes FOR INSERT
    TO authenticated
    WITH CHECK (true);
