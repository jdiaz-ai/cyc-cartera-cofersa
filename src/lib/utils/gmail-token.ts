/**
 * gmail-token.ts
 *
 * Resuelve el acceso vigente a la Gmail API.
 *
 * El `provider_token` (access_token de Google) dura exactamente 1 hora.
 * Supabase NO lo renueva automáticamente. Esta utilidad:
 *   1. Devuelve el `provider_token` si aún es válido.
 *   2. Si es null/expirado, usa el `provider_refresh_token` de la sesión.
 *   3. Si tampoco está en sesión (login sin prompt=consent), lo busca en
 *      la tabla `usuarios.google_refresh_token` donde se persistió la primera vez.
 *
 * Requiere en env:
 *   GOOGLE_CLIENT_ID     — mismo que configuraste en Supabase → Auth → Google
 *   GOOGLE_CLIENT_SECRET — ídem
 */

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

/**
 * Retorna un access_token de Gmail API válido, o null si no es posible.
 *
 * @param providerToken        session?.provider_token        (puede ser null)
 * @param providerRefreshToken session?.provider_refresh_token (puede ser null)
 * @param userEmail            email del usuario autenticado, para buscar el
 *                             refresh token persistido en la BD si la sesión
 *                             no lo trae (logins sin prompt=consent).
 */
export async function resolveGmailToken(
  providerToken:        string | null | undefined,
  providerRefreshToken: string | null | undefined,
  userEmail?:           string | null,
): Promise<string | null> {
  // ── 1. Token vigente → usarlo directamente ───────────────────────
  if (providerToken) return providerToken

  // ── 2. Refresh token de la sesión → intentar renovar ────────────
  let refreshToken = providerRefreshToken ?? null

  // ── 3. Sin refresh en sesión → buscar el persistido en la BD ────
  if (!refreshToken && userEmail) {
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data } = await supabase
        .from('usuarios')
        .select('google_refresh_token')
        .ilike('email', userEmail)
        .limit(1)
        .single()
      refreshToken = (data as { google_refresh_token?: string | null } | null)
        ?.google_refresh_token ?? null
    } catch {
      // Fallo silencioso — continuamos sin refresh token
    }
  }

  // ── 4. Sin refresh token por ninguna vía → imposible renovar ────
  if (!refreshToken) return null

  // ── 5. Verificar credenciales de la app disponibles ─────────────
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.warn('[gmail-token] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados.')
    return null
  }

  // ── 6. Llamar a Google para renovar el access_token ─────────────
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }).toString(),
    })

    const data: TokenResponse = await res.json()

    if (!res.ok || !data.access_token) {
      console.error('[gmail-token] Google token refresh falló:', data.error, data.error_description)
      return null
    }

    return data.access_token
  } catch (err) {
    console.error('[gmail-token] Error de red al renovar token:', err)
    return null
  }
}
