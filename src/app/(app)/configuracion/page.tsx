import { redirect }             from 'next/navigation'
import { createClient }           from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Settings }               from 'lucide-react'
import ConfigTabs, { type ConfigTabsData } from '@/components/configuracion/ConfigTabs'
import type { SemaforoData }      from '@/components/configuracion/TabSemaforo'
import type { VendedorRow }       from '@/components/configuracion/TabVendedores'
import type { SupervisorRow }     from '@/components/configuracion/TabSupervisores'
import type { UsuarioRow }        from '@/components/configuracion/TabUsuarios'
import type { ParamRow }          from '@/components/configuracion/TabParametros'
import type { DirectorioRow }     from '@/components/configuracion/TabDirectorio'
import type { LogRow }            from '@/components/configuracion/TabLog'

// ── Claves del semáforo ───────────────────────────────────────────────
const CLAVES_SEMAFORO = [
  'semaforo_rojo_mora_dias', 'semaforo_rojo_sin_gestion_dias',
  'semaforo_ambar_mora_min', 'semaforo_ambar_mora_max',
  'semaforo_ambar_promesa_dias', 'semaforo_ambar_sin_gestion_dias',
]
const DEFAULTS_SEMAFORO: SemaforoData = {
  semaforo_rojo_mora_dias:         '60',
  semaforo_rojo_sin_gestion_dias:  '10',
  semaforo_ambar_mora_min:         '31',
  semaforo_ambar_mora_max:         '60',
  semaforo_ambar_promesa_dias:     '7',
  semaforo_ambar_sin_gestion_dias: '5',
}
const CLAVES_PARAMETROS = ['meta_mensual', 'meta_gestiones_diarias', 'dias_sin_gestion_alerta', 'pct_mora_referencia']

// ══════════════════════════════════════════════════════════════════════
export default async function ConfiguracionPage() {
  // ── 1. Verificar sesión + rol COORDINADOR ─────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/login')

  const { data: perfilRow } = await supabase
    .from('usuarios')
    .select('rol')
    .ilike('email', user.email)
    .limit(1)
    .single()

  if ((perfilRow as { rol: string } | null)?.rol !== 'COORDINADOR') {
    redirect('/dashboard')
  }

  // ── 2. Admin client para cargar datos (bypassea RLS) ─────────────
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── 3. Cargar datos en paralelo ───────────────────────────────────
  const [
    vendedoresRes, supervisoresRes, usuariosRes,
    configRes, directorioRes, logsRes,
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('vendedores')
      .select('cod, nombre, email, zona, analista_email, activo, asignado_por, asignado_en, supervisor_cod')
      .eq('activo', true).order('nombre'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('supervisores')
      .select('cod, nombre, email, activo, created_at').order('nombre'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('usuarios')
      .select('id, nombre, email, rol, iniciales, color, activo, meta_individual, telefono, whatsapp, created_at')
      .order('nombre'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('config_sistema').select('clave, valor, descripcion'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('directorio_empresa')
      .select('id, nombre, email, cargo, area, activo, created_at').eq('activo', true).order('nombre'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('config_audit_log')
      .select('id, tabla, accion, descripcion, realizado_por, realizado_en', { count: 'exact' })
      .order('realizado_en', { ascending: false }).limit(50),
  ])

  // ── 4. Procesar vendedores con supervisor_nombre ──────────────────
  const supMap: Record<string, string> = {}
  ;((supervisoresRes.data ?? []) as Array<{ cod: string; nombre: string }>)
    .forEach(s => { supMap[s.cod] = s.nombre })

  const vendedores: VendedorRow[] = ((vendedoresRes.data ?? []) as Array<Record<string, unknown>>).map(v => ({
    cod:              v.cod as string,
    nombre:           v.nombre as string,
    email:            v.email as string | null,
    zona:             v.zona as string | null,
    analista_email:   v.analista_email as string | null,
    asignado_por:     v.asignado_por as string | null,
    asignado_en:      v.asignado_en as string | null,
    supervisor_cod:   v.supervisor_cod as string | null,
    supervisor_nombre: v.supervisor_cod ? (supMap[v.supervisor_cod as string] ?? null) : null,
  }))

  // ── 5. Contar vendedores por supervisor ───────────────────────────
  const cuentaVend: Record<string, number> = {}
  vendedores.forEach(v => {
    if (v.supervisor_cod) cuentaVend[v.supervisor_cod] = (cuentaVend[v.supervisor_cod] ?? 0) + 1
  })

  const supervisores: SupervisorRow[] = ((supervisoresRes.data ?? []) as Array<Record<string, unknown>>).map(s => ({
    cod:         s.cod as string,
    nombre:      s.nombre as string,
    email:       s.email as string | null,
    activo:      s.activo as boolean,
    n_vendedores: cuentaVend[s.cod as string] ?? 0,
    created_at:  s.created_at as string,
  }))

  // ── 6. Analistas para el dropdown de vendedores ───────────────────
  const usuarios: UsuarioRow[] = (usuariosRes.data ?? []) as UsuarioRow[]
  const analistas = usuarios
    .filter(u => u.activo)
    .map(u => ({ nombre: u.nombre, email: u.email, iniciales: u.iniciales, color: u.color }))

  // ── 7. Parámetros + Semáforo + SLA ───────────────────────────────
  const configRows = (configRes.data ?? []) as Array<{ clave: string; valor: string; descripcion?: string }>

  const parametros: ParamRow[] = configRows.filter(r => CLAVES_PARAMETROS.includes(r.clave))

  const semaforo: SemaforoData = { ...DEFAULTS_SEMAFORO }
  configRows.filter(r => CLAVES_SEMAFORO.includes(r.clave)).forEach(r => { semaforo[r.clave] = r.valor })

  // SLA overrides: cualquier clave que empiece con 'sla_'
  const slaOverrides: Record<string, string> = {}
  configRows.filter(r => r.clave.startsWith('sla_')).forEach(r => { slaOverrides[r.clave] = r.valor })

  // ── 8. Logs ───────────────────────────────────────────────────────
  const logs: LogRow[]  = (logsRes.data ?? []) as LogRow[]
  const logsTotal       = (logsRes.count ?? 0) as number

  // ── 9. Armar data para ConfigTabs ─────────────────────────────────
  const data: ConfigTabsData = {
    vendedores, analistas, supervisores: supervisores,
    usuarios, parametros, semaforo, slaOverrides,
    directorio: (directorioRes.data ?? []) as DirectorioRow[],
    logs, logsTotal,
  }

  // ── 10. Render ────────────────────────────────────────────────────
  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center rounded-xl"
          style={{ width: 40, height: 40, backgroundColor: '#003B5C' }}>
          <Settings size={18} color="white" />
        </div>
        <div>
          <h1 className="text-[19px] font-bold text-gray-900">Configuración del Sistema</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Distribución de vendedores · Usuarios · Parámetros · Semáforo · SLA · Directorio
          </p>
        </div>
        <div className="ml-auto">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold"
            style={{ backgroundColor: '#003B5C', color: 'white' }}
          >
            Solo COORDINADOR
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <ConfigTabs data={data} />
      </div>
    </div>
  )
}
