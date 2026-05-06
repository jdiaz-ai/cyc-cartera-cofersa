import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/notas-rapidas?fecha=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const fecha = req.nextUrl.searchParams.get('fecha')
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Parámetro fecha inválido (YYYY-MM-DD)' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('email', user.email!)
    .single()

  if (!usuario) return NextResponse.json({ contenido: '' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('notas_rapidas')
    .select('contenido, updated_at')
    .eq('usuario_id', (usuario as { id: string }).id)
    .eq('fecha', fecha)
    .single()

  const row = data as { contenido: string | null; updated_at: string } | null
  return NextResponse.json({ contenido: row?.contenido ?? '', updated_at: row?.updated_at ?? null })
}

// POST /api/notas-rapidas  { fecha: 'YYYY-MM-DD', contenido: string }
export async function POST(req: NextRequest) {
  let fecha: string, contenido: string
  try {
    const body = await req.json()
    fecha    = body.fecha
    contenido = body.contenido ?? ''
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Parámetro fecha inválido (YYYY-MM-DD)' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('email', user.email!)
    .single()

  if (!usuario) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('notas_rapidas')
    .upsert(
      {
        usuario_id: (usuario as { id: string }).id,
        fecha,
        contenido,
      },
      { onConflict: 'usuario_id,fecha' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
