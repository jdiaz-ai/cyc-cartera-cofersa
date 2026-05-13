import type { ClienteRow, FiltrosClientes } from '@/app/(app)/clientes/page'

/**
 * Aplica los filtros de búsqueda sobre un array de ClienteRow.
 *
 * NOTA: El filtro "criticos" usa mora_91_120 / mora_120_plus directamente
 * porque cartera.dias_mora no siempre está populado por el GAS
 * (el campo se calcula pero no se incluye en el payload de Supabase).
 */
export function aplicarFiltros(rows: ClienteRow[], f: FiltrosClientes): ClienteRow[] {
  let data = rows

  if (f.q) {
    const q = f.q.toLowerCase()
    data = data.filter(r =>
      r.cliente_nombre.toLowerCase().includes(q) ||
      r.cliente_cod.toLowerCase().includes(q)    ||
      r.contribuyente.toLowerCase().includes(q)
    )
  }

  if (f.analista) data = data.filter(r => r.analista_email === f.analista)
  if (f.vendedor) data = data.filter(r => r.vendedor_nombre === f.vendedor)

  // Críticos +90d: clientes con mora en tramo 91-120 días o +120 días
  if (f.etiqueta === 'criticos')
    data = data.filter(r => r.mora_91_120 > 0 || r.mora_120_plus > 0)

  // Olvidados +15d: sin gestión registrada por más de 15 días
  if (f.etiqueta === 'olvidados')
    data = data.filter(r => r.dias_sin_gestion > 15)

  return data
}

export function aplicarOrden(rows: ClienteRow[], sort: string, dir: 'asc' | 'desc'): ClienteRow[] {
  return [...rows].sort((a, b) => {
    if (sort === 'cliente_nombre') {
      const cmp = a.cliente_nombre.localeCompare(b.cliente_nombre)
      return dir === 'asc' ? cmp : -cmp
    }
    const colMap: Partial<Record<string, keyof ClienteRow>> = {
      mora_total:       'mora_total',
      total:            'total',
      dias_sin_gestion: 'dias_sin_gestion',
    }
    const col = colMap[sort] ?? 'mora_total'
    const va = a[col] as number
    const vb = b[col] as number
    return dir === 'asc' ? va - vb : vb - va
  })
}
