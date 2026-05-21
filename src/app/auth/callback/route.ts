import { createServerClient } from '@supabase/ssr'
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
      // ── Construir la respuesta de redirección ────────────────────────
      const response = NextResponse.redirect(`${origin}${next}`)

      // ── Cookie con el email para silent login futuro ─────────────────
      // El login page lee 'sic_login_hint' y lo pasa como login_hint a Google,
      // lo que permite saltarse el selector de cuenta en logins posteriores.
      if (session.user?.email) {
        response.cookies.set('sic_login_hint', session.user.email, {
          maxAge: 60 * 60 * 24 * 365, // 1 año
          path:   '/',
          sameSite: 'lax',
          secure:   process.env.NODE_ENV === 'production',
          httpOnly: false, // debe ser legible desde el cliente (login page)
        })
      }

      // ── Persistir google_refresh_token en BD (no bloquea el redirect) ─
      // `after()` ejecuta este bloque DESPUÉS de enviar la respuesta al browser.
      // El usuario ya está en /dashboard mientras esto se procesa en background.
      if (session.provider_refresh_token && session.user?.email) {
        const email         = session.user.email
        const refreshToken  = session.provider_refresh_token

        after(async () => {
          try {
            await supabase
              .from('usuarios')
              .update({ google_refresh_token: refreshToken })
              .ilike('email', email)
          } catch {
            console.warn('[auth/callback] No se pudo guardar google_refresh_token')
          }
        })
      }

      return response
    }
  }

  // En caso de error, redirigir a login con mensaje
  return NextResponse.redirect(`${origin}/login?error=auth_error`)
}
