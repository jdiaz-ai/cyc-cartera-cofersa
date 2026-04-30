-- ================================================================
-- CYC COFERSA v3.0 — Migración 001
-- Tablas: solicitudes, coordinaciones_vendedor, notificaciones
--
-- INSTRUCCIONES:
-- Supabase Dashboard → SQL Editor → New Query → pegar y ejecutar
-- ================================================================


-- ── 1. SOLICITUDES ───────────────────────────────────────────────
-- Reemplaza el flujo de aprobaciones por WhatsApp/correo.
-- Tipos: AUMENTO_LIMITE | EXCEPCION_CREDITO | NOTA_CREDITO
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS solicitudes (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tipo de solicitud
  tipo                TEXT          NOT NULL
                      CHECK (tipo IN ('AUMENTO_LIMITE', 'EXCEPCION_CREDITO', 'NOTA_CREDITO')),

  -- Cliente relacionado (BIGINT porque maestro_clientes.id es BIGSERIAL)
  cliente_id          BIGINT        REFERENCES maestro_clientes(id) ON DELETE SET NULL,
  cliente_cod         TEXT,         -- copia del código por legibilidad
  cliente_nombre      TEXT,         -- copia del nombre por legibilidad

  -- Usuarios involucrados (UUID porque usuarios.id es UUID)
  solicitante_id      UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  revisor_id          UUID          REFERENCES usuarios(id) ON DELETE SET NULL,

  -- Campos financieros
  monto_actual        NUMERIC(15,2),   -- límite de crédito actual (para AUMENTO_LIMITE)
  monto_solicitado    NUMERIC(15,2),   -- límite o monto solicitado
  monto              NUMERIC(15,2),    -- monto general (EXCEPCION_CREDITO, NOTA_CREDITO)

  -- Campos de texto
  justificacion       TEXT          NOT NULL,
  comentario_revisor  TEXT,
  motivo_nota         TEXT,         -- solo NOTA_CREDITO: Devolución | Error facturación | Descuento | Otro
  documento_ref       TEXT,         -- solo NOTA_CREDITO: número de documento
  fecha_limite        DATE,         -- solo EXCEPCION_CREDITO: hasta cuándo aplica

  -- Estado del flujo
  estado              TEXT          NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA')),

  -- Timestamps
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER solicitudes_updated_at
  BEFORE UPDATE ON solicitudes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE solicitudes ENABLE ROW LEVEL SECURITY;

-- Coordinador ve todas las solicitudes
CREATE POLICY "Coordinador lee todas las solicitudes" ON solicitudes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.rol = 'COORDINADOR'
    )
  );

-- Analista solo ve las suyas
CREATE POLICY "Analista lee sus propias solicitudes" ON solicitudes
  FOR SELECT USING (
    solicitante_id = auth.uid()
  );

-- Cualquier usuario autenticado puede crear solicitudes
CREATE POLICY "Usuario autenticado puede crear solicitudes" ON solicitudes
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND solicitante_id = auth.uid()
  );

-- Coordinador puede actualizar (aprobar/rechazar)
CREATE POLICY "Coordinador actualiza solicitudes" ON solicitudes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.rol = 'COORDINADOR'
    )
  );

