import { createClient }    from '@/lib/supabase/server'
import { hoyISO }           from '@/lib/utils/formato'
import MiCarteraView        from '@/components/cartera/mi-cartera-view'
import type { Cartera, MaestroCliente } from '@/types/database'

// ── Interfaces exportadas (usadas por MiCarteraView) ─────────────────
export interface CarteraRow {
  cliente_cod:          string
  cliente_nombre:       string
  mora_total:           number
  tramo_peor:           string
  ultima_gestion_fecha: string | null
  dias_sin_gestion:     number
  promesa_activa:       boolean
  promesa_fecha:        string | null   // fecha_promesa de la más próxima PENDIENTE
  score:                number
  prioridad:            'critico' | 'urgente' | 'seguimiento' | 'rutina'
  gestionado_hoy:       boolean
}

export interface KPIs {
  moraTotal:       number
  recuperadoMes:   number    // SUM(monto) promesas CUMPLIDA en el mes actual
  promesasActivas: number    // clientes únicos con promesa PENDIENTE
  sinGestion7d:    number    // clientes con dias_sin_gestion > 7
}

// ── Cálculo de score de urgencia ────────────────────────────────────
function calcularScore(p: {
  mora_120_plus:    number
  mora_61_90:       number
  mora_1_30:        number
  mora_31_60:       number
  mora_total:       number
  dias_sin_gestion: number
  promesa_activa:   boolean
  promesa_fecha:    string | null
}, hoy: string): number {
  const hoyMs = new Date(hoy).getTime()

  // Condiciones relacionadas a promesas (evaluadas primero, mayor peso)
  if (p.promesa_activa && p.promesa_fecha) {
    const diasVencida = Math.floor(
      (hoyMs - new Date(p.promesa_fecha).getTime()) / 86_400_000
    )
    if (diasVencida > 2)  return 90  // vencida > 2 días
    if (diasVencida >= 0) return 80  // vence hoy o venció ayer
    if (diasVencida >= -2) return 55 // vence dentro de 2 días
  }

  if (p.mora_120_plus > 0)                                return 75
  if (p.dias_sin_gestion > 10 && p.mora_total > 500_000)  return 65
  if (p.mora_61_90 > 0 && p.dias_sin_gestion > 5)         return 60
  if (p.dias_sin_gestion > 7  && p.mora_total > 200_000)  return 45
  if (p.mora_1_30 > 0 && p.mora_31_60 === 0 && p.mora_61_90 === 0) return 35
  return 20
}

function scoreToPrioridad(score: number): CarteraRow['prioridad'] {
  if (score >= 70) return 'critico'
  if (score >= 50) return 'urgente'
  if (score >= 30) return 'seguimiento'
  return 'rutina'
}

// ── Empty state helper ───────────────────────────────────────────────
const EMPTY_KPIS: KPIs = { moraTotal: 0, recuperadoMes: 0, promesasActivas: 0, sinGestion7d: 0 }

