-- Tabla: notas_rapidas
-- Notas personales diarias vinculadas al calendario de cada analista.
-- Una sola nota por usuario por día (UNIQUE constraint).
CREATE TABLE IF NOT EXISTS notas_rapidas (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id           UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha                DATE        NOT NULL,
  contenido            TEXT,
  sincronizado_google  BOOLEAN     DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(usuario_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_notas_usuario_fecha ON notas_rapidas(usuario_id, fecha);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notas_rapidas_updated_at
  BEFORE UPDATE ON notas_rapidas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: cada usuario solo ve y edita sus propias notas
ALTER TABLE notas_rapidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario_solo_sus_notas_select" ON notas_rapidas
  FOR SELECT USING (usuario_id = auth.uid());

CREATE POLICY "usuario_solo_sus_notas_insert" ON notas_rapidas
  FOR INSERT WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "usuario_solo_sus_notas_update" ON notas_rapidas
  FOR UPDATE USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "usuario_solo_sus_notas_delete" ON notas_rapidas
  FOR DELETE USING (usuario_id = auth.uid());
