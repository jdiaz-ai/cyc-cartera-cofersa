/**
 * cola-analista.ts — Algoritmo V4 con ICP
 *
 * Fuente única de verdad para la priorización de la cola de trabajo diaria.
 * Usado por Dashboard Analista y Mi Cartera — misma lógica, mismos resultados.
 *
 * V4 incorpora el ICP (Índice de Comportamiento de Pago, 0-100):
 *   · Nuevo Hard Include: ICP < 35 + mora ≥ ₡500K + tramo ≥ 31d (riesgo crónico)
 *   · Nuevo Smart Exclude: ICP ≥ 80 + solo 1-30d + gestionado ≤ 5d (buen pagador puntual)
 *   · Pesos de scoring: 35% monto | 25% días mora | 15% sin gestión | 10% promesa | 15% ICP riesgo
 *   · Ajuste de tier: ICP < 40 sube un nivel · ICP ≥ 80 baja un nivel (mora ≤ 60d)
 *
 * IMPORTANTE: la regla de proxima_accion_fecha se verifica ANTES del ICP Hard Include,
 * por lo que una acción futura programada siempre se respeta.
 */

import { fmtCRC } from '@/lib/utils/formato'
import type { Cartera, MaestroCliente } from '@/types/database'
import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// ══════════════════════════════════════════════════════════════════════
// TIPOS EXPORTADOS
// ══════════════════════════════════════════════════════════════════════

export interface CarteraRow {
  cliente_cod:          string
  cliente_nombre:       string
  vendedor_nombre:      string
  mora_total:           number
  dias_mora:            number
  tramo_peor:           string
  ultima_gestion_fecha: string | null
  dias_sin_gestion:     number
  promesa_activa:       boolean
  promesa_fecha:        string | null
  promesa_monto:        number | null
  score:                number
  prioridad:            'critico' | 'urgente' | 'seguimiento' | 'rutina'
  gestionado_hoy:       boolean
  en_agenda:            boolean
  is_hard_include:      boolean
  motivo:               string
  proxima_accion:       string | null
  proxima_accion_fecha: string | null
  icp_score:            number | null   // 0-100 · null = sin historial de pagos
}

export interface KPIs {
  moraTotal:       number
  recuperadoMes:   number
  promesasActivas: number
  sinGestion7d:    number
}

// ══════════════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════════════

export const MORA_MINIMA      = 100_000        // ₡100K — por debajo no entra a la cola
export const ICP_HARD_INCLUDE = 35             // ICP por debajo → cliente de riesgo crónico
export const ICP_SMART_EXCLUDE = 80            // ICP por encima → buen pagador, se excluye si puntual
export const ICP_MORA_MINIMA_HARD = 500_000    // mora mínima para el hard include de ICP (₡500K)
export const ICP_NEUTRO       = 50             // valor asignado cuando no hay historial

const LOG_MIN    = Math.log(MORA_MINIMA)
const LOG_MAX    = Math.log(10_000_000)
const TOPE_DIARIO = 30

// ══════════════════════════════════════════════════════════════════════
// HELPER: color y etiqueta según score ICP
// ══════════════════════════════════════════════════════════════════════

export function icpColor(score: number): string {
  if (score >= 80) return '#16a34a'   // verde — Excelente/Bueno
  if (score >= 60) return '#0891b2'   // cyan  — Regular-alto
  if (score >= 40) return '#d97706'   // amber — Regular-bajo
  if (score >= 20) return '#ea580c'   // naranja — Malo
  return '#dc2626'                    // rojo — Muy malo
}

export function icpLabel(score: number): string {
  if (score >= 80) return 'Bueno'
  if (score >= 60) return 'Regular'
  if (score >= 40) return 'Irregular'
  if (score >= 20) return 'Malo'
  return 'Muy malo'
}

// ══════════════════════════════════════════════════════════════════════
// ALGORITMO V4 — calcularAgenda
// ══════════════════════════════════════════════════════════════════════

