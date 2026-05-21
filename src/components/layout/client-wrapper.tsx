'use client'

/**
 * ClientWrapper
 *
 * Componente cliente que envuelve el contenido de la app autenticada.
 * Se encarga de:
 *   1. Montar el hook useSessionTimeout (inactividad 30 min)
 *   2. Mostrar el SessionTimeoutModal cuando corresponde
 *   3. Escuchar eventos de auth de Supabase y redirigir al login si la sesión
 *      expira por razones externas (token revocado, otro dispositivo, etc.)
 */

import { useEffect }         from 'react'
import { useRouter }         from 'next/navigation'
import { createClient }      from '@/lib/supabase/client'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import SessionTimeoutModal   from '@/components/session-timeout-modal'

interface Props {
  children: React.ReactNode
}

export default function ClientWrapper({ children }: Props) {
  const router = useRouter()
  const { showWarning, secondsLeft, resetTimer, closeSession } = useSessionTimeout()

  // ── Listener de eventos de autenticación Supabase ─────────────────────
  // Complementa useSessionTimeout (inactividad) cubriendo expiración real
  // de sesión: token revocado desde otro dispositivo o expiración del servidor.
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // La sesión expiró o fue revocada — redirigir al login limpiamente
        router.push('/login')
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  return (
    <>
      {children}
      {showWarning && (
        <SessionTimeoutModal
          secondsLeft={secondsLeft}
          onContinue={resetTimer}
          onClose={closeSession}
        />
      )}
    </>
  )
}
