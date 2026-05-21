'use client'

/**
 * useChat
 *
 * Hook que maneja el estado del chat interno del equipo C&C.
 *   - Carga los últimos 50 mensajes al montar
 *   - Suscripción Realtime para mensajes nuevos en tiempo real
 *   - Supabase Presence para saber quién está conectado
 *   - Función para enviar mensajes vía POST /api/chat
 *
 * DISEÑO REALTIME:
 *   Los usuarios del equipo se cargan en un ref al inicio. Cuando llega un
 *   INSERT vía postgres_changes, el mensaje se construye directamente desde
 *   el payload + el cache de usuarios — sin segunda consulta al servidor.
 *   Esto hace que el mensaje aparezca en < 200ms sin depender de un segundo
 *   round-trip que antes fallaba silenciosamente por RLS.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MensajeChatConUsuario, PresenciaChat } from '@/types/database'

interface UseChatOptions {
  usuarioId: string
  nombre:    string
  iniciales: string
  color:     string
}

type UsuarioInfo = { nombre: string; iniciales: string; color: string }

export function useChat({ usuarioId, nombre, iniciales, color }: UseChatOptions) {
  const [mensajes,   setMensajes]   = useState<MensajeChatConUsuario[]>([])
  const [conectados, setConectados] = useState<PresenciaChat[]>([])
  const [cargando,   setCargando]   = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  // Cache de usuarios para decorar mensajes Realtime sin secondary fetch
  const usuariosRef = useRef<Map<string, UsuarioInfo>>(new Map())

  const supabase = createClient()

  // ── Cargar usuarios activos del equipo (cache para Realtime) ────────
  // Solo 5 usuarios — carga trivial. Garantiza que cuando llegue un
  // mensaje nuevo vía Realtime, ya tenemos el nombre/iniciales/color.
  useEffect(() => {
    async function cargarUsuarios() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('usuarios')
        .select('id, nombre, iniciales, color')
        .eq('activo', true)
      if (data) {
        const map = new Map<string, UsuarioInfo>()
        for (const u of data as { id: string; nombre: string; iniciales: string; color: string }[]) {
          map.set(u.id, { nombre: u.nombre, iniciales: u.iniciales, color: u.color })
        }
        usuariosRef.current = map
      }
    }
    cargarUsuarios()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        // Aprovechar mensajes cargados para enriquecer el cache de usuarios
        for (const msg of (data ?? []) as MensajeChatConUsuario[]) {
          if (msg.usuario && !usuariosRef.current.has(msg.usuario_id)) {
            usuariosRef.current.set(msg.usuario_id, msg.usuario as UsuarioInfo)
          }
        }
      }
      setCargando(false)
    }

    cargar()
  }, [usuarioId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: mensajes nuevos ────────────────────────────────────────
  // Sin secondary fetch — mensaje aparece en tiempo real instantáneamente.
  // El cache usuariosRef provee nombre/iniciales/color sin round-trip extra.
  useEffect(() => {
    if (!usuarioId) return

    const channel = supabase
      .channel('mensajes_chat_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes_chat' },
        (payload) => {
          const raw = payload.new as {
            id: string; usuario_id: string; mensaje: string; created_at: string
          }
          // Construir mensaje directamente desde cache — 0 consultas adicionales
          const usuario = usuariosRef.current.get(raw.usuario_id) ?? null
          const nuevoMensaje: MensajeChatConUsuario = {
            id:         raw.id,
            usuario_id: raw.usuario_id,
            mensaje:    raw.mensaje,
            created_at: raw.created_at,
            usuario,
          }
          setMensajes(prev => [...prev, nuevoMensaje])
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[useChat] Error en canal Realtime')
        }
      })

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
