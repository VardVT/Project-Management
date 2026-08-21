import { useMemo, useState } from 'react'
import { IconCross, IconRefresh } from './Icons'

const GROUP_LABEL = {
  '3D': '3D Pipe Modeling',
  ISO: 'ISO Generation',
  '2D': '2D Drawings',
  MTO: 'MTO',
  Other: 'Other sheets',
}

export function SyncSheetPickerModal({
  fileName,
  shipHint,
  sheets,
  initialSelected,
  onCancel,
  onConfirm,
}) {
  const [selected, setSelected] = useState(() => new Set(initialSelected || []))

  const grouped = useMemo(() => {
    const map = new Map()
    for (const sheet of sheets || []) {
      if (!map.has(sheet.group)) map.set(sheet.group, [])
      map.get(sheet.group).push(sheet)
    }
    return [...map.entries()]
  }, [sheets])

  function toggleInGroup(group, name, multi) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
        return next
      }
      if (multi) {
        for (const sheet of sheets || []) {
          if (sheet.group === group) next.delete(sheet.name)
        }
      }
      next.add(name)
      return next
    })
  }

  const selectedCount = selected.size
  const selectedRows = (sheets || [])
    .filter((s) => selected.has(s.name))
    .reduce((sum, s) => sum + (s.rowCount || 0), 0)

  return (
    <div className="pm-modal-backdrop" onClick={onCancel}>
      <div className="pm-modal" style={{ width: 'min(100%, 520px)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0 }}>Select sheets to sync</h2>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: '12px' }}>
              {shipHint ? (
                <>
                  Vessel <strong>{shipHint}</strong>
                  {fileName ? ` · ${fileName}` : ''}
                </>
              ) : (
                fileName || 'Progress workbook'
              )}
            </p>
          </div>
          <button type="button" className="pm-btn tiny ghost icon-only" onClick={onCancel} title="Close">
            <IconCross size={14} />
          </button>
        </div>

        <p className="muted" style={{ margin: '12px 0 10px', fontSize: '12px', lineHeight: 1.45 }}>
          If a group has variants (ISO Braila / ISO VTT…), pick one. New Excel tasks not in the plan will be added.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '360px', overflowY: 'auto' }}>
          {grouped.map(([group, items]) => {
            const multi = items.length > 1
            return (
              <div
                key={group}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                  background: 'var(--surface-subtle)',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '8px' }}>
                  {GROUP_LABEL[group] || group}
                  {multi ? ' · pick one' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {items.map((sheet) => {
                    const checked = selected.has(sheet.name)
                    return (
                      <label
                        key={sheet.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: checked ? '1px solid var(--primary-border)' : '1px solid transparent',
                          background: checked ? 'var(--primary-subtle)' : 'var(--surface)',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInGroup(group, sheet.name, multi)}
                        />
                        <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>{sheet.name}</span>
                        <span className="muted" style={{ fontSize: '11.5px', fontVariantNumeric: 'tabular-nums' }}>
                          {sheet.rowCount} tasks
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="pm-modal-actions" style={{ marginTop: '16px' }}>
          <span className="muted" style={{ marginRight: 'auto', fontSize: '12px' }}>
            {selectedCount} sheet{selectedCount === 1 ? '' : 's'} · {selectedRows} tasks
          </span>
          <button type="button" className="pm-btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="pm-btn primary"
            disabled={selectedCount === 0}
            onClick={() => onConfirm([...selected])}
          >
            <IconRefresh size={14} />
            <span>Sync selected</span>
          </button>
        </div>
      </div>
    </div>
  )
}
