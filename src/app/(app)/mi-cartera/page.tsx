import { createClient }    from '@/lib/supabase/server'
import { hoyISO, fmtCRC }   from '@/lib/utils/formato'
import MiCarteraView        from '@/components/cartera/mi-cartera-view'
import type { Cartera, MaestroCliente } from '@/types/database'

// ── Interfaces exportadas ────────────────────────────────────────────
export interface CarteraRow {
  cliente_cod:          string
  cliente_nombre:       string
  vendedor_nombre:      string
  mora_total:           number
  dias_mora:            number    // cartera.dias_mora — días del tramo más antiguo
  tramo_peor:           string
  ultima_gestion_fecha: string | null
  dias_sin_gestion:     number
  promesa_activa:       boolean
  promesa_fecha:        string | null
  promesa_monto:        number | null
  score:                number     // para ordenar dentro del mismo nivel
  prioridad:            'critico' | 'urgente' | 'seguimiento' | 'rutina'
  gestionado_hoy:       boolean
  en_agenda:            boolean    // cumple alguna regla V1
  motivo:               string     // texto explicativo generado
}

export interface KPIs {
  moraTotal:       number
  recuperadoMes:   number
  promesasActivas: number
  sinGestion7d:    number
}

// ── Lógica V1: reglas de prioridad para la Agenda del Día ───────────
function calcularAgenda(p: {
  dias_mora:        number
  mora_total:       number
  mora_120_plus:    number
  dias_sin_gestion: number
  promesa_activa:   boolean
  promesa_fecha:    string | null
  promesa_monto:    number | null
}, hoy: string): {
  en_agenda: boolean
  prioridad:  CarteraRow['prioridad']
  motivo:     string
  score:      number
} {
  const hoyMs = new Date(hoy).getTime()
  const dsg = p.dias_sin_gestion === 999 ? 999 : p.dias_sin_gestion

  // ── CRÍTICO ──────────────────────────────────────────────────────
  // 1. Promesa vencida (fecha_promesa < hoy)
  if (p.promesa_activa && p.promesa_fecha) {
    const diasVenc = Math.floor((hoyMs - new Date(p.promesa_fecha).getTime()) / 86_400_000)
    if (diasVenc > 0) {
      const montoStr = p.promesa_monto
        ? `${fmtCRC(p.promesa_monto)} `
        : ''
      return {
        en_agenda: true, prioridad: 'critico', score: 90,
        motivo: `Promesa de ${montoStr}venció hace ${diasVenc} día${diasVenc !== 1 ? 's' : ''}`,
      }
    }
  }
  // 2. Mora > 120 días
  if (p.mora_120_plus > 0 || p.dias_mora > 120) {
    return {
      en_agenda: true, prioridad: 'critico', score: 85,
      motivo: 'Mora supera 120 días — tramo crítico',
    }
  }
  // 3. Mora > 90 días
  if (p.dias_mora > 90) {
    return {
      en_agenda: true, prioridad: 'critico', score: 80,
      motivo: 'Mora en tramo crítico +90 días',
    }
  }
  // 4. Sin gestión > 7d con mora > ₡500k
  if (dsg > 7 && p.mora_total > 500_000) {
    const d = dsg === 999 ? 'tiempo prolongado' : `${dsg} días`
    return {
      en_agenda: true, prioridad: 'critico', score: 75,
      motivo: `Sin contacto hace ${d} con mora importante`,
    }
  }

  // ── URGENTE ──────────────────────────────────────────────────────
  // 1. Mora 31–90 días
  if (p.dias_mora >= 31 && p.dias_mora <= 90) {
    const motivo = p.dias_mora <= 60
      ? 'Pasó al tramo 31-60 días esta semana'
      : 'Mora en tramo 61-90 días'
    return { en_agenda: true, prioridad: 'urgente', score: 65, motivo }
  }
  // 2. Sin gestión > 5d con mora ₡200k–₡500k
  if (dsg > 5 && p.mora_total > 200_000 && p.mora_total <= 500_000) {
    const d = dsg === 999 ? 'tiempo prolongado' : `${dsg} días`
    return {
      en_agenda: true, prioridad: 'urgente', score: 60,
      motivo: `Sin contacto hace ${d} con mora relevante`,
    }
  }

  // ── SEGUIMIENTO ──────────────────────────────────────────────────
  // 1. Mora 1–30d con sin gestión > 3d
  if (p.dias_mora >= 1 && p.dias_mora <= 30 && dsg > 3) {
    const d = dsg === 999 ? 'varios días' : `${dsg} días`
    return {
      en_agenda: true, prioridad: 'seguimiento', score: 45,
      motivo: `Primer vencimiento — sin contacto hace ${d}`,
    }
  }
  // 2. Promesa activa que vence en ≤ 3 días
  if (p.promesa_activa && p.promesa_fecha) {
    const diasParaPromesa = Math.floor(
      (new Date(p.promesa_fecha).getTime() - hoyMs) / 86_400_000
    )
    if (diasParaPromesa >= 0 && diasParaPromesa <= 3) {
      const motivo = diasParaPromesa === 0
        ? 'Promesa vence hoy — confirmar estado'
        : `Promesa vence en ${diasParaPromesa} día${diasParaPromesa !== 1 ? 's' : ''} — confirmar estado`
      return { en_agenda: true, prioridad: 'seguimiento', score: 40, motivo }
    }
  }

  // ── RUTINA ───────────────────────────────────────────────────────
  if (p.mora_total === 0 && dsg > 15) {
    const d = dsg === 999 ? 'más de 15 días' : `${dsg} días`
    return {
      en_agenda: true, prioridad: 'rutina', score: 20,
      motivo: `Sin contacto preventivo hace ${d}`,
    }
  }

  // No cumple ningún criterio → fuera de la agenda
  return { en_agenda: false, prioridad: 'rutina', score: 0, motivo: '' }
}

