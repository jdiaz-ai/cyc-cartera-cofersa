'use client'

interface Props {
  label:   string
  valor:   string | number
  sub?:    string
  color:   string
  icon?:   React.ReactNode
  muted?:  boolean
}

export default function KPICardAnalisis({ label, valor, sub, color, icon, muted }: Props) {
  const displayColor = muted ? '#94a3b8' : color
  return (
    <div
      className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col items-center text-center"
      style={{ borderTop: `3px solid ${displayColor}` }}
    >
      {icon && (
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 flex-shrink-0"
          style={{ background: `${displayColor}18` }}
        >
          <span style={{ color: displayColor }}>{icon}</span>
        </div>
      )}
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 leading-none">
        {label}
      </p>
      <p
        className="font-black tabular-nums leading-tight"
        style={{ fontSize: '1.6rem', color: muted ? '#94a3b8' : '#1e293b' }}
      >
        {valor}
      </p>
      {sub && (
        <p className="text-[11px] text-gray-400 mt-1 leading-snug">{sub}</p>
      )}
    </div>
  )
}
