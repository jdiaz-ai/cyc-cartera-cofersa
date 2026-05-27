'use client'

import { useState } from 'react'
import TabVendedores,  { type VendedorRow, type AnalistaBasico, type SupervisorBasico } from './TabVendedores'
import TabSupervisores, { type SupervisorRow }                                          from './TabSupervisores'
import TabUsuarios,    { type UsuarioRow }                                              from './TabUsuarios'
import TabParametros,  { type ParamRow }                                                from './TabParametros'
import TabSemaforo,    { type SemaforoData }                                            from './TabSemaforo'
import TabSLA                                                                           from './TabSLA'
import TabDirectorio,  { type DirectorioRow }                                           from './TabDirectorio'
import TabLog,         { type LogRow }                                                  from './TabLog'

// ── Tipos de datos de carga inicial ──────────────────────────────────
export interface ConfigTabsData {
  vendedores:   VendedorRow[]
  analistas:    AnalistaBasico[]
  supervisores: SupervisorRow[]
  usuarios:     UsuarioRow[]
  parametros:   ParamRow[]
  semaforo:     SemaforoData
  slaOverrides: Record<string, string>
  directorio:   DirectorioRow[]
  logs:         LogRow[]
  logsTotal:    number
}

// ── Definición de tabs ────────────────────────────────────────────────
const TABS = [
  { id: 'vendedores',   label: 'Distribución Vendedores' },
  { id: 'supervisores', label: 'Supervisores' },
  { id: 'usuarios',     label: 'Usuarios' },
  { id: 'parametros',   label: 'Parámetros' },
  { id: 'semaforo',     label: 'Semáforo' },
  { id: 'sla',          label: 'SLA Solicitudes' },
  { id: 'directorio',   label: 'Directorio' },
  { id: 'log',          label: 'Log del Sistema' },
] as const

type TabId = typeof TABS[number]['id']

interface Props { data: ConfigTabsData }

export default function ConfigTabs({ data }: Props) {
  const [active, setActive] = useState<TabId>('vendedores')

  return (
    <div>
      {/* ── Tab nav ── */}
      <div
        className="flex overflow-x-auto mb-6"
        style={{ borderBottom: '1px solid #e2e8f0', gap: 0 }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className="flex-shrink-0 px-4 py-3 text-[13px] font-semibold transition-colors whitespace-nowrap"
            style={active === tab.id
              ? { color: '#009ee3', borderBottom: '2px solid #009ee3' }
              : { color: '#64748b', borderBottom: '2px solid transparent' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Contenido del tab activo ── */}
      <div>
        {active === 'vendedores' && (
          <TabVendedores
            vendedores={data.vendedores}
            analistas={data.analistas}
            supervisores={data.supervisores.map(s => ({ cod: s.cod, nombre: s.nombre }))}
          />
        )}
        {active === 'supervisores' && (
          <TabSupervisores supervisores={data.supervisores} />
        )}
        {active === 'usuarios' && (
          <TabUsuarios usuarios={data.usuarios} />
        )}
        {active === 'parametros' && (
          <TabParametros parametros={data.parametros} />
        )}
        {active === 'semaforo' && (
          <TabSemaforo semaforo={data.semaforo} />
        )}
        {active === 'sla' && (
          <TabSLA slaOverrides={data.slaOverrides} />
        )}
        {active === 'directorio' && (
          <TabDirectorio contactos={data.directorio} />
        )}
        {active === 'log' && (
          <TabLog logs={data.logs} total={data.logsTotal} />
        )}
      </div>
    </div>
  )
}
