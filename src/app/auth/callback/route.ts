import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
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
      // ── Persistir el Google refresh token en la BD ──────────────────
      // Google solo devuelve provider_refresh_token en la primera autorización
      // (o cuando se fuerza con prompt=consent). Lo guardamos en usuarios para
      // poder renovar el Gmail access_token en sesiones futuras sin pedir
      // consentimiento al usuario en cada login.
      if (session.provider_refresh_token && session.user?.email) {
        try {
          await supabase
            .from('usuarios')
            .update({ google_refresh_token: session.provider_refresh_token })
            .ilike('email', session.user.email)
        } catch {
          // No bloqueamos el login si esto falla
          console.warn('[auth/callback] No se pudo guardar google_refresh_token')
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // En caso de error, redirigir a login con mensaje
  return NextResponse.redirect(`${origin}/login?error=auth_error`)
}
