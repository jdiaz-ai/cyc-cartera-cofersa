import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

const DOMINIOS_PERMITIDOS = ['cofersa.cr', 'mayoreo.biz']

// GET /api/configuracion/usuarios
export async function GET() {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('usuarios')
    .select('id, nombre, email, rol, iniciales, color, activo, meta_individual, telefono, whatsapp, created_at')
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/configuracion/usuarios — crear nuevo usuario
export async function POST(req: NextRequest) {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: {
    nombre: string; email: string; rol: 'COORDINADOR' | 'ANALISTA'
    iniciales?: string; color?: string; meta_individual?: number
    telefono?: string; whatsapp?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  if (!body.nombre?.trim() || !body.email?.trim()) {
    return NextResponse.json({ error: 'nombre y email son requeridos' }, { status: 400 })
  }
  if (!['COORDINADOR', 'ANALISTA'].includes(body.rol)) {
    return NextResponse.json({ error: 'rol debe ser COORDINADOR o ANALISTA' }, { status: 400 })
  }

  const dominio = body.email.split('@')[1]
  if (!DOMINIOS_PERMITIDOS.includes(dominio)) {
    return NextResponse.json({
      error: `Solo se permiten correos @cofersa.cr o @mayoreo.biz`,
    }, { status: 400 })
  }

  // Auto-sugerir iniciales si no se proveen
  const iniciales = body.iniciales?.slice(0, 2).toUpperCase()
    ?? body.nombre.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('usuarios')
    .insert({
      nombre:          body.nombre.trim(),
      email:           body.email.trim().toLowerCase(),
      rol:             body.rol,
      iniciales,
      color:           body.color ?? '#009ee3',
      activo:          true,
      meta_individual: body.meta_individual ?? 0,
      telefono:        body.telefono ?? null,
      whatsapp:        body.whatsapp ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'usuarios', accion: 'INSERT',
    descripcion: `Usuario ${body.email} (${body.rol}) creado`,
    valor_nuevo: { nombre: body.nombre, email: body.email, rol: body.rol },
    realizado_por: check.email,
  })

  return NextResponse.json({ data }, { status: 201 })
}