// ── Página ───────────────────────────────────────────────────────────
export default async function MiCarteraPage() {
  const supabase  = await createClient()
  const hoy       = hoyISO()
  const hoyMs     = new Date(hoy).getTime()

  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  if (!userEmail) {
    return <MiCarteraView rows={[]} kpis={EMPTY_KPIS} />
  }

  // ── 1. Clientes asignados al analista ────────────────────────────
  const { data: maestroData } = await supabase
    .from('maestro_clientes')
    .select('cliente_cod')
    .eq('analista_email', userEmail)

  const codigos = ((maestroData ?? []) as Pick<MaestroCliente, 'cliente_cod'>[])
    .map(c => c.cliente_cod)
    .filter(Boolean)

  if (codigos.length === 0) {
    return <MiCarteraView rows={[]} kpis={EMPTY_KPIS} />
  }

  // ── 2. Cartera — conservar solo el sync más reciente por cliente ──
  const { data: carteraData } = await supabase
    .from('cartera')
    .select('*')
    .in('cliente_cod', codigos)

  const carteraMap: Record<string, Cartera> = {}
  ;((carteraData ?? []) as Cartera[]).forEach(c => {
    const prev = carteraMap[c.cliente_cod]
    if (!prev || (c.fecha_corte ?? '') > (prev.fecha_corte ?? '')) {
      carteraMap[c.cliente_cod] = c
    }
  })
  const carteraList = Object.values(carteraMap)

  // ── 3. Última gestión por cliente (la más reciente) ──────────────
  const ultimaGestionMap: Record<string, string> = {}
  {
    const { data: gData } = await supabase
      .from('gestiones')
      .select('cliente_cod, fecha')
      .in('cliente_cod', codigos)
      .order('fecha', { ascending: false })
    ;((gData ?? []) as { cliente_cod: string; fecha: string }[]).forEach(g => {
      if (!ultimaGestionMap[g.cliente_cod]) ultimaGestionMap[g.cliente_cod] = g.fecha
    })
  }

  // ── 4. Promesas PENDIENTE — la de fecha más próxima por cliente ──
  const promesaMap: Record<string, string> = {}   // cliente_cod → fecha_promesa
  let totalPromesasActivas = 0
  {
    const { data: pData } = await supabase
      .from('promesas')
      .select('cliente_cod, fecha_promesa')
      .in('cliente_cod', codigos)
      .eq('estado', 'PENDIENTE')
      .order('fecha_promesa', { ascending: true })

    const codsConPromesa = new Set<string>()
    ;((pData ?? []) as { cliente_cod: string; fecha_promesa: string }[]).forEach(p => {
      if (!promesaMap[p.cliente_cod]) promesaMap[p.cliente_cod] = p.fecha_promesa
      codsConPromesa.add(p.cliente_cod)
    })
    totalPromesasActivas = codsConPromesa.size
  }

  // ── 5. Promesas CUMPLIDA este mes (KPI "Recuperado") ─────────────
  let recuperadoMes = 0
  {
    const inicioMes = hoy.slice(0, 7) + '-01'
    const { data: cumplidas } = await supabase
      .from('promesas')
      .select('monto')
      .in('cliente_cod', codigos)
      .eq('estado', 'CUMPLIDA')
      .gte('updated_at', inicioMes)
    recuperadoMes = ((cumplidas ?? []) as { monto: number }[])
      .reduce((s, p) => s + (p.monto || 0), 0)
  }

  // ── 6. Construir rows con scoring ────────────────────────────────
  const rows: CarteraRow[] = carteraList.map(c => {
    const mora_total =
      (c.mora_1_30     || 0) + (c.mora_31_60  || 0) +
      (c.mora_61_90    || 0) + (c.mora_91_120 || 0) +
      (c.mora_120_plus || 0)

    const ultima          = ultimaGestionMap[c.cliente_cod] ?? null
    const dias_sin_gestion = ultima
      ? Math.max(0, Math.floor((hoyMs - new Date(ultima).getTime()) / 86_400_000))
      : 999

    const promesa_fecha  = promesaMap[c.cliente_cod] ?? null
    const promesa_activa = !!promesa_fecha

    const tramo_peor =
      (c.mora_120_plus || 0) > 0 ? '+120 días'   :
      (c.mora_91_120   || 0) > 0 ? '91-120 días' :
      (c.mora_61_90    || 0) > 0 ? '61-90 días'  :
      (c.mora_31_60    || 0) > 0 ? '31-60 días'  :
      (c.mora_1_30     || 0) > 0 ? '1-30 días'   : 'Al día'

    const score = calcularScore({
      mora_120_plus:    c.mora_120_plus || 0,
      mora_61_90:       c.mora_61_90    || 0,
      mora_1_30:        c.mora_1_30     || 0,
      mora_31_60:       c.mora_31_60    || 0,
      mora_total,
      dias_sin_gestion,
      promesa_activa,
      promesa_fecha,
    }, hoy)

    return {
      cliente_cod:          c.cliente_cod,
      cliente_nombre:       c.cliente_nombre,
      mora_total,
      tramo_peor,
      ultima_gestion_fecha: ultima,
      dias_sin_gestion,
      promesa_activa,
      promesa_fecha,
      score,
      prioridad:     scoreToPrioridad(score),
      gestionado_hoy: ultima === hoy,
    }
  })

  // Orden: score desc → mora_total desc
  rows.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.mora_total - a.mora_total
  )

  const kpis: KPIs = {
    moraTotal:       rows.reduce((s, r) => s + r.mora_total, 0),
    recuperadoMes,
    promesasActivas: totalPromesasActivas,
    sinGestion7d:    rows.filter(r => r.dias_sin_gestion > 7).length,
  }

  return <MiCarteraView rows={rows} kpis={kpis} />
}
