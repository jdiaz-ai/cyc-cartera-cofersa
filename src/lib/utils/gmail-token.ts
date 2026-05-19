/**
 * gmail-token.ts
 *
 * Resuelve el acceso vigente a la Gmail API.
 *
 * El `provider_token` (access_token de Google) dura exactamente 1 hora.
 * Supabase NO lo renueva automáticamente. Esta utilidad:
 *   1. Devuelve el `provider_token` si aún es válido.
 *   2. Si es null/expirado, usa el `provider_refresh_token` (de larga duración)
 *      para obtener uno nuevo vía Google OAuth, sin que el usuario tenga que
 *      cerrar sesión.
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
 */
export async function resolveGmailToken(
  providerToken:        string | null | undefined,
  providerRefreshToken: string | null | undefined,
): Promise<string | null> {
  // ── 1. Token vigente → usarlo directamente ───────────────────────
  if (providerToken) return providerToken

  // ── 2. Sin refresh token → imposible renovar ─────────────────────
  if (!providerRefreshToken) return null

  // ── 3. Verificar credenciales de la app disponibles ──────────────
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.warn('[gmail-token] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados.')
    return null
  }

  // ── 4. Llamar a Google para renovar el access_token ──────────────
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: providerRefreshToken,
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
