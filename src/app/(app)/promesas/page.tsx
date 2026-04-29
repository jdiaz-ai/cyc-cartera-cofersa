import { Handshake } from 'lucide-react'

export default function PromesasPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Promesas de Pago</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Seguimiento de compromisos de pago por cliente
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
        <Handshake size={48} className="text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Módulo en construcción</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Promesas mostrará tabs Hoy / Esta Semana / Todas con estados
          Pendiente · Abono Parcial · Cumplida · Incumplida.
          Permitirá gestionar el seguimiento y actualizar el estado de cada promesa.
          Disponible en Sprint 3.
        </p>
      </div>
    </div>
  )
}
