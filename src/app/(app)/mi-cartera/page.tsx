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
  dias_mora:            number    // días del tramo más antiguo
  tramo_peor:           string
  ultima_gestion_fecha: string | null
  dias_sin_gestion:     number
  promesa_activa:       boolean
  promesa_fecha:        string | null
  promesa_monto:        number | null
  score:                number     // 0-100 para ordenar
  prioridad:            'critico' | 'urgente' | 'seguimiento' | 'rutina'
  gestionado_hoy:       boolean
  en_agenda:            boolean    // true = aparece en la cola del día
  is_hard_include:      boolean    // inclusión fija — no desplazable por el tope
  motivo:               string     // texto explicativo para el analista
  proxima_accion:       string | null
  proxima_accion_fecha: string | null
}

export interface KPIs {
  moraTotal:       number
  recuperadoMes:   number
  promesasActivas: number
  sinGestion7d:    number
}

// ── Lógica V3: scoring ponderado + tope dinámico + exclusiones inteligentes ──
// Pesos acordados: 40% monto | 35% días mora | 15% días sin gestión | 10% boost promesa
// Mínimo mora: ₡100,000 | Tope diario: 30 (variable por hard includes)
// Hard includes: promesa vencida, promesa hoy, mora +120d
// Hard excludes: gestionado hoy, promesa vigente + gestión ≤ 3d, próxima acción futura

const MORA_MINIMA      = 100_000   // ₡100K — por debajo no entra a la cola
const LOG_MIN          = Math.log(MORA_MINIMA)
const LOG_MAX          = Math.log(10_000_000)  // ₡10M = score monto máximo