// ── Constantes ───────────────────────────────────────────────────────
const EMPTY_KPIS: KPIs = {
  moraTotal: 0, recuperadoMes: 0, promesasActivas: 0, sinGestion7d: 0,
}

// ── Página (Server Component) ────────────────────────────────────────
export default async function MiCarteraPage() {
  const supabase = await createClient()
  const hoy      = hoyISO()
  const hoyMs    = new Date(hoy).getTime()

  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  if (!userEmail) return <MiCarteraView rows={[]} kpis={EMPTY_KPIS} />

  // ── 1. Clientes asignados al analista ────────────────────────────
  const { data: maestroData } = await supabase
    .from('maestro_clientes')
    .select('cliente_cod')
    .eq('analista_email', userEmail)

  const codigos = ((maestroData ?? []) as Pick<MaestroCliente, 'cliente_cod'>[])
    .map(c => c.cliente_cod).filter(Boolean)

  if (codigos.length === 0) return <MiCarteraView rows={[]} kpis={EMPTY_KPIS} />

  // ── 2. Cartera — sync más reciente por cliente ───────────────────
  const { data: carteraData } = await supabase
    .from('cartera').select('*').in('cliente_cod', codigos)

  const carteraMap: Record<string, Cartera> = {}
  ;((carteraData ?? []) as Cartera[]).forEach(c => {
    const prev = carteraMap[c.cliente_cod]
    if (!prev || (c.fecha_corte ?? '') > (prev.fecha_corte ?? '')) {
      carteraMap[c.cliente_cod] = c
    }
  })
  const carteraList = Object.values(carteraMap)

  // ── 3. Última gestión por cliente ────────────────────────────────
  const ultimaGestionMap: Record<string, string> = {}
  {
    const { data: gData } = await supabase
      .from('gestiones').select('cliente_cod, fecha')
      .in('cliente_cod', codigos).order('fecha', { ascending: false })
    ;((gData ?? []) as { cliente_cod: string; fecha: string }[]).forEach(g => {
      if (!ultimaGestionMap[g.cliente_cod]) ultimaGestionMap[g.cliente_cod] = g.fecha
    })
  }

  // ── 4. Promesas PENDIENTE — más próxima + monto ──────────────────
  const promesaMap: Record<string, { fecha: string; monto: number | null }> = {}
  let totalPromesasActivas = 0
  {
    const { data: pData } = await supabase
      .from('promesas')
      .select('cliente_cod, fecha_promesa, monto')
      .in('cliente_cod', codigos).eq('estado', 'PENDIENTE')
      .order('fecha_promesa', { ascending: true })

    const seenCods = new Set<string>()
    ;((pData ?? []) as { cliente_cod: string; fecha_promesa: string; monto: number | null }[])
      .forEach(p => {
        if (!promesaMap[p.cliente_cod]) {
          promesaMap[p.cliente_cod] = { fecha: p.fecha_promesa, monto: p.monto }
        }
        seenCods.add(p.cliente_cod)
      })
    totalPromesasActivas = seenCods.size
  }

  // ── 5. Promesas CUMPLIDA este mes (KPI Recuperado) ───────────────
  let recuperadoMes = 0
  {
    const inicioMes = hoy.slice(0, 7) + '-01'
    const { data: cumplidas } = await supabase
      .from('promesas').select('monto')
      .in('cliente_cod', codigos).eq('estado', 'CUMPLIDA').gte('updated_at', inicioMes)
    recuperadoMes = ((cumplidas ?? []) as { monto: number }[])
      .reduce((s, p) => s + (p.monto || 0), 0)
  }

  // ── 6. Construir rows con reglas V1 ──────────────────────────────
  const rows: CarteraRow[] = carteraList.map(c => {
    const mora_total =
      (c.mora_1_30     || 0) + (c.mora_31_60  || 0) +
      (c.mora_61_90    || 0) + (c.mora_91_120 || 0) +
      (c.mora_120_plus || 0)

    const ultima           = ultimaGestionMap[c.cliente_cod] ?? null
    const dias_sin_gestion = ultima
      ? Math.max(0, Math.floor((hoyMs - new Date(ultima).getTime()) / 86_400_000))
      : 999

    const promesa       = promesaMap[c.cliente_cod]
    const promesa_fecha = promesa?.fecha ?? null
    const promesa_monto = promesa?.monto ?? null
    const promesa_activa = !!promesa_fecha

    const tramo_peor =
      (c.mora_120_plus || 0) > 0 ? '+120 días'   :
      (c.mora_91_120   || 0) > 0 ? '91-120 días' :
      (c.mora_61_90    || 0) > 0 ? '61-90 días'  :
      (c.mora_31_60    || 0) > 0 ? '31-60 días'  :
      (c.mora_1_30     || 0) > 0 ? '1-30 días'   : 'Al día'

    const { en_agenda, prioridad, motivo, score } = calcularAgenda({
      dias_mora:        c.dias_mora    || 0,
      mora_total,
      mora_120_plus:    c.mora_120_plus || 0,
      dias_sin_gestion,
      promesa_activa,
      promesa_fecha,
      promesa_monto,
    }, hoy)

    return {
      cliente_cod:          c.cliente_cod,
      cliente_nombre:       c.cliente_nombre,
      vendedor_nombre:      c.vendedor_nombre || '—',
      mora_total,
      dias_mora:            c.dias_mora || 0,
      tramo_peor,
      ultima_gestion_fecha: ultima,
      dias_sin_gestion,
      promesa_activa,
      promesa_fecha,
      promesa_monto,
      score,
      prioridad,
      gestionado_hoy: ultima === hoy,
      en_agenda,
      motivo,
    }
  })

  // Orden global: score desc → mora_total desc
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