export function calcularAgenda(p: {
  dias_mora:            number
  mora_total:           number
  mora_120_plus:        number
  dias_sin_gestion:     number
  promesa_activa:       boolean
  promesa_fecha:        string | null
  promesa_monto:        number | null
  proxima_accion_fecha: string | null
  gestionado_hoy:       boolean
  icp:                  number | null   // null = sin historial → tratar como neutro
}, hoy: string): {
  en_agenda:       boolean
  is_hard_include: boolean
  prioridad:       CarteraRow['prioridad']
  motivo:          string
  score:           number
} {
  const hoyMs = new Date(hoy).getTime()
  const dsg   = p.dias_sin_gestion === 999 ? 30 : p.dias_sin_gestion
  const icp   = p.icp ?? ICP_NEUTRO   // sin historial = neutro (50)

  const OUT = (motivo = '') =>
    ({ en_agenda: false, is_hard_include: false, prioridad: 'rutina' as const, score: 0, motivo })

  if (p.gestionado_hoy) {
    // ── RAMA A: ya gestionado hoy ────────────────────────────────────
    // Visible en la sección "✓ Gestionados hoy" de Mi Cartera.
    // NO entra en la Cola del Dashboard.
    if (p.mora_total < MORA_MINIMA) return OUT()
    // → cae al scoring compartido

  } else {
    // ── RAMA B: pendiente — lógica completa ─────────────────────────

    // ① HARD INCLUDE: promesa vencida o vence hoy (máxima urgencia)
    if (p.promesa_activa && p.promesa_fecha) {
      const diasVenc = Math.floor((hoyMs - new Date(p.promesa_fecha).getTime()) / 86_400_000)
      if (diasVenc > 0) {
        const montoStr = p.promesa_monto ? `${fmtCRC(p.promesa_monto)} ` : ''
        return {
          en_agenda: true, is_hard_include: true, prioridad: 'critico', score: 97,
          motivo: `Promesa de ${montoStr}venció hace ${diasVenc}d — sin pago`,
        }
      }
      if (diasVenc === 0) {
        return {
          en_agenda: true, is_hard_include: true, prioridad: 'critico', score: 95,
          motivo: 'Promesa vence hoy — confirmar si pagó',
        }
      }
    }

    // ② EXCLUSIÓN: próxima acción futura programada
    //    Se respeta incluso para clientes de riesgo crónico (ICP bajo).
    //    Si el analista registró una gestión y programó seguimiento para X fecha,
    //    el cliente NO aparece hasta esa fecha.
    if (p.proxima_accion_fecha) {
      if (new Date(p.proxima_accion_fecha).getTime() > hoyMs) return OUT()
    }

    // ③ HARD INCLUDE: mora en tramo +120 días
    if ((p.mora_120_plus ?? 0) > 0 || p.dias_mora > 120) {
      return {
        en_agenda: true, is_hard_include: true, prioridad: 'critico', score: 92,
        motivo: `Mora supera 120 días (${fmtCRC(p.mora_total)}) — crítico`,
      }
    }

    // ④ HARD INCLUDE: ICP bajo + mora significativa (riesgo crónico)
    //    Activa SOLO si no hay próxima acción futura (ya verificado en ②).
    //    Este cliente necesita gestión constante — su historial indica que no pagará solo.
    if (p.icp !== null && icp < ICP_HARD_INCLUDE
        && p.mora_total >= ICP_MORA_MINIMA_HARD
        && p.dias_mora  >= 31) {
      return {
        en_agenda: true, is_hard_include: true, prioridad: 'critico', score: 88,
        motivo: `ICP ${icp} (${icpLabel(icp)}) — historial crítico. ${fmtCRC(p.mora_total)} en mora`,
      }
    }

    // ⑤ SMART EXCLUDE: buen pagador, atraso puntual, gestionado recientemente
    //    Reduce ruido en la cola — este cliente muy probablemente paga solo.
    if (icp >= ICP_SMART_EXCLUDE && p.dias_mora <= 30 && dsg <= 5) {
      return OUT('Buen pagador, atraso puntual, contactado recientemente')
    }

    // ⑥ EXCLUSIÓN: promesa vigente futura + gestión reciente — no molestar
    if (p.promesa_activa && p.promesa_fecha) {
      const diasParaPromesa = Math.floor(
        (new Date(p.promesa_fecha).getTime() - hoyMs) / 86_400_000,
      )
      if (diasParaPromesa > 0 && dsg <= 3) return OUT()
    }

    // ⑦ EXCLUSIÓN: mora por debajo del mínimo operativo
    if (p.mora_total < MORA_MINIMA) return OUT()
  }

  // ── SCORING V4 — 5 factores, suma 100% ──────────────────────────────
  // 35% monto | 25% días mora | 15% sin gestión | 10% promesa | 15% ICP riesgo
  const montoScore   = Math.min(1, Math.max(0,
    (Math.log(Math.max(p.mora_total, MORA_MINIMA)) - LOG_MIN) / (LOG_MAX - LOG_MIN),
  ))
  const moraScore    = Math.min(1, p.dias_mora / 120)
  const gestionScore = Math.min(1, dsg / 30)
  const icpRiskScore = (100 - icp) / 100   // ICP 0=riesgo máx 1.0 | ICP 100=riesgo mín 0.0

  let promesaBoost = 0
  if (p.promesa_activa && p.promesa_fecha) {
    const dias = Math.floor((new Date(p.promesa_fecha).getTime() - hoyMs) / 86_400_000)
    if (dias <= 3)       promesaBoost = 1.0
    else if (dias <= 7)  promesaBoost = 0.7
    else if (dias <= 14) promesaBoost = 0.4
  }

  const score = Math.min(89, Math.max(1, Math.round(
    (0.35 * montoScore   +
     0.25 * moraScore    +
     0.15 * gestionScore +
     0.10 * promesaBoost +
     0.15 * icpRiskScore) * 100,
  )))

  // ── TIER BASE según score ─────────────────────────────────────────────
  let prioridad: CarteraRow['prioridad']
  let motivoBase: string

  if (score >= 65) {
    prioridad  = 'critico'
    motivoBase = p.dias_mora > 90
      ? `Mora +${p.dias_mora}d (${fmtCRC(p.mora_total)}) — acción urgente`
      : `Alta exposición: ${fmtCRC(p.mora_total)} en mora`
  } else if (score >= 40) {
    prioridad  = 'urgente'
    motivoBase = p.dias_mora >= 31
      ? `Mora ${p.dias_mora}d — ${fmtCRC(p.mora_total)} pendiente`
      : `${fmtCRC(p.mora_total)} en mora — sin gestión reciente`
  } else if (score >= 15) {
    prioridad  = 'seguimiento'
    const dsgLabel = p.dias_sin_gestion === 999 ? 'sin gestiones previas' : `${dsg}d sin contacto`
    motivoBase = `${fmtCRC(p.mora_total)} — ${dsgLabel}`
  } else {
    prioridad  = 'rutina'
    motivoBase = `${fmtCRC(p.mora_total)} — seguimiento preventivo`
  }

  // ── AJUSTE DE TIER POR ICP ────────────────────────────────────────────
  // ICP bajo (< 40): sube un nivel — el historial indica mayor riesgo real
  // ICP alto (≥ 80): baja un nivel solo si mora ≤ 60d — buen pagador, posible atraso puntual
  let icpSuffix = ''

  if (p.icp !== null && icp < 40) {
    if (prioridad === 'urgente')     prioridad = 'critico'
    if (prioridad === 'seguimiento') prioridad = 'urgente'
    icpSuffix = ` · ICP ${icp} (${icpLabel(icp)})`
  } else if (p.icp !== null && icp >= ICP_SMART_EXCLUDE && p.dias_mora <= 60) {
    if (prioridad === 'critico'     && p.dias_mora <= 60) prioridad = 'urgente'
    if (prioridad === 'urgente'     && p.dias_mora <= 30) prioridad = 'seguimiento'
    icpSuffix = ` · ICP ${icp} — buen historial`
  } else if (p.icp === null) {
    icpSuffix = ' · sin historial ICP'
  }

  const motivo = motivoBase + icpSuffix

  return { en_agenda: true, is_hard_include: false, prioridad, score, motivo }
}

