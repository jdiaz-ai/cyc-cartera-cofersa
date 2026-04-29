-- ================================================================
-- CYC COFERSA v3.0 — Schema Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- ── Tabla de usuarios del sistema ────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        UNIQUE NOT NULL,
  nombre       TEXT        NOT NULL,
  rol          TEXT        NOT NULL CHECK (rol IN ('COORDINADOR', 'ANALISTA')),
  iniciales    TEXT        NOT NULL,
  color        TEXT        NOT NULL DEFAULT '#009ee3',
  activo       BOOLEAN     NOT NULL DEFAULT true,
  meta_individual NUMERIC  NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tabla de cartera (sync Softland 3x/día) ──────────────────────
CREATE TABLE IF NOT EXISTS cartera (
  id              BIGSERIAL   PRIMARY KEY,
  contribuyente   TEXT        NOT NULL,
  cliente_cod     TEXT        NOT NULL,
  cliente_nombre  TEXT        NOT NULL,
  vendedor_nombre TEXT,
  no_vencido      NUMERIC     NOT NULL DEFAULT 0,
  mora_1_30       NUMERIC     NOT NULL DEFAULT 0,
  mora_31_60      NUMERIC     NOT NULL DEFAULT 0,
  mora_61_90      NUMERIC     NOT NULL DEFAULT 0,
  mora_91_120     NUMERIC     NOT NULL DEFAULT 0,
  mora_120_plus   NUMERIC     NOT NULL DEFAULT 0,
  total           NUMERIC     NOT NULL DEFAULT 0,
  dias_mora       INTEGER     NOT NULL DEFAULT 0,
  estado          TEXT,
  sync_id         TEXT,
  fecha_corte     TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contribuyente, cliente_cod)
);

-- ── Tabla de facturas (sync Softland) ────────────────────────────
CREATE TABLE IF NOT EXISTS facturas (
  id                BIGSERIAL   PRIMARY KEY,
  contribuyente     TEXT        NOT NULL,
  cliente_nombre    TEXT,
  documento         TEXT        NOT NULL,
  fecha_documento   TEXT,
  fecha_vencimiento TEXT,
  monto             NUMERIC     NOT NULL DEFAULT 0,
  saldo             NUMERIC     NOT NULL DEFAULT 0,
  sync_id           TEXT,
  UNIQUE (contribuyente, documento)
);

