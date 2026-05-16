import { createClient } from '@/lib/supabase/server'
import { notFound }     from 'next/navigation'
import DetalleSolicitud from '@/components/solicitudes/detalle-solicitud'
import type {
  Solicitud, SolicitudComentario, SolicitudHistorialEstado,
} from '@/types/database'

export interface ComentarioConAutor extends SolicitudComentario {
  autor_nombre: string
}
export interface HistorialConAutor extends SolicitudHistorialEstado {
  autor_nombre: string
}
export interface GestionOrigenLink {
  id: string; resultado: string; tipo: string; fecha: string; cliente_cod: string
}

export default async function SolicitudDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''
  const { data: usuRow } = await supabase
    .from('usuarios').select('rol').eq('email', userEmail).limit(1)
  const rol = ((usuRow ?? [])[0] as { rol: string } | undefined)?.rol ?? 'ANALISTA'

  // ── Solicitud ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: solRow } = await (supabase as any)
    .from('solicitudes').select('*').eq('id', id).limit(1).maybeSingle()
  if (!solRow) notFound()
  const solicitud = solRow as Solicitud

  // ── Comentarios + historial ───────────────────────────────────────
  const [{ data: comRaw }, { data: histRaw }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('solicitud_comentarios')
      .select('*').eq('solicitud_id', id).order('created_at', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('solicitud_historial_estados')
      .select('*').eq('solicitud_id', id).order('created_at', { ascending: false }),
  ])
  const comentarios = (comRaw  ?? []) as SolicitudComentario[]
  const historial   = (histRaw ?? []) as SolicitudHistorialEstado[]

  // ── Mapa de usuarios (autores) ────────────────────────────────────
  const idsUsuarios = Array.from(new Set([
    ...comentarios.map(c => c.usuario_id),
    ...historial.map(h => h.usuario_id),
    solicitud.solicitante_id ?? '',
  ].filter(Boolean))) as string[]

  const usuarioMap: Record<string, string> = {}
  if (idsUsuarios.length > 0) {
    const { data: uRows } = await supabase
      .from('usuarios').select('id, nombre').in('id', idsUsuarios)
    ;((uRows ?? []) as { id: string; nombre: string }[])
      .forEach(u => { usuarioMap[u.id] = u.nombre })
  }

  const comentariosConAutor: ComentarioConAutor[] = comentarios.map(c => ({
    ...c, autor_nombre: usuarioMap[c.usuario_id] ?? '—',
  }))
  const historialConAutor: HistorialConAutor[] = historial.map(h => ({
    ...h, autor_nombre: usuarioMap[h.usuario_id] ?? '—',
  }))

  // ── Gestión origen (si existe) ────────────────────────────────────
  let gestionOrigen: GestionOrigenLink | null = null
  if (solicitud.gestion_id) {
    const { data: gRow } = await supabase
      .from('gestiones')
      .select('id, resultado, tipo, fecha, cliente_cod')
      .eq('id', solicitud.gestion_id)
      .limit(1)
      .maybeSingle()
    if (gRow) gestionOrigen = gRow as GestionOrigenLink
  }

  return (
    <DetalleSolicitud
      solicitud     = {solicitud}
      comentarios   = {comentariosConAutor}
      historial     = {historialConAutor}
      gestionOrigen = {gestionOrigen}
      solicitanteNombre = {solicitud.solicitante_id ? (usuarioMap[solicitud.solicitante_id] ?? '—') : '—'}
      rol           = {rol as 'COORDINADOR' | 'ANALISTA'}
    />
  )
}
