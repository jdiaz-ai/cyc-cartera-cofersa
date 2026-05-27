import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

type Params = { params: Promise<{ id: string }> }

// PUT /api/configuracion/usuarios/[id]
// Editable: nombre, rol, activo, meta_individual, telefono, whatsapp
// NO editable: email (una vez creado)
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: {
    nombre?: string; rol?: 'COORDINADOR' | 'ANALISTA'
    activo?: boolean; meta_individual?: number
    telefono?: string; whatsapp?: string
    iniciales?: string; color?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  if (body.rol && !['COORDINADOR', 'ANALISTA'].includes(body.rol)) {
    return NextResponse.json({ error: 'rol debe ser COORDINADOR o ANALISTA' }, { status: 400 })
  }

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anterior } = await (admin as any)
    .from('usuarios').select('nombre, rol, activo, email').eq('id', id).single()
  if (!anterior) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const updateData: Record<string, unknown> = {}
  if (body.nombre          !== undefined) updateData.nombre          = body.nombre
  if (body.rol             !== undefined) updateData.rol             = body.rol
  if (body.activo          !== undefined) updateData.activo          = body.activo
  if (body.meta_individual !== undefined) updateData.meta_individual = body.meta_individual
  if (body.telefono        !== undefined) updateData.telefono        = body.telefono
  if (body.whatsapp        !== undefined) updateData.whatsapp        = body.whatsapp
  if (body.iniciales       !== undefined) updateData.iniciales       = body.iniciales.slice(0, 2).toUpperCase()
  if (body.color           !== undefined) updateData.color           = body.color

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('usuarios').update(updateData).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ant = anterior as Record<string, unknown>
  const desc = body.activo !== undefined
    ? `Usuario ${ant.email} ${body.activo ? 'activado' : 'desactivado'}`
    : body.rol !== undefined
    ? `Usuario ${ant.email} cambió rol: ${ant.rol} → ${body.rol}`
    : `Usuario ${ant.email} actualizado`

  await insertAuditLog(admin, {
    tabla: 'usuarios', accion: 'UPDATE',
    descripcion: desc,
    valor_anterior: ant,
    valor_nuevo: updateData,
    realizado_por: check.email,
  })

  return NextResponse.json({ data })
}
