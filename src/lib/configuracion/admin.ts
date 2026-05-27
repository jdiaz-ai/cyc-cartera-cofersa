/**
 * Utilidades compartidas para las API routes de Configuración.
 * Todas las operaciones de escritura usan service role key para bypassear RLS.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient }                          from '@/lib/supabase/server'
import { NextResponse }                          from 'next/server'

// ── Admin client (service role — bypassea RLS) ────────────────────────
export function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Verificar sesión + rol COORDINADOR ───────────────────────────────
// Retorna el email del usuario o una NextResponse de error
export async function checkCoordinador(): Promise<
  { ok: true; email: string } | { ok: false; res: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }
  const { data } = await supabase
    .from('usuarios')
    .select('rol')
    .ilike('email', user.email)
    .limit(1)
    .single()
  if ((data as { rol: string } | null)?.rol !== 'COORDINADOR') {
    return { ok: false, res: NextResponse.json({ error: 'Acceso restringido al coordinador' }, { status: 403 }) }
  }
  return { ok: true, email: user.email }
}

// ── Registrar en config_audit_log ────────────────────────────────────
// Errores de auditoría no interrumpen la operación principal
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertAuditLog(admin: ReturnType<typeof getAdminClient>, params: {
  tabla: string
  accion: 'INSERT' | 'UPDATE' | 'DELETE'
  descripcion: string
  valor_anterior?: Record<string, unknown>
  valor_nuevo?: Record<string, unknown>
  realizado_por: string
}) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('config_audit_log').insert({
      ...params,
      realizado_en: new Date().toISOString(),
    })
  } catch { /* no interrumpir la operación principal */ }
}
