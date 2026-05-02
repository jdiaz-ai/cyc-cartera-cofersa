import { PieChart } from 'lucide-react'

export default function AnalisisPagosPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Análisis de Pagos</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Tendencias y comportamiento de pago por cliente y período
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
        <PieChart size={48} className="text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Módulo en construcción</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Análisis de Pagos ofrecerá gráficos de tendencia de recaudo, comparativo mes a mes
          y patrones de comportamiento por cliente. Disponible en Sprint 4.
        </p>
      </div>
    </div>
  )
}
