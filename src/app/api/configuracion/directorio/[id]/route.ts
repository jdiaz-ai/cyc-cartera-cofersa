import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

type Params = { params: Promise<{ id: string }> }

const AREAS_VALIDAS = [
  'Ventas', 'Logística', 'Crédito y Cobro', 'Gerencia',
  'TI', 'Compras', 'Recursos Humanos', 'Contabilidad', 'Otro',
]

// PUT /api/configuracion/directorio/[id]
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: { nombre?: string; email?: string; cargo?: string; area?: string; activo?: boolean }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Formato de correo inválido' }, { status: 400 })
  }
  if (body.area && !AREAS_VALIDAS.includes(body.area)) {
    return NextResponse.json({ error: `Área inválida` }, { status: 400 })
  }

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anterior } = await (admin as any)
    .from('directorio_empresa').select('*').eq('id', id).single()
  if (!anterior) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })

  const updateData: Record<string, unknown> = {}
  if (body.nombre !== undefined) updateData.nombre = body.nombre
  if (body.email  !== undefined) updateData.email  = body.email.toLowerCase()
  if (body.cargo  !== undefined) updateData.cargo  = body.cargo
  if (body.area   !== undefined) updateData.area   = body.area
  if (body.activo !== undefined) updateData.activo = body.activo

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('directorio_empresa').update(updateData).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'directorio_empresa', accion: 'UPDATE',
    descripcion: `Contacto ${(anterior as Record<string,unknown>).email} actualizado`,
    valor_anterior: anterior as Record<string, unknown>,
    valor_nuevo: updateData,
    realizado_por: check.email,
  })

  return NextResponse.json({ data })
}

// DELETE /api/configuracion/directorio/[id] → soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contacto } = await (admin as any)
    .from('directorio_empresa').select('email').eq('id', id).single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('directorio_empresa').update({ activo: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'directorio_empresa', accion: 'DELETE',
    descripcion: `Contacto ${(contacto as { email: string } | null)?.email ?? id} desactivado del directorio`,
    valor_nuevo: { activo: false },
    realizado_por: check.email,
  })

  return NextResponse.json({ ok: true })
}
