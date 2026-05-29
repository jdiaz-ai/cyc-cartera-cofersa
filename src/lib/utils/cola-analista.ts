/**
 * cola-analista.ts
 *
 * Fuente única de verdad para el algoritmo de priorización de cartera.
 * Usado por:
 *   - src/app/(app)/mi-cartera/page.tsx
 *   - src/app/(app)/dashboard/page.tsx (DashboardAnalista)
 *
 * La lógica es IDÉNTICA en ambos contextos para que el analista vea
 * los mismos clientes en el Dashboard y en Mi Cartera.
 */

import { fmtCRC } from '@/lib/utils/formato'
import type { Cartera, MaestroCliente } from '@/types/database'
import { createClient } from '@/lib/supabase/server'

// ── Tipo del cliente Supabase server-side ────────────────────────────
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// ══════════════════════════════════════════════════════════════════════
// TIPOS EXPORTADOS
// ══════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════════════

export const MORA_MINIMA = 100_000        // ₡100K — por debajo no entra a la cola
const LOG_MIN            = Math.log(MORA_MINIMA)
const LOG_MAX            = Math.log(10_000_000)   // ₡10M = score monto máximo
const TOPE_DIARIO        = 30

// ══════════════════════════════════════════════════════════════════════
// ALGORITMO DE SCORING V3
// Pesos: 40% monto | 35% días mora | 15% días sin gestión | 10% promesa
// Hard includes: promesa vencida/hoy, mora +120d
// Hard excludes: gestionado hoy, promesa vigente + gestión ≤3d,
//                próxima acción futura, mora < ₡100K
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

  if (p.gestionado_hoy) {
    // ── RAMA A — YA GESTIONADO HOY ──────────────────────────────────
    // Aparece en la sección "gestionados hoy" de Mi Cartera.
    // NO entra a la cola del Dashboard.
    if (p.mora_total < MORA_MINIMA) return OUT()
    // Cae al scoring compartido de abajo
  } else {
    // ── RAMA B — PENDIENTE: lógica completa ─────────────────────────

    // HARD INCLUDE: promesas vencidas o que vencen hoy
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

    // EXCLUSIÓN: próxima acción programada para una fecha futura
    if (p.proxima_accion_fecha) {
      if (new Date(p.proxima_accion_fecha).getTime() > hoyMs) return OUT()
    }

    // HARD INCLUDE: mora en tramo +120 días
    if ((p.mora_120_plus ?? 0) > 0 || p.dias_mora > 120) {
      return {
        en_agenda: true, is_hard_include: true, prioridad: 'critico', score: 92,
        motivo: `Mora supera 120 días (${fmtCRC(p.mora_total)}) — crítico`,
      }
    }

    // EXCLUSIÓN: promesa vigente (futura) + gestión reciente — no molestar
    if (p.promesa_activa && p.promesa_fecha) {
      const diasParaPromesa = Math.floor(
        (new Date(p.promesa_fecha).getTime() - hoyMs) / 86_400_000,
      )
      if (diasParaPromesa > 0 && dsg <= 3) return OUT()
    }

    // EXCLUSIÓN: mora por debajo del mínimo operativo
    if (p.mora_total < MORA_MINIMA) return OUT()
  }

  // ── SCORING PONDERADO 0–100 (compartido: rama A y B) ────────────────
  const montoScore   = Math.min(1, Math.max(0,
    (Math.log(Math.max(p.mora_total, MORA_MINIMA)) - LOG_MIN) / (LOG_MAX - LOG_MIN),
  ))
  const moraScore    = Math.min(1, p.dias_mora / 120)
  const gestionScore = Math.min(1, dsg / 30)

  let promesaBoost = 0
  if (p.promesa_activa && p.promesa_fecha) {
    const dias = Math.floor((new Date(p.promesa_fecha).getTime() - hoyMs) / 86_400_000)
    if (dias <= 3)       promesaBoost = 1.0
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

// ══════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: computarColaDia
// Ejecuta todas las queries necesarias y devuelve:
//   - rows: lista completa de CarteraRow, ordenada y con en_agenda calculado
//   - recuperadoMes: promesas CUMPLIDA en el mes actual
//   - totalPromesasActivas: clientes con promesa PENDIENTE
// ══════════════════════════════════════════════════════════════════════

export async function computarColaDia(
  supabase: SupabaseServerClient,
  userEmail: string,
  hoy: string,
): Promise<{ rows: CarteraRow[]; recuperadoMes: number; totalPromesasActivas: number }> {

  const hoyMs = new Date(hoy).getTime()

  // ── 1. Clientes asignados al analista ──────────────────────────────
  const { data: maestroData } = await supabase
    .from('maestro_clientes')
    .select('cliente_cod')
    .eq('analista_email', userEmail)

  const codigos = ((maestroData ?? []) as Pick<MaestroCliente, 'cliente_cod'>[])
    .map(c => c.cliente_cod).filter(Boolean)

  if (codigos.length === 0) {
    return { rows: [], recuperadoMes: 0, totalPromesasActivas: 0 }
  }

  // ── 2. Sync más reciente ───────────────────────────────────────────
  const { data: syncRefData } = await supabase
    .from('cartera')
    .select('sync_id')
    .order('updated_at', { ascending: false })
    .limit(1)
  const latestSyncId = ((syncRefData ?? [])[0] as { sync_id: string } | undefined)?.sync_id ?? ''

  // ── 3. Cartera — solo del sync más reciente ────────────────────────
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

  // ── 4. Última gestión + próxima acción por cliente ─────────────────
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
        proximaAccionMap[g.cliente_cod] = {
          accion: g.proxima_accion,
          fecha:  g.proxima_accion_fecha,
        }
      }
    })
  }

  // ── 5. Promesas PENDIENTE — más próxima + monto por cliente ────────
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

  // ── 6. Recuperado este mes (promesas CUMPLIDA) ─────────────────────
  let recuperadoMes = 0
  {
    const inicioMes = hoy.slice(0, 7) + '-01'
    const { data: cumplidas } = await supabase
      .from('promesas').select('monto')
      .in('cliente_cod', codigos).eq('estado', 'CUMPLIDA').gte('updated_at', inicioMes)
    recuperadoMes = ((cumplidas ?? []) as { monto: number }[])
      .reduce((s, p) => s + (p.monto || 0), 0)
  }

  // ── 7. Construir CarteraRow[] con scoring ──────────────────────────
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

  // ── 8. Orden global: score desc → mora_total desc ──────────────────
  rows.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.mora_total - a.mora_total
  )

  // ── 9. Tope dinámico de la cola: ~30 pendientes por día ───────────
  // Solo aplica a pendientes (no gestionados hoy).
  // Los gestionados hoy siempre se incluyen para que Mi Cartera
  // muestre el progreso real del día.
  const hardCods   = new Set(rows.filter(r => r.is_hard_include && !r.gestionado_hoy).map(r => r.cliente_cod))
  const candidatos = rows.filter(r => r.en_agenda && !r.is_hard_include && !r.gestionado_hoy)
  const cupo       = Math.max(0, TOPE_DIARIO - hardCods.size)
  const enCola     = new Set<string>([
    ...hardCods,
    ...candidatos.slice(0, cupo).map(r => r.cliente_cod),
  ])
  // Gestionados hoy elegibles: siempre visibles en Mi Cartera (fuera del tope)
  rows.filter(r => r.gestionado_hoy && r.en_agenda).forEach(r => enCola.add(r.cliente_cod))
  rows.forEach(r => { if (!enCola.has(r.cliente_cod)) r.en_agenda = false })

  return { rows, recuperadoMes, totalPromesasActivas }
}
