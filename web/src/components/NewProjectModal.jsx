import { useState } from 'react'
import { useProject } from '../hooks/useProject'
import { IconPlus, IconCross } from './Icons'

export function NewProjectModal({ onClose }) {
  const { createProject } = useProject()
  const [shipId, setShipId] = useState('')
  const [department, setDepartment] = useState('Piping')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createProject({ shipId, department, startDate, endDate })
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create vessel project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pm-modal-backdrop" onClick={onClose}>
      <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0 }}>New Vessel Project</h2>
          <button type="button" className="pm-btn tiny ghost icon-only" onClick={onClose}>
            <IconCross size={14} />
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label>
            Ship ID / Hull Number
            <input value={shipId} onChange={(e) => setShipId(e.target.value)} required placeholder="e.g. 985" />
          </label>
          <label>
            Engineering Department
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option>Piping</option>
              <option>Hull</option>
              <option>Machinery</option>
              <option>HVAC</option>
              <option>Outfitting</option>
            </select>
          </label>
          <label>
            Project Start Date
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            Target Delivery / Finish Date
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>

          {error ? <p className="error">{error}</p> : null}

          <div className="pm-modal-actions">
            <button type="button" className="pm-btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pm-btn primary" disabled={saving}>
              <IconPlus size={14} />
              <span>{saving ? 'Creating…' : 'Create Vessel'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
