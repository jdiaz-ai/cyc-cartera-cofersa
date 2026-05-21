'use client'

/**
 * useChat
 *
 * Hook que maneja el estado del chat interno del equipo:
 *   - Carga los últimos 50 mensajes al montar
 *   - Suscripción Realtime para mensajes nuevos en tiempo real
 *   - Supabase Presence para saber quién está conectado
 *   - Función para enviar mensajes vía POST /api/chat
 */

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MensajeChatConUsuario, PresenciaChat } from '@/types/database'

interface UseChatOptions {
  usuarioId: string
  nombre:    string
  iniciales: string
  color:     string
}

export function useChat({ usuarioId, nombre, iniciales, color }: UseChatOptions) {
  const [mensajes,   setMensajes]   = useState<MensajeChatConUsuario[]>([])
  const [conectados, setConectados] = useState<PresenciaChat[]>([])
  const [cargando,   setCargando]   = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  const supabase = createClient()

  // ── Carga inicial: últimos 50 mensajes ──────────────────────────────
  useEffect(() => {
    if (!usuarioId) return

    async function cargar() {
      setCargando(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: fetchErr } = await (supabase as any)
        .from('mensajes_chat')
        .select('*, usuario:usuarios!usuario_id(nombre, iniciales, color)')
        .order('created_at', { ascending: true })
        .limit(50)

      if (fetchErr) {
        setError('No se pudieron cargar los mensajes.')
        console.error('[useChat] Error cargando mensajes:', fetchErr.message)
      } else {
        setMensajes(data ?? [])
      }
      setCargando(false)
    }

    cargar()
  }, [usuarioId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: mensajes nuevos ────────────────────────────────────────
  useEffect(() => {
    if (!usuarioId) return

    const channel = supabase
      .channel('mensajes_chat_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes_chat' },
        async (payload) => {
          // Fetch el mensaje completo con datos del usuario
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from('mensajes_chat')
            .select('*, usuario:usuarios!usuario_id(nombre, iniciales, color)')
            .eq('id', payload.new.id)
            .single()

          if (data) {
            setMensajes(prev => [...prev, data as MensajeChatConUsuario])
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [usuarioId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Presence: quién está conectado ──────────────────────────────────
  useEffect(() => {
    if (!usuarioId) return

    const channel = supabase.channel('presencia_equipo_cyc', {
      config: { presence: { key: usuarioId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenciaChat>()
        const lista: PresenciaChat[] = Object.values(state).flatMap(arr => arr as PresenciaChat[])
        setConectados(lista)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            usuario_id: usuarioId,
            nombre,
            iniciales,
            color,
            online_at:  new Date().toISOString(),
          })
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [usuarioId, nombre, iniciales, color]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Enviar mensaje ───────────────────────────────────────────────────
  const enviarMensaje = useCallback(async (texto: string): Promise<boolean> => {
    const trimmed = texto.trim()
    if (!trimmed) return false

    const res = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mensaje: trimmed }),
    })

    return res.ok
  }, [])

  return { mensajes, conectados, cargando, error, enviarMensaje }
}
