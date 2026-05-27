import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

const AREAS_VALIDAS = [
  'Ventas', 'Logística', 'Crédito y Cobro', 'Gerencia',
  'TI', 'Compras', 'Recursos Humanos', 'Contabilidad', 'Otro',
]

// GET /api/configuracion/directorio?area=Ventas&q=texto
export async function GET(req: NextRequest) {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const { searchParams } = new URL(req.url)
  const area = searchParams.get('area')
  const q    = searchParams.get('q')

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('directorio_empresa')
    .select('id, nombre, email, cargo, area, activo, created_at')
    .order('nombre')

  if (area) query = query.eq('area', area)
  if (q)    query = query.or(`nombre.ilike.%${q}%,email.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/configuracion/directorio — agregar contacto
export async function POST(req: NextRequest) {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: { nombre: string; email: string; cargo?: string; area: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  if (!body.nombre?.trim() || !body.email?.trim()) {
    return NextResponse.json({ error: 'nombre y email son requeridos' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Formato de correo inválido' }, { status: 400 })
  }
  if (!AREAS_VALIDAS.includes(body.area)) {
    return NextResponse.json({ error: `Área inválida. Permitidas: ${AREAS_VALIDAS.join(', ')}` }, { status: 400 })
  }

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('directorio_empresa')
    .insert({
      nombre: body.nombre.trim(),
      email:  body.email.trim().toLowerCase(),
      cargo:  body.cargo ?? null,
      area:   body.area,
      activo: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'directorio_empresa', accion: 'INSERT',
    descripcion: `Contacto ${body.email} (${body.area}) agregado al directorio`,
    valor_nuevo: body as Record<string, unknown>,
    realizado_por: check.email,
  })

  return NextResponse.json({ data }, { status: 201 })
}
