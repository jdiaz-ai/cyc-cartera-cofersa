-- ============================================================
-- Migración: numero_consecutivo en solicitudes
-- Fecha: 2026-05-17
-- ============================================================
-- Secuencia independiente de la PK (UUID).
-- El numero_consecutivo es el que se muestra en la UI como SIC-XXXXX.
-- La tabla está vacía al aplicar esta migración.

CREATE SEQUENCE IF NOT EXISTS solicitudes_consecutivo_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS numero_consecutivo INTEGER
    NOT NULL
    DEFAULT nextval('solicitudes_consecutivo_seq');

-- Índice único para garantizar no-colisiones
CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitudes_numero_consecutivo
  ON solicitudes (numero_consecutivo);

-- Asegurar que la secuencia es propiedad de la columna
-- (garantiza que se elimina junto con la columna si alguna vez se droppea)
ALTER SEQUENCE solicitudes_consecutivo_seq
  OWNED BY solicitudes.numero_consecutivo;
