import { Package } from 'lucide-react'

export default function MiCarteraPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Mi Cartera</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Cola de cobro diaria priorizada por score y urgencia
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
        <Package size={48} className="text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Módulo en construcción</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Mi Cartera mostrará la cola de cobro diaria con semáforo de prioridad
          (🔴 urgente · 🟡 seguimiento · 🟢 normal). Disponible en Sprint 2.
        </p>
      </div>
    </div>
  )
}
