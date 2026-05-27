import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

// GET /api/configuracion/vendedores
export async function GET() {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: vendedores, error } = await (admin as any)
    .from('vendedores')
    .select('cod, nombre, email, zona, analista_email, activo, asignado_por, asignado_en, supervisor_cod')
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: supervisores } = await (admin as any)
    .from('supervisores')
    .select('cod, nombre')
    .eq('activo', true)

  const supMap: Record<string, string> = {}
  ;(supervisores ?? []).forEach((s: { cod: string; nombre: string }) => { supMap[s.cod] = s.nombre })

  const rows = (vendedores ?? []).map((v: Record<string, unknown>) => ({
    ...v,
    supervisor_nombre: v.supervisor_cod ? (supMap[v.supervisor_cod as string] ?? null) : null,
  }))

  return NextResponse.json({ data: rows })
}

// POST /api/configuracion/vendedores — crear nuevo vendedor
export async function POST(req: NextRequest) {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: {
    cod: string; nombre: string; email?: string; zona?: string
    supervisor_cod?: string; analista_email?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  if (!body.cod?.trim() || !body.nombre?.trim()) {
    return NextResponse.json({ error: 'cod y nombre son requeridos' }, { status: 400 })
  }

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('vendedores')
    .insert({
      cod:            body.cod.trim(),
      nombre:         body.nombre.trim(),
      email:          body.email ?? null,
      zona:           body.zona ?? null,
      supervisor_cod: body.supervisor_cod ?? null,
      analista_email: body.analista_email ?? null,
      activo:         true,
      asignado_por:   check.email,
      asignado_en:    new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'vendedores', accion: 'INSERT',
    descripcion: `Vendedor ${body.cod} (${body.nombre}) creado`,
    valor_nuevo: body as Record<string, unknown>,
    realizado_por: check.email,
  })

  return NextResponse.json({ data }, { status: 201 })
}
