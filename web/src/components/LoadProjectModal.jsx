import { useProject } from '../hooks/useProject'
import { IconVessel, IconCross } from './Icons'

export function LoadProjectModal({ onClose }) {
  const { projects, selectProject, loading, error } = useProject()

  return (
    <div className="pm-modal-backdrop" onClick={onClose}>
      <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0 }}>Select Vessel Project</h2>
          <button type="button" className="pm-btn tiny ghost icon-only" onClick={onClose}>
            <IconCross size={14} />
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {loading ? (
          <p className="muted">Loading vessels…</p>
        ) : projects.length === 0 ? (
          <p className="muted">No vessel projects found. Please create a new one.</p>
        ) : (
          <ul className="pm-project-pick">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={async () => {
                    await selectProject(p)
                    onClose()
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <IconVessel size={18} style={{ color: 'var(--primary)' }} />
                  <div>
                    <strong>Vessel {p.ship_id || p.name}</strong>
                    <div className="muted" style={{ fontSize: '11px' }}>
                      {p.department} · {p.status}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pm-modal-actions">
          <button type="button" className="pm-btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
