import { BarChart3 } from 'lucide-react'

export default function ReportesPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Reportes</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Análisis y exportaciones de cartera
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
        <BarChart3 size={48} className="text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Módulo en construcción</h2>
        <p className="text-sm text-gray-500 max-w-md">
          Reportes incluirá: gestiones por analista (día/semana/mes),
          mora por vendedor con desglose, clientes sin gestión en N días,
          y exportación a Excel. Disponible en Sprint 3.
        </p>
      </div>
    </div>
  )
}