function calcularAgenda(p: {
  dias_mora:            number
  mora_total:           number
  mora_120_plus:        number
  dias_sin_gestion:     number
  promesa_activa:       boolean
  promesa_fecha:        string | null
  promesa_monto:        number | null
  proxima_accion_fecha: string | null
  gestionado_hoy:       boolean
}, hoy: string): {
  en_agenda:       boolean
  is_hard_include: boolean
  prioridad:       CarteraRow['prioridad']
  motivo:          string
  score:           number
} {
  const hoyMs = new Date(hoy).getTime()
  const dsg   = p.dias_sin_gestion === 999 ? 30 : p.dias_sin_gestion  // 999 → trata como 30d

  const OUT = (motivo = '') =>
    ({ en_agenda: false, is_hard_include: false, prioridad: 'rutina' as const, score: 0, motivo })

  // ════════════════════════════════════════════════════════════════
  // INCLUSIONES FIJAS — siempre en cola sin importar el tope
  // ════════════════════════════════════════════════════════════════

  if (p.promesa_activa && p.promesa_fecha) {
    const diasVenc = Math.floor((hoyMs - new Date(p.promesa_fecha).getTime()) / 86_400_000)
    // Promesa incumplida (venció y no pagó)
    if (diasVenc > 0) {
      const montoStr = p.promesa_monto ? `${fmtCRC(p.promesa_monto)} ` : ''
      return {
        en_agenda: true, is_hard_include: true, prioridad: 'critico', score: 97,
        motivo: `Promesa de ${montoStr}venció hace ${diasVenc}d — sin pago`,
      }
    }
    // Promesa vence hoy
    if (diasVenc === 0) {
      return {
        en_agenda: true, is_hard_include: true, prioridad: 'critico', score: 95,
        motivo: 'Promesa vence hoy — confirmar si pagó',
      }
    }
  }

  // Mora en tramo +120 días
  if ((p.mora_120_plus ?? 0) > 0 || p.dias_mora > 120) {
    return {
      en_agenda: true, is_hard_include: true, prioridad: 'critico', score: 92,
      motivo: `Mora supera 120 días (${fmtCRC(p.mora_total)}) — crítico`,
    }
  }

  // ════════════════════════════════════════════════════════════════
  // EXCLUSIONES — salen de la cola antes de cualquier scoring
  // ════════════════════════════════════════════════════════════════

  // 1. Ya fue gestionado hoy
  if (p.gestionado_hoy) return OUT()

  // 2. Promesa vigente (futura) + gestión en los últimos 3 días — no molestar
  if (p.promesa_activa && p.promesa_fecha) {
    const diasParaPromesa = Math.floor(
      (new Date(p.promesa_fecha).getTime() - hoyMs) / 86_400_000,
    )
    if (diasParaPromesa > 0 && dsg <= 3) return OUT()
  }

  // 3. Próxima acción programada para fecha futura
  if (p.proxima_accion_fecha) {
    if (new Date(p.proxima_accion_fecha).getTime() > hoyMs) return OUT()
  }

  // 4. Mora por debajo del mínimo operativo
  if (p.mora_total < MORA_MINIMA) return OUT()

  // ════════════════════════════════════════════════════════════════
  // SCORING PONDERADO 0–100
  // 40% monto en mora | 35% días mora | 15% días sin gestión | 10% promesa próxima
  // ════════════════════════════════════════════════════════════════

  const montoScore  = Math.min(1, Math.max(0,
    (Math.log(Math.max(p.mora_total, MORA_MINIMA)) - LOG_MIN) / (LOG_MAX - LOG_MIN),
  ))
  const moraScore   = Math.min(1, p.dias_mora / 120)
  const gestionScore = Math.min(1, dsg / 30)

  let promesaBoost = 0
  if (p.promesa_activa && p.promesa_fecha) {
    const dias = Math.floor((new Date(p.promesa_fecha).getTime() - hoyMs) / 86_400_000)
    if (dias <= 3)  promesaBoost = 1.0
    else if (dias <= 7)  promesaBoost = 0.7
    else if (dias <= 14) promesaBoost = 0.4
  }

  const score = Math.min(89, Math.max(1, Math.round(
    (0.40 * montoScore + 0.35 * moraScore + 0.15 * gestionScore + 0.10 * promesaBoost) * 100,
  )))

  // Prioridad y motivo derivados del score
  let prioridad: CarteraRow['prioridad']
  let motivo: string

  if (score >= 65) {
    prioridad = 'critico'
    motivo = p.dias_mora > 90
      ? `Mora +${p.dias_mora}d (${fmtCRC(p.mora_total)}) — acción urgente`
      : `Alta exposición: ${fmtCRC(p.mora_total)} en mora`
  } else if (score >= 40) {
    prioridad = 'urgente'
    motivo = p.dias_mora >= 31
      ? `Mora ${p.dias_mora}d — ${fmtCRC(p.mora_total)} pendiente`
      : `${fmtCRC(p.mora_total)} en mora — sin gestión reciente`
  } else if (score >= 15) {
    prioridad = 'seguimiento'
    const dsgLabel = p.dias_sin_gestion === 999 ? 'sin gestiones previas' : `${dsg}d sin contacto`
    motivo = `${fmtCRC(p.mora_total)} — ${dsgLabel}`
  } else {
    prioridad = 'rutina'
    motivo = `${fmtCRC(p.mora_total)} — seguimiento preventivo`
  }

  return { en_agenda: true, is_hard_include: false, prioridad, score, motivo }
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

  // ── 2. Sync más reciente ──────────────────────────────────────────
  // El GAS solo sincroniza los clientes presentes en el reporte de Softland.
  // Cuando un cliente paga y desaparece del reporte, su registro viejo persiste
  // en Supabase. Filtrando por el sync_id más reciente garantizamos mostrar
  // únicamente el estado actual de la cartera.
  const { data: syncRefData } = await supabase
    .from('cartera')
    .select('sync_id')
    .order('updated_at', { ascending: false })
    .limit(1)
  const latestSyncId = ((syncRefData ?? [])[0] as { sync_id: string } | undefined)?.sync_id ?? ''

  // ── 3. Cartera — solo del sync más reciente ───────────────────────
  let carteraQuery = supabase.from('cartera').select('*').in('cliente_cod', codigos)
  if (latestSyncId) carteraQuery = carteraQuery.eq('sync_id', latestSyncId)
  const { data: carteraData } = await carteraQuery

  // Deduplicar por cliente_cod (seguridad: en caso de registros múltiples)
  const carteraMap: Record<string, Cartera> = {}
  ;((carteraData ?? []) as Cartera[]).forEach(c => {
    const prev = carteraMap[c.cliente_cod]
    if (!prev || (c.fecha_corte ?? '') > (prev.fecha_corte ?? '')) {
      carteraMap[c.cliente_cod] = c
    }
  })
  const carteraList = Object.values(carteraMap)

  // ── 4. Última gestión + próxima acción programada por cliente ───────
  // Tomamos el registro más reciente (fecha DESC, created_at DESC) para
  // saber: cuándo fue el último contacto Y si hay una fecha de próxima
  // acción futura que suprime al cliente de la agenda de hoy.
  const ultimaGestionMap:   Record<string, string>  = {}
  const proximaAccionMap:   Record<string, { accion: string | null; fecha: string | null }> = {}
  {
    const { data: gData } = await supabase
      .from('gestiones')
      .select('cliente_cod, fecha, proxima_accion, proxima_accion_fecha')
      .in('cliente_cod', codigos)
      .order('fecha',      { ascending: false })
      .order('created_at', { ascending: false })
    ;((gData ?? []) as {
      cliente_cod:          string
      fecha:                string
      proxima_accion:       string | null
      proxima_accion_fecha: string | null
    }[]).forEach(g => {
      if (!ultimaGestionMap[g.cliente_cod]) {
        ultimaGestionMap[g.cliente_cod] = g.fecha
        proximaAccionMap[g.cliente_cod] = {
          accion: g.proxima_accion,
          fecha:  g.proxima_accion_fecha,
        }
      }
    })
  }

  // ── 5. Promesas PENDIENTE — más próxima + monto ──────────────────
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

  // ── 6. Promesas CUMPLIDA este mes (KPI Recuperado) ───────────────
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

    const proxInfo            = proximaAccionMap[c.cliente_cod]
    const proxima_accion      = proxInfo?.accion ?? null
    const proxima_accion_fecha= proxInfo?.fecha  ?? null

    const gestionado_hoy = ultima === hoy

    const { en_agenda, is_hard_include, prioridad, motivo, score } = calcularAgenda({
      dias_mora:            c.dias_mora    || 0,
      mora_total,
      mora_120_plus:        c.mora_120_plus || 0,
      dias_sin_gestion,
      promesa_activa,
      promesa_fecha,
      promesa_monto,
      proxima_accion_fecha,
      gestionado_hoy,
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
      gestionado_hoy,
      en_agenda,
      is_hard_include,
      motivo,
      proxima_accion,
      proxima_accion_fecha,
    }
  })

  // ── Orden global: score desc → mora_total desc ────────────────────
  rows.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.mora_total - a.mora_total
  )

  // ── Tope dinámico de la cola: ~30 por día ────────────────────────
  // Hard includes (promesas vencidas/hoy, mora +120d) siempre aparecen.
  // Del resto, solo entran los mejor puntuados hasta completar el cupo.
  const TOPE_DIARIO = 30
  const hardCods    = new Set(rows.filter(r => r.is_hard_include).map(r => r.cliente_cod))
  const candidatos  = rows.filter(r => r.en_agenda && !r.is_hard_include)
  const cupo        = Math.max(0, TOPE_DIARIO - hardCods.size)
  const enCola      = new Set([
    ...hardCods,
    ...candidatos.slice(0, cupo).map(r => r.cliente_cod),
  ])
  rows.forEach(r => { if (!enCola.has(r.cliente_cod)) r.en_agenda = false })

  const kpis: KPIs = {
    moraTotal:       rows.reduce((s, r) => s + r.mora_total, 0),
    recuperadoMes,
    promesasActivas: totalPromesasActivas,
    sinGestion7d:    rows.filter(r => r.dias_sin_gestion > 7).length,
  }

  return <MiCarteraView rows={rows} kpis={kpis} />
}