-- Analista puede actualizar solo las suyas (mientras PENDIENTE)
CREATE POLICY "Analista actualiza sus solicitudes pendientes" ON solicitudes
  FOR UPDATE USING (
    solicitante_id = auth.uid()
    AND estado = 'PENDIENTE'
  );

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado        ON solicitudes (estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitante   ON solicitudes (solicitante_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_cliente       ON solicitudes (cliente_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_created       ON solicitudes (created_at DESC);


-- ── 2. COORDINACIONES_VENDEDOR ────────────────────────────────────
-- Registro de acuerdos y seguimientos entre analistas y vendedores.
-- Reemplaza los hilos de WhatsApp con el equipo comercial.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coordinaciones_vendedor (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cliente relacionado
  cliente_id      BIGINT      REFERENCES maestro_clientes(id) ON DELETE SET NULL,
  cliente_cod     TEXT,
  cliente_nombre  TEXT,

  -- Analista que coordina
  analista_id     UUID        REFERENCES usuarios(id) ON DELETE SET NULL,

  -- Vendedor (texto porque viene de Softland, no tiene tabla propia)
  vendedor        TEXT        NOT NULL,

  -- Datos de la coordinación
  fecha           DATE        NOT NULL DEFAULT CURRENT_DATE,
  acuerdo         TEXT,       -- qué se acordó con el vendedor
  pendiente       TEXT,       -- qué queda pendiente de resolver
  fecha_seguimiento DATE,     -- cuándo hacer el próximo seguimiento

  -- Estado
  estado          TEXT        NOT NULL DEFAULT 'PENDIENTE'
                  CHECK (estado IN ('PENDIENTE', 'EN_PROCESO', 'CERRADO')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE coordinaciones_vendedor ENABLE ROW LEVEL SECURITY;

-- Coordinador ve todas
CREATE POLICY "Coordinador lee todas las coordinaciones" ON coordinaciones_vendedor
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.rol = 'COORDINADOR'
    )
  );

-- Analista ve solo las suyas
CREATE POLICY "Analista lee sus coordinaciones" ON coordinaciones_vendedor
  FOR SELECT USING (
    analista_id = auth.uid()
  );

-- Insertar: cualquier autenticado
CREATE POLICY "Usuario autenticado crea coordinaciones" ON coordinaciones_vendedor
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND analista_id = auth.uid()
  );

-- Actualizar: el propio analista o el coordinador
CREATE POLICY "Analista o coordinador actualiza coordinaciones" ON coordinaciones_vendedor
  FOR UPDATE USING (
    analista_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
      AND usuarios.rol = 'COORDINADOR'
    )
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_coord_analista  ON coordinaciones_vendedor (analista_id);
CREATE INDEX IF NOT EXISTS idx_coord_cliente   ON coordinaciones_vendedor (cliente_id);
CREATE INDEX IF NOT EXISTS idx_coord_estado    ON coordinaciones_vendedor (estado);
CREATE INDEX IF NOT EXISTS idx_coord_fecha     ON coordinaciones_vendedor (fecha DESC);


-- ── 3. NOTIFICACIONES ────────────────────────────────────────────
-- Notificaciones internas del sistema.
-- El badge del sidebar muestra el count de notificaciones no leídas.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notificaciones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A quién va dirigida
  usuario_id  UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  -- Clasificación
  tipo        TEXT        NOT NULL
              CHECK (tipo IN ('SOLICITUD', 'PROMESA', 'ALERTA', 'SYNC')),

  -- Contenido
  titulo      TEXT        NOT NULL,
  mensaje     TEXT,

  -- Estado
  leida       BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Ruta interna a donde lleva (ej: '/solicitudes/uuid-123')
  link        TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS — cada usuario solo ve sus propias notificaciones
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve sus propias notificaciones" ON notificaciones
  FOR SELECT USING (usuario_id = auth.uid());

CREATE POLICY "Sistema puede insertar notificaciones" ON notificaciones
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- El usuario puede marcar las suyas como leídas
CREATE POLICY "Usuario actualiza sus notificaciones" ON notificaciones
  FOR UPDATE USING (usuario_id = auth.uid());

-- Índices
CREATE INDEX IF NOT EXISTS idx_notif_usuario       ON notificaciones (usuario_id);
CREATE INDEX IF NOT EXISTS idx_notif_leida         ON notificaciones (leida) WHERE leida = FALSE;
CREATE INDEX IF NOT EXISTS idx_notif_created       ON notificaciones (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_usuario_leida ON notificaciones (usuario_id, leida);


-- ── VERIFICACIÓN FINAL ────────────────────────────────────────────
-- Correr esto al final para confirmar que todo quedó bien:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('solicitudes', 'coordinaciones_vendedor', 'notificaciones');
-- ─────────────────────────────────────────────────────────────────
