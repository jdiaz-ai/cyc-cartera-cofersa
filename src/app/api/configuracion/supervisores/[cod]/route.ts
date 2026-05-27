import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

type Params = { params: Promise<{ cod: string }> }

// PUT /api/configuracion/supervisores/[cod]
export async function PUT(req: NextRequest, { params }: Params) {
  const { cod } = await params
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: { nombre?: string; email?: string; activo?: boolean }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Formato de correo inválido' }, { status: 400 })
  }

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anterior } = await (admin as any)
    .from('supervisores').select('*').eq('cod', cod).single()
  if (!anterior) return NextResponse.json({ error: 'Supervisor no encontrado' }, { status: 404 })

  const updateData: Record<string, unknown> = {}
  if (body.nombre !== undefined) updateData.nombre = body.nombre
  if (body.email  !== undefined) updateData.email  = body.email
  if (body.activo !== undefined) updateData.activo = body.activo

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('supervisores').update(updateData).eq('cod', cod).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'supervisores', accion: 'UPDATE',
    descripcion: `Supervisor ${cod} actualizado`,
    valor_anterior: anterior as Record<string, unknown>,
    valor_nuevo: updateData,
    realizado_por: check.email,
  })

  return NextResponse.json({ data })
}

// DELETE /api/configuracion/supervisores/[cod] → soft delete con verificación
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { cod } = await params
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const admin = getAdminClient()

  // Verificar que no tenga vendedores activos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: vendedores } = await (admin as any)
    .from('vendedores')
    .select('cod, nombre')
    .eq('supervisor_cod', cod)
    .eq('activo', true)

  if ((vendedores ?? []).length > 0) {
    return NextResponse.json({
      error: 'No se puede desactivar: tiene vendedores activos asignados',
      vendedores: vendedores,
    }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('supervisores').update({ activo: false }).eq('cod', cod)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'supervisores', accion: 'DELETE',
    descripcion: `Supervisor ${cod} desactivado`,
    valor_nuevo: { activo: false },
    realizado_por: check.email,
  })

  return NextResponse.json({ ok: true })
}
