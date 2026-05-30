import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies }            from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { after }              from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code       = searchParams.get('code')
  const oauthError = searchParams.get('error')
  const next       = searchParams.get('next') ?? '/dashboard'

  // ── Google devolvió error por prompt=none (requiere interacción) ─────
  // Redirigimos al login para reintentar con flujo interactivo (select_account).
  if (
    oauthError === 'interaction_required' ||
    oauthError === 'login_required'       ||
    oauthError === 'account_selection_required'
  ) {
    return NextResponse.redirect(`${origin}/login?needs_interaction=1`)
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && session) {
      const email = session.user?.email ?? null

      // ── Admin client (service role) — bypassea RLS de `usuarios` ──────
      // La tabla usuarios solo tiene política de SELECT; cualquier UPDATE con
      // el cliente del usuario es bloqueado por RLS. Por eso persistimos el
      // refresh token con service role.
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      // ── Caso A: Google devolvió refresh_token → persistirlo ──────────
      if (session.provider_refresh_token && email) {
        const refreshToken = session.provider_refresh_token
        const response = buildResponse(origin, next, email)
        response.cookies.set('sic_reconsent', '', { maxAge: 0, path: '/' }) // limpiar guard
        after(async () => {
          try {
            await admin.from('usuarios')
              .update({ google_refresh_token: refreshToken })
              .ilike('email', email)
          } catch {
            console.warn('[auth/callback] No se pudo guardar google_refresh_token')
          }
        })
        return response
      }

      // ── Caso B: login silencioso sin refresh_token ───────────────────
      // Si el usuario YA tiene token guardado, todo bien. Si NO, lo mandamos
      // una sola vez a reconsentir para capturarlo (guard cookie evita loops).
      if (email) {
        let tieneToken = false
        try {
          const { data } = await admin
            .from('usuarios')
            .select('google_refresh_token')
            .ilike('email', email)
            .limit(1)
            .maybeSingle()
          tieneToken = !!(data as { google_refresh_token?: string | null } | null)?.google_refresh_token
        } catch {}

        const yaIntento = request.cookies.get('sic_reconsent')?.value === '1'
        if (!tieneToken && !yaIntento) {
          const res = NextResponse.redirect(`${origin}/login?reconsent=1`)
          res.cookies.set('sic_reconsent', '1', { maxAge: 300, path: '/', sameSite: 'lax' })
          if (email) res.cookies.set('sic_login_hint', email, {
            maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production', httpOnly: false,
          })
          return res
        }
      }

      return buildResponse(origin, next, email)
    }
  }

  // En caso de error, redirigir a login con mensaje
  return NextResponse.redirect(`${origin}/login?error=auth_error`)
}

// ── Helper: redirección con cookie de login_hint para silent login futuro ──
function buildResponse(origin: string, next: string, email: string | null): NextResponse {
  const response = NextResponse.redirect(`${origin}${next}`)
  if (email) {
    response.cookies.set('sic_login_hint', email, {
      maxAge: 60 * 60 * 24 * 365, // 1 año
      path:   '/',
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      httpOnly: false, // legible desde el login page (client)
    })
  }
  return response
}
