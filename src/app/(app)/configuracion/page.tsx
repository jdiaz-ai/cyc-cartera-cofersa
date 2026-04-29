import { createClient } from '@/lib/supabase/server'
import { Settings } from 'lucide-react'
import { formatCRC } from '@/lib/utils'

export default async function ConfiguracionPage() {
  const supabase = await createClient()

  let config: { clave: string; valor: string; descripcion: string }[] = []
  let usuarios: { nombre: string; email: string; rol: string; activo: boolean }[] = []

  try {
    const { data } = await supabase.from('config_sistema').select('*')
    config = data ?? []
  } catch { /* ok */ }

  try {
    const { data } = await supabase
      .from('usuarios')
      .select('nombre, email, rol, activo')
      .order('nombre')
    usuarios = data ?? []
  } catch { /* ok */ }

  const metaMensual = config.find((c) => c.clave === 'META_MENSUAL')
  const diasAlerta = config.find((c) => c.clave === 'DIAS_SIN_GESTION_ALERTA')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Parámetros del sistema y gestión de usuarios
        </p>
      </div>

      {/* Parámetros */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Settings size={14} />
          Parámetros del Sistema
        </h2>
        {config.length === 0 ? (
          <p className="text-sm text-gray-500">
            Sin configuración — ejecute la migración SQL en Supabase.
          </p>
        ) : (
          <div className="space-y-3">
            {metaMensual && (
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Meta Mensual de Cobro</p>
                  <p className="text-xs text-gray-500">{metaMensual.descripcion}</p>
                </div>
                <span className="text-sm font-bold text-gray-900">
                  {formatCRC(Number(metaMensual.valor))}
                </span>
              </div>
            )}
            {diasAlerta && (
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Alerta Sin Gestión</p>
                  <p className="text-xs text-gray-500">{diasAlerta.descripcion}</p>
                </div>
                <span className="text-sm font-bold text-gray-900">
                  {diasAlerta.valor} días
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Usuarios */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Usuarios del Sistema</h2>
        {usuarios.length === 0 ? (
          <p className="text-sm text-gray-500">
            Sin usuarios registrados — inserte los usuarios en la tabla <code className="bg-gray-100 px-1 rounded">usuarios</code>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    Nombre
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    Rol
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.email} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 font-medium text-gray-800">{u.nombre}</td>
                    <td className="py-2.5 px-3 text-gray-600">{u.email}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={
                          u.rol === 'COORDINADOR'
                            ? { backgroundColor: '#003B5C', color: 'white' }
                            : { backgroundColor: '#e0f2fe', color: '#0369a1' }
                        }
                      >
                        {u.rol}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.activo
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
