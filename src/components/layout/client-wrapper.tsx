'use client'

/**
 * ClientWrapper
 *
 * Componente cliente que envuelve el contenido de la app autenticada.
 * Se encarga de:
 *   1. Montar el hook useSessionTimeout
 *   2. Mostrar el SessionTimeoutModal cuando corresponde
 *
 * Se ubica en el layout principal de la app para que aplique a todas
 * las páginas autenticadas.
 */

import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import SessionTimeoutModal   from '@/components/session-timeout-modal'

interface Props {
  children: React.ReactNode
}

export default function ClientWrapper({ children }: Props) {
  const { showWarning, secondsLeft, resetTimer, closeSession } = useSessionTimeout()

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
