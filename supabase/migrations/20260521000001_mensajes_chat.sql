-- Tabla de mensajes del chat interno del equipo C&C
CREATE TABLE IF NOT EXISTS public.mensajes_chat (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  mensaje     TEXT NOT NULL CHECK (char_length(trim(mensaje)) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para cargar los últimos N mensajes eficientemente
CREATE INDEX IF NOT EXISTS mensajes_chat_created_at_idx
  ON public.mensajes_chat (created_at DESC);

-- Habilitar RLS
ALTER TABLE public.mensajes_chat ENABLE ROW LEVEL SECURITY;

-- Política: solo usuarios activos del sistema pueden leer y escribir
CREATE POLICY "equipo_puede_leer_chat" ON public.mensajes_chat
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.usuarios WHERE activo = true)
  );

CREATE POLICY "equipo_puede_escribir_chat" ON public.mensajes_chat
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT id FROM public.usuarios WHERE activo = true)
    AND auth.uid() = usuario_id
  );

-- Habilitar Realtime para esta tabla
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes_chat;
