import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient } from '@/lib/configuracion/admin'

// GET /api/configuracion/log?tabla=vendedores&desde=2026-05-01&hasta=2026-05-31&page=1&format=csv
export async function GET(req: NextRequest) {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const { searchParams } = new URL(req.url)
  const tabla   = searchParams.get('tabla')
  const desde   = searchParams.get('desde')
  const hasta   = searchParams.get('hasta')
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const format  = searchParams.get('format') // 'csv' o null

  const pageSize = 50
  const from     = (page - 1) * pageSize
  const to       = from + pageSize - 1

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('config_audit_log')
    .select('id, tabla, accion, descripcion, realizado_por, realizado_en', { count: 'exact' })
    .order('realizado_en', { ascending: false })

  if (tabla)  query = query.eq('tabla', tabla)
  if (desde)  query = query.gte('realizado_en', desde)
  if (hasta)  query = query.lte('realizado_en', hasta + 'T23:59:59Z')

  // CSV: sin paginación
  if (format !== 'csv') query = query.range(from, to)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (format === 'csv') {
    const rows = data ?? []
    const header = 'Fecha,Tabla,Acción,Descripción,Realizado por'
    const lines  = rows.map((r: Record<string, string>) =>
      [
        r.realizado_en ? new Date(r.realizado_en).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' }) : '',
        r.tabla   ?? '',
        r.accion  ?? '',
        `"${(r.descripcion ?? '').replace(/"/g, '""')}"`,
        r.realizado_por ?? '',
      ].join(',')
    )
    const csv = [header, ...lines].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, pageSize })
}
