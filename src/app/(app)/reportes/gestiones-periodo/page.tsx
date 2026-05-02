import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GestionesPeriodoCliente from './gestiones-periodo-cliente'
import type { Gestion } from '@/types/database'

// ── Tipos exportados para el componente cliente ───────────────────

export interface MetricasGestiones {
  total: number
  porTipo: Record<string, number>
  porResultado: Record<string, number>
  promesasGeneradas: number
  gestionesConExito: number   // resultado = 'Promesa OK' | 'Pagó' | 'Aceptó convenio'
}

// ── Página (Server Component) ────────────────────────────────────

export default async function GestionesPeriodoPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('email', user.email!)
    .single()

  const rol = (usuarioRow as { rol: string } | null)?.rol ?? 'ANALISTA'
  if (rol === 'COORDINADOR') redirect('/reportes')

  // Período por defecto: mes en curso
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
  const finMes    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10)

  // Traer gestiones del período por defecto
  const { data: gestionesRows } = await supabase
    .from('gestiones')
    .select('*')
    .eq('analista_email', user.email!)
    .gte('fecha', inicioMes)
    .lte('fecha', finMes)
    .order('fecha', { ascending: false })
    .order('hora', { ascending: false })

  const gestiones = (gestionesRows ?? []) as Gestion[]

  return (
    <GestionesPeriodoCliente
      gestionesIniciales={gestiones}
      inicioMesDefault={inicioMes}
      finMesDefault={finMes}
      userEmail={user.email!}
    />
  )
}
