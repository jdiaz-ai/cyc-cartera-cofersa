import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import ResumenEjecutivoCliente from './resumen-ejecutivo-cliente'
import type { DSOPunto } from '@/components/coordinador/DSOTendenciaCard'
import type { ConcentracionResult } from '@/types/analisis-pagos'

export const dynamic = 'force-dynamic'

interface KpisCartera {
  total_no_vencido: number; total_mora_1_30: number; total_mora_31_60: number
  total_mora_61_90: number; total_mora_91_120: number; total_mora_120_plus: number
  total_cartera: number; total_mora: number; n_clientes: number; n_en_mora: number
  fecha_corte: string
}

export interface ResumenEjecutivoData {
  cartera: number; mora: number; noVencido: number
  m130: number; m3160: number; m6190: number; m91120: number; m120: number
  nClientes: number; nMora: number; venc30: number; pctMora: number; pctVenc30: number
  dso: number; dsoTendencia: DSOPunto[]
  fechaCorte: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  concentracion: ConcentracionResult | null
}

export default async function ResumenEjecutivoPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfilRow } = await supabase
    .from('usuarios')
    .select('rol, nombre')
    .eq('email', user.email!)
    .limit(1)
    .maybeSingle()

  const rol = (perfilRow as { rol: string; nombre: string } | null)?.rol ?? 'ANALISTA'
  if (rol !== 'COORDINADOR') redirect('/reportes')
  const nombre = (perfilRow as { nombre: string } | null)?.nombre ?? user.email!

  // ── KPIs de cartera (SUM server-side) ──────────────────────────────────
  let nv = 0, m130 = 0, m31 = 0, m61 = 0, m91 = 0, m120 = 0
  let cartera = 0, mora = 0, nClientes = 0, nMora = 0, fechaCorte = ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc('get_kpis_cartera')
    if (data && (data as KpisCartera[]).length > 0) {
      const k = (data as KpisCartera[])[0]
      nv = +k.total_no_vencido || 0; m130 = +k.total_mora_1_30 || 0
      m31 = +k.total_mora_31_60 || 0; m61 = +k.total_mora_61_90 || 0
      m91 = +k.total_mora_91_120 || 0; m120 = +k.total_mora_120_plus || 0
      cartera = +k.total_cartera || 0; mora = +k.total_mora || 0
      nClientes = +k.n_clientes || 0; nMora = +k.n_en_mora || 0
      fechaCorte = k.fecha_corte || ''
    }
  } catch {}

  // ── DSO (ventas_mensuales rolling 3m con IVA) ──────────────────────────
  let ventas90d = 0
  let dsoTendencia: DSOPunto[] = []
  try {
    const { data: todosMeses } = await supabase
      .from('ventas_mensuales')
      .select('anio, mes, total_ventas_sin_iva, cartera_total_mes')
      .order('anio', { ascending: true })
      .order('mes', { ascending: true })
    const meses = (todosMeses ?? []) as {
      anio: number; mes: number; total_ventas_sin_iva: number; cartera_total_mes: number | null
    }[]
    ventas90d = meses.slice(-3).reduce((s, v) => s + Number(v.total_ventas_sin_iva), 0)
    for (let i = 2; i < meses.length; i++) {
      const v3 = Number(meses[i-2].total_ventas_sin_iva) + Number(meses[i-1].total_ventas_sin_iva) + Number(meses[i].total_ventas_sin_iva)
      const v90iva = v3 * 1.13
      const carteraMes = meses[i].cartera_total_mes !== null ? Number(meses[i].cartera_total_mes) : cartera
      const esEstimado = meses[i].cartera_total_mes === null
      if (v90iva > 0 && carteraMes > 0) {
        dsoTendencia.push({ anio: meses[i].anio, mes: meses[i].mes, dso: Math.round((carteraMes / v90iva) * 90 * 10) / 10, ventas90d: v90iva, esEstimado })
      }
    }
    dsoTendencia = dsoTendencia.slice(-6)
  } catch {}
  const dso = ventas90d > 0 ? Math.round((cartera / (ventas90d * 1.13)) * 90 * 10) / 10 : 0

  // ── Concentración (top 10 + HHI) ───────────────────────────────────────
  let concentracion: ConcentracionResult | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc('fn_analisis_concentracion')
    concentracion = (data as ConcentracionResult) ?? null
  } catch {}

  const venc30 = Math.max(0, m31) + Math.max(0, m61) + Math.max(0, m91) + Math.max(0, m120)
  const pctMora   = cartera > 0 ? Math.round(mora / cartera * 1000) / 10 : 0
  const pctVenc30 = cartera > 0 ? Math.round(venc30 / cartera * 1000) / 10 : 0

  const data: ResumenEjecutivoData = {
    cartera, mora, noVencido: nv, m130, m3160: m31, m6190: m61, m91120: m91, m120,
    nClientes, nMora, venc30, pctMora, pctVenc30, dso, dsoTendencia, fechaCorte, concentracion,
  }

  return <ResumenEjecutivoCliente data={data} generadoPor={nombre} />
}
