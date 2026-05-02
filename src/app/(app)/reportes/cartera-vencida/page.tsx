import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CarteraVencidaCliente from './cartera-vencida-cliente'

// ── Tipos de datos que maneja esta página ────────────────────────

export interface FilaCarteraVencida {
  cliente_cod: string
  cliente_nombre: string
  vendedor_nombre: string
  tramo_mayor: string          // e.g. "+120 días"
  monto_vencido: number        // suma de todos los tramos de mora
  dias_sin_gestion: number | null
  ultima_gestion: string | null  // fecha ISO
}

// ── Helpers ──────────────────────────────────────────────────────

/** Tramo de mora más grave del cliente */
function tramoMayor(row: {
  mora_1_30: number
  mora_31_60: number
  mora_61_90: number
  mora_91_120: number
  mora_120_plus: number
}): string {
  if (row.mora_120_plus > 0) return '+120 días'
  if (row.mora_91_120  > 0) return '91-120 días'
  if (row.mora_61_90   > 0) return '61-90 días'
  if (row.mora_31_60   > 0) return '31-60 días'
  if (row.mora_1_30    > 0) return '1-30 días'
  return 'Al día'
}

// ── Página (Server Component) ────────────────────────────────────

export default async function CarteraVencidaPage() {
  const supabase = await createClient()

  // Verificar sesión y rol
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('email', user.email!)
    .single()

  // Esta página es solo para ANALISTA
  const rol = (usuarioRow as { rol: string } | null)?.rol ?? 'ANALISTA'
  if (rol === 'COORDINADOR') redirect('/reportes')

  // 1. Obtener los cliente_cod asignados a este analista desde maestro_clientes
  const { data: maestroRows } = await supabase
    .from('maestro_clientes')
    .select('cliente_cod')
    .eq('analista_email', user.email!)

  const codigos = (maestroRows ?? []).map((r: { cliente_cod: string }) => r.cliente_cod)

  if (codigos.length === 0) {
    return (
      <CarteraVencidaCliente
        filas={[]}
        vendedores={[]}
        userEmail={user.email!}
      />
    )
  }

  // Tipo explícito para las filas de cartera
  type FilaCartera = {
    cliente_cod: string
    cliente_nombre: string
    vendedor_nombre: string
    mora_1_30: number
    mora_31_60: number
    mora_61_90: number
    mora_91_120: number
    mora_120_plus: number
  }

  // 2. Cartera con mora > 0 de esos clientes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: carteraRaw } = await (supabase as any)
    .from('cartera')
    .select('cliente_cod, cliente_nombre, vendedor_nombre, mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus')
    .in('cliente_cod', codigos)
    .or('mora_1_30.gt.0,mora_31_60.gt.0,mora_61_90.gt.0,mora_91_120.gt.0,mora_120_plus.gt.0')
    .order('mora_120_plus', { ascending: false })

  const cartera: FilaCartera[] = (carteraRaw ?? []) as FilaCartera[]

  if (cartera.length === 0) {
    return (
      <CarteraVencidaCliente
        filas={[]}
        vendedores={[]}
        userEmail={user.email!}
      />
    )
  }

  // 3. Última gestión por cliente_cod (para días sin gestión)
  const codsConMora = cartera.map((r) => r.cliente_cod)

  const { data: gestionesRows } = await supabase
    .from('gestiones')
    .select('cliente_cod, fecha')
    .in('cliente_cod', codsConMora)
    .eq('analista_email', user.email!)
    .order('fecha', { ascending: false })

  // Mapa cliente_cod → última fecha de gestión
  const ultimaGestionMap: Record<string, string> = {}
  for (const g of (gestionesRows ?? []) as { cliente_cod: string; fecha: string }[]) {
    if (!ultimaGestionMap[g.cliente_cod]) {
      ultimaGestionMap[g.cliente_cod] = g.fecha
    }
  }

  const hoy = new Date()

  // 4. Construir filas finales
  const filas: FilaCarteraVencida[] = cartera.map((r) => {
    const moraTotal =
      (r.mora_1_30 ?? 0) +
      (r.mora_31_60 ?? 0) +
      (r.mora_61_90 ?? 0) +
      (r.mora_91_120 ?? 0) +
      (r.mora_120_plus ?? 0)

    const ultimaGestion = ultimaGestionMap[r.cliente_cod] ?? null
    let diasSinGestion: number | null = null
    if (ultimaGestion) {
      const diff = hoy.getTime() - new Date(ultimaGestion).getTime()
      diasSinGestion = Math.floor(diff / (1000 * 60 * 60 * 24))
    }

    return {
      cliente_cod: r.cliente_cod,
      cliente_nombre: r.cliente_nombre,
      vendedor_nombre: r.vendedor_nombre,
      tramo_mayor: tramoMayor(r),
      monto_vencido: moraTotal,
      dias_sin_gestion: diasSinGestion,
      ultima_gestion: ultimaGestion,
    }
  })

  // Lista única de vendedores para el filtro
  const vendedores = [...new Set(filas.map(f => f.vendedor_nombre).filter(Boolean))].sort()

  return (
    <CarteraVencidaCliente
      filas={filas}
      vendedores={vendedores}
      userEmail={user.email!}
    />
  )
}
