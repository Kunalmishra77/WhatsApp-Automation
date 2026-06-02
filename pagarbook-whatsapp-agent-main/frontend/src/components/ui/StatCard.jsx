export default function StatCard({ label, value, sub, color = '#6366f1', icon }) {
  return (
    <div className="bg-white rounded-2xl p-6"
      style={{ border: '1px solid #e8eaf0', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
          {label}
        </p>
        {icon && <span className="text-xl leading-none">{icon}</span>}
      </div>
      <p className="text-3xl font-black" style={{ color: '#1a1d2e' }}>{value ?? '—'}</p>
      {sub && <p className="text-xs mt-1 font-medium" style={{ color }}>{sub}</p>}
    </div>
  )
}