// ══════════════════════════════════════════════════════════════════════
// computarColaDia — ejecuta todas las queries y aplica el algoritmo V4
// ══════════════════════════════════════════════════════════════════════

export async function computarColaDia(
  supabase: SupabaseServerClient,
  userEmail: string,
  hoy: string,
): Promise<{ rows: CarteraRow[]; recuperadoMes: number; totalPromesasActivas: number }> {

  const hoyMs = new Date(hoy).getTime()

  // 1. Clientes asignados al analista
  const { data: maestroData } = await supabase
    .from('maestro_clientes')
    .select('cliente_cod')
    .eq('analista_email', userEmail)

  const codigos = ((maestroData ?? []) as Pick<MaestroCliente, 'cliente_cod'>[])
    .map(c => c.cliente_cod).filter(Boolean)

  if (codigos.length === 0) {
    return { rows: [], recuperadoMes: 0, totalPromesasActivas: 0 }
  }

  // 2. Sync más reciente
  const { data: syncRefData } = await supabase
    .from('cartera')
    .select('sync_id')
    .order('updated_at', { ascending: false })
    .limit(1)
  const latestSyncId = ((syncRefData ?? [])[0] as { sync_id: string } | undefined)?.sync_id ?? ''

  // 3. Cartera — solo del sync más reciente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let carteraQuery = (supabase as any).from('cartera').select('*').in('cliente_cod', codigos)
  if (latestSyncId) carteraQuery = carteraQuery.eq('sync_id', latestSyncId)
  const { data: carteraData } = await carteraQuery

  // Deduplicar por cliente_cod (seguridad ante registros múltiples)
  const carteraMap: Record<string, Cartera> = {}
  ;((carteraData ?? []) as Cartera[]).forEach(c => {
    const prev = carteraMap[c.cliente_cod]
    if (!prev || (c.fecha_corte ?? '') > (prev.fecha_corte ?? '')) {
      carteraMap[c.cliente_cod] = c
    }
  })
  const carteraList = Object.values(carteraMap)

  // 4. Última gestión + próxima acción por cliente
  const ultimaGestionMap: Record<string, string>  = {}
  const proximaAccionMap: Record<string, { accion: string | null; fecha: string | null }> = {}
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
        proximaAccionMap[g.cliente_cod] = { accion: g.proxima_accion, fecha: g.proxima_accion_fecha }
      }
    })
  }

  // 5. Promesas PENDIENTE — más próxima + monto por cliente
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

  // 6. Recuperado este mes
  let recuperadoMes = 0
  {
    const inicioMes = hoy.slice(0, 7) + '-01'
    const { data: cumplidas } = await supabase
      .from('promesas').select('monto')
      .in('cliente_cod', codigos).eq('estado', 'CUMPLIDA').gte('updated_at', inicioMes)
    recuperadoMes = ((cumplidas ?? []) as { monto: number }[])
      .reduce((s, p) => s + (p.monto || 0), 0)
  }

  // 7. ICP por cliente — desde la vista icp_por_cliente
  const icpMap: Record<string, number> = {}
  try {
    const { data: icpData } = await supabase
      .from('icp_por_cliente')
      .select('cliente_cod, icp_score')
      .in('cliente_cod', codigos)
    ;((icpData ?? []) as { cliente_cod: string; icp_score: number }[])
      .forEach(r => { icpMap[r.cliente_cod] = Number(r.icp_score) })
  } catch { /* vista puede no existir aún */ }

  // 8. Construir CarteraRow[] con scoring V4
  const rows: CarteraRow[] = carteraList.map(c => {
    const mora_total =
      (c.mora_1_30     || 0) + (c.mora_31_60  || 0) +
      (c.mora_61_90    || 0) + (c.mora_91_120 || 0) +
      (c.mora_120_plus || 0)

    const ultima           = ultimaGestionMap[c.cliente_cod] ?? null
    const dias_sin_gestion = ultima
      ? Math.max(0, Math.floor((hoyMs - new Date(ultima).getTime()) / 86_400_000))
      : 999

    const promesa        = promesaMap[c.cliente_cod]
    const promesa_fecha  = promesa?.fecha ?? null
    const promesa_monto  = promesa?.monto ?? null
    const promesa_activa = !!promesa_fecha

    const tramo_peor =
      (c.mora_120_plus || 0) > 0 ? '+120 días'   :
      (c.mora_91_120   || 0) > 0 ? '91-120 días' :
      (c.mora_61_90    || 0) > 0 ? '61-90 días'  :
      (c.mora_31_60    || 0) > 0 ? '31-60 días'  :
      (c.mora_1_30     || 0) > 0 ? '1-30 días'   : 'Al día'

    const proxInfo             = proximaAccionMap[c.cliente_cod]
    const proxima_accion       = proxInfo?.accion ?? null
    const proxima_accion_fecha = proxInfo?.fecha  ?? null
    const gestionado_hoy       = ultima === hoy
    const icp_score            = icpMap[c.cliente_cod] ?? null

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
      icp:                  icp_score,
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
      icp_score,
    }
  })

  // 9. Orden global: score desc → mora_total desc
  rows.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.mora_total - a.mora_total
  )

  // 10. Tope dinámico: hasta 30 pendientes por día
  const hardCods   = new Set(rows.filter(r => r.is_hard_include && !r.gestionado_hoy).map(r => r.cliente_cod))
  const candidatos = rows.filter(r => r.en_agenda && !r.is_hard_include && !r.gestionado_hoy)
  const cupo       = Math.max(0, TOPE_DIARIO - hardCods.size)
  const enCola     = new Set<string>([
    ...hardCods,
    ...candidatos.slice(0, cupo).map(r => r.cliente_cod),
  ])
  rows.filter(r => r.gestionado_hoy && r.en_agenda).forEach(r => enCola.add(r.cliente_cod))
  rows.forEach(r => { if (!enCola.has(r.cliente_cod)) r.en_agenda = false })

  return { rows, recuperadoMes, totalPromesasActivas }
}
