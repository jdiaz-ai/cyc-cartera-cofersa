import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

// GET /api/configuracion/supervisores
export async function GET() {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: supervisores, error } = await (admin as any)
    .from('supervisores')
    .select('cod, nombre, email, activo, created_at')
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Contar vendedores activos por supervisor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: vendedores } = await (admin as any)
    .from('vendedores')
    .select('supervisor_cod')
    .eq('activo', true)

  const cuentaMap: Record<string, number> = {}
  ;(vendedores ?? []).forEach((v: { supervisor_cod: string | null }) => {
    if (v.supervisor_cod) cuentaMap[v.supervisor_cod] = (cuentaMap[v.supervisor_cod] ?? 0) + 1
  })

  const rows = (supervisores ?? []).map((s: Record<string, unknown>) => ({
    ...s,
    n_vendedores: cuentaMap[s.cod as string] ?? 0,
  }))

  return NextResponse.json({ data: rows })
}

// POST /api/configuracion/supervisores — crear nuevo supervisor
export async function POST(req: NextRequest) {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: { cod: string; nombre: string; email?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  if (!body.cod?.trim() || !body.nombre?.trim()) {
    return NextResponse.json({ error: 'cod y nombre son requeridos' }, { status: 400 })
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Formato de correo inválido' }, { status: 400 })
  }

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('supervisores')
    .insert({ cod: body.cod.trim(), nombre: body.nombre.trim(), email: body.email ?? null, activo: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'supervisores', accion: 'INSERT',
    descripcion: `Supervisor ${body.cod} (${body.nombre}) creado`,
    valor_nuevo: body as Record<string, unknown>,
    realizado_por: check.email,
  })

  return NextResponse.json({ data }, { status: 201 })
}