-- ── Maestro de clientes (gestionado por el equipo) ───────────────
CREATE TABLE IF NOT EXISTS maestro_clientes (
  id                    BIGSERIAL   PRIMARY KEY,
  contribuyente         TEXT        NOT NULL UNIQUE,
  cliente_cod           TEXT        NOT NULL,
  cliente_nombre        TEXT        NOT NULL,
  vendedor_nombre       TEXT,
  analista_email        TEXT,
  telefono              TEXT,
  correo                TEXT,
  segmento              TEXT,
  limite_credito        NUMERIC     DEFAULT 0,
  condicion_pago        TEXT,
  promedio_dias_pago    NUMERIC     DEFAULT 0,
  desviacion_pago       NUMERIC     DEFAULT 0,
  responde_recordatorio BOOLEAN     DEFAULT false,
  mejor_mes_pago        TEXT,
  promesas_cumplidas_pct NUMERIC    DEFAULT 0,
  ultima_vez_pagado     TEXT,
  monto_promedio_pago   NUMERIC     DEFAULT 0,
  score_riesgo          NUMERIC     DEFAULT 0,
  estado_manual         TEXT,
  notas_internas        TEXT,
  agrupacion            TEXT,
  zona                  TEXT,
  latitud               NUMERIC,
  longitud              NUMERIC,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Gestiones de cobro ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestiones (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_cod     TEXT        NOT NULL,
  contribuyente   TEXT,
  analista_email  TEXT        NOT NULL,
  fecha           DATE        NOT NULL DEFAULT CURRENT_DATE,
  hora            TEXT        NOT NULL DEFAULT '00:00',
  tipo            TEXT        NOT NULL,  -- LLAMADA, CORREO, VISITA, WHATSAPP
  resultado       TEXT        NOT NULL,  -- CONTACTO, NO_CONTESTO, PROMESA, etc.
  nota            TEXT,
  promesa_fecha   DATE,
  promesa_monto   NUMERIC     DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Promesas de pago ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promesas (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_cod     TEXT        NOT NULL,
  contribuyente   TEXT,
  analista_email  TEXT        NOT NULL,
  fecha_creacion  DATE        NOT NULL DEFAULT CURRENT_DATE,
  monto           NUMERIC     NOT NULL DEFAULT 0,
  fecha_promesa   DATE        NOT NULL,
  estado          TEXT        NOT NULL DEFAULT 'PENDIENTE'
                  CHECK (estado IN ('PENDIENTE', 'CUMPLIDA', 'INCUMPLIDA', 'ABONO_PARCIAL')),
  notas           TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Configuración del sistema ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS config_sistema (
  clave       TEXT PRIMARY KEY,
  valor       TEXT NOT NULL,
  descripcion TEXT
);

-- Valores por defecto
INSERT INTO config_sistema (clave, valor, descripcion)
VALUES
  ('META_MENSUAL',            '2705449000', 'Meta mensual de cobro en CRC'),
  ('DIAS_SIN_GESTION_ALERTA', '5',          'Días sin gestión para mostrar alerta'),
  ('UMBRAL_SCORE_RIESGO_ALTO','70',         'Score a partir del cual se considera ROJO')
ON CONFLICT (clave) DO NOTHING;

-- ── Usuarios iniciales ────────────────────────────────────────────
-- Ejecutar DESPUÉS de que los usuarios hagan login con Google por primera vez
-- (su email quedará registrado en Supabase Auth)

INSERT INTO usuarios (email, nombre, rol, iniciales, color, activo, meta_individual)
VALUES
  ('jdiaz@cofersa.cr',      'Jeffrey Díaz',          'COORDINADOR', 'JD', '#003B5C', true, 0),
  ('mprodriguez@cofersa.cr','María Paola Rodríguez', 'ANALISTA',    'MP', '#009ee3', true, 500000000),
  ('pchavarria@cofersa.cr', 'Paula Chavarría',        'ANALISTA',    'PC', '#7c3aed', true, 500000000),
  ('agomez@cofersa.cr',     'Angélica Gómez',         'ANALISTA',    'AG', '#059669', true, 500000000),
  ('gmilano@cofersa.cr',    'Giovanny Milano',        'ANALISTA',    'GM', '#dc2626', true, 500000000)
ON CONFLICT (email) DO NOTHING;

-- ── Row Level Security (RLS) ──────────────────────────────────────

-- Habilitar RLS en todas las tablas
ALTER TABLE usuarios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartera           ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE maestro_clientes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestiones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE promesas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_sistema    ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados pueden leer todo
CREATE POLICY "Lectura para usuarios autenticados" ON usuarios
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Lectura para usuarios autenticados" ON cartera
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Lectura para usuarios autenticados" ON facturas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Lectura para usuarios autenticados" ON maestro_clientes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Lectura para usuarios autenticados" ON gestiones
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Lectura para usuarios autenticados" ON promesas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Lectura para usuarios autenticados" ON config_sistema
  FOR SELECT USING (auth.role() = 'authenticated');

-- Gestiones: analista solo puede insertar/actualizar las propias
CREATE POLICY "Analista inserta sus gestiones" ON gestiones
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND
    analista_email = auth.jwt() ->> 'email'
  );

CREATE POLICY "Analista actualiza sus gestiones" ON gestiones
  FOR UPDATE USING (
    analista_email = auth.jwt() ->> 'email'
  );

-- Promesas: analista solo puede insertar/actualizar las propias
CREATE POLICY "Analista inserta sus promesas" ON promesas
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' AND
    analista_email = auth.jwt() ->> 'email'
  );

CREATE POLICY "Analista actualiza sus promesas" ON promesas
  FOR UPDATE USING (
    analista_email = auth.jwt() ->> 'email'
  );

-- Config: solo lectura para usuarios normales (escritura vía service role)
-- (ya cubierta con la política de lectura anterior)

-- Maestro clientes: escritura para cualquier autenticado (el equipo puede editar)
CREATE POLICY "Escritura maestro clientes autenticados" ON maestro_clientes
  FOR ALL USING (auth.role() = 'authenticated');

-- ── Índices ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cartera_contribuyente  ON cartera (contribuyente);
CREATE INDEX IF NOT EXISTS idx_cartera_cliente_cod    ON cartera (cliente_cod);
CREATE INDEX IF NOT EXISTS idx_facturas_contribuyente ON facturas (contribuyente);
CREATE INDEX IF NOT EXISTS idx_gestiones_fecha        ON gestiones (fecha);
CREATE INDEX IF NOT EXISTS idx_gestiones_analista     ON gestiones (analista_email);
CREATE INDEX IF NOT EXISTS idx_promesas_estado        ON promesas (estado);
CREATE INDEX IF NOT EXISTS idx_promesas_fecha         ON promesas (fecha_promesa);
CREATE INDEX IF NOT EXISTS idx_mc_analista            ON maestro_clientes (analista_email);
