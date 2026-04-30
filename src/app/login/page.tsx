'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function LoginPage() {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [showEmail, setShowEmail] = useState(false)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  // ── Google OAuth ──────────────────────────────────────────────────
  async function handleGoogleLogin() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError('Error al iniciar sesión con Google. Intente de nuevo.')
      setLoading(false)
    }
  }

  // ── Email / Password ──────────────────────────────────────────────
  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Correo o contraseña incorrectos.')
      setLoading(false)
    }
    // Si es exitoso, el listener de auth redirige automáticamente
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #001f38 0%, #003B5C 60%, #005a8e 100%)' }}
    >
      <div className="w-full max-w-sm px-4">

        {/* Logo + título */}
        <div className="text-center mb-8">
          <div
            className="mx-auto mb-4 rounded-2xl overflow-hidden"
            style={{
              width: '200px',
              height: '72px',
              backgroundColor: 'white',
              backgroundImage: "url('/logo-cofersa.png')",
              backgroundSize: '125% auto',
              backgroundPosition: '50% center',
              backgroundRepeat: 'no-repeat',
            }}
          />
          <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mt-2">
            Crédito y Cobro
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-8 py-8">
            <h1 className="text-gray-900 text-lg font-bold text-center mb-1">
              Iniciar sesión
            </h1>
            <p className="text-gray-400 text-xs text-center mb-7">
              Solo cuentas autorizadas por Cofersa tienen acceso
            </p>

            {/* Error */}
            {error && (
              <div className="mb-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {!showEmail ? (
              /* ── Vista principal: Google + enlace email ── */
              <>
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {loading ? 'Redirigiendo...' : 'Continuar con Google (@cofersa.cr)'}
                </button>

                {/* Separador */}
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-gray-300 text-xs">o</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                <button
                  onClick={() => setShowEmail(true)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                >
                  Iniciar con correo y contraseña
                </button>
              </>
            ) : (
              /* ── Formulario email/password ── */
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="correo@empresa.com"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#009ee3' }}
                >
                  {loading ? 'Verificando...' : 'Ingresar'}
                </button>

                <button
                  type="button"
                  onClick={() => { setShowEmail(false); setError(null) }}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 transition pt-1"
                >
                  ← Volver al inicio con Google
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
          © 2026 Cofersa / Overseas Logistics Operations S.A.
        </p>
      </div>
    </div>
  )
}
