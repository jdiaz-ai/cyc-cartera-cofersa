import { createClient }  from '@/lib/supabase/server'
import { hoyISO }        from '@/lib/utils/formato'
import MiCarteraView     from '@/components/cartera/mi-cartera-view'
import {
  computarColaDia,
  type CarteraRow,
  type KPIs,
} from '@/lib/utils/cola-analista'

// Re-exportar tipos para que MiCarteraView (que importa de aquí) siga funcionando
// mientras migramos. MiCarteraView importa directamente desde cola-analista ahora.
export type { CarteraRow, KPIs }

const EMPTY_KPIS: KPIs = {
  moraTotal: 0, recuperadoMes: 0, promesasActivas: 0, sinGestion7d: 0,
}

export default async function MiCarteraPage() {
  const supabase  = await createClient()
  const hoy       = hoyISO()

  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  if (!userEmail) return <MiCarteraView rows={[]} kpis={EMPTY_KPIS} />

  // Toda la lógica de scoring vive en computarColaDia (cola-analista.ts)
  const { rows, recuperadoMes, totalPromesasActivas } =
    await computarColaDia(supabase, userEmail, hoy)

  const kpis: KPIs = {
    moraTotal:       rows.reduce((s, r) => s + r.mora_total, 0),
    recuperadoMes,
    promesasActivas: totalPromesasActivas,
    sinGestion7d:    rows.filter(r => r.dias_sin_gestion > 7).length,
  }

  return <MiCarteraView rows={rows} kpis={kpis} />
}
