import { useMemo, useState } from 'react'
import {
  IconCross,
  IconRefresh,
  IconCheck,
  IconTask,
  IconReport,
  IconTable,
} from './Icons'

const GROUP_CONFIG = {
  '3D': {
    label: '3D Pipe Modeling',
    badgeClass: 'badge-3d',
    color: '#2563eb',
    icon: IconTask,
  },
  ISO: {
    label: 'ISO Generation',
    badgeClass: 'badge-iso',
    color: '#8b5cf6',
    icon: IconReport,
  },
  '2D': {
    label: '2D Drawings',
    badgeClass: 'badge-2d',
    color: '#ec4899',
    icon: IconTable,
  },
  MTO: {
    label: 'MTO Parts',
    badgeClass: 'badge-mto',
    color: '#059669',
    icon: IconTask,
  },
  Other: {
    label: 'Other Sheets',
    badgeClass: 'badge-other',
    color: '#64748b',
    icon: IconTable,
  },
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

  function handleSelectAll() {
    const all = new Set()
    for (const [, items] of grouped) {
      if (items.length > 0) {
        all.add(items[0].name)
      }
    }
    setSelected(all)
  }

  function handleClearAll() {
    setSelected(new Set())
  }

  const selectedCount = selected.size
  const selectedRows = (sheets || [])
    .filter((s) => selected.has(s.name))
    .reduce((sum, s) => sum + (s.rowCount || 0), 0)

  return (
    <div className="pm-modal-backdrop" onClick={onCancel}>
      <div
        className="pm-modal"
        style={{ width: 'min(100%, 540px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'var(--primary-subtle)',
                color: 'var(--primary)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                border: '1px solid var(--primary-border)',
              }}
            >
              <IconRefresh size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Select sheets to sync</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                {shipHint && (
                  <span
                    style={{
                      background: 'var(--ink-primary)',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-xs)',
                      letterSpacing: '0.03em',
                    }}
                  >
                    Vessel {shipHint}
                  </span>
                )}
                <span className="muted" style={{ fontSize: '12px' }} title={fileName}>
                  {fileName ? `· ${fileName}` : 'Progress workbook'}
                </span>
              </div>
            </div>
          </div>

          <button type="button" className="pm-btn tiny ghost icon-only" onClick={onCancel} title="Close">
            <IconCross size={16} />
          </button>
        </div>

        {/* Quick Help & Action Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            margin: '14px 0 10px',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            fontSize: '12px',
          }}
        >
          <span className="muted">Pick one sheet per discipline variant.</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="pm-btn tiny ghost"
              onClick={handleSelectAll}
              style={{ fontSize: '11.5px', padding: '2px 8px', height: '24px' }}
            >
              Select recommended
            </button>
            <button
              type="button"
              className="pm-btn tiny ghost"
              onClick={handleClearAll}
              style={{ fontSize: '11.5px', padding: '2px 8px', height: '24px', color: 'var(--danger)' }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Sheets Container List */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflowY: 'auto',
            maxHeight: '380px',
            paddingRight: '4px',
            margin: '4px 0',
          }}
        >
          {grouped.map(([group, items]) => {
            const multi = items.length > 1
            const groupInfo = GROUP_CONFIG[group] || GROUP_CONFIG.Other
            const GroupIcon = groupInfo.icon

            return (
              <div key={group} className="sync-picker-group">
                <div className="sync-picker-group-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ color: groupInfo.color, display: 'flex', alignItems: 'center' }}>
                      <GroupIcon size={14} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                      {groupInfo.label}
                    </span>
                    {multi && (
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 600,
                          color: 'var(--ink-muted)',
                          background: 'var(--bg-deep)',
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-xs)',
                        }}
                      >
                        choose 1
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {items.map((sheet) => {
                    const checked = selected.has(sheet.name)
                    return (
                      <label
                        key={sheet.name}
                        className={`sync-sheet-item ${checked ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInGroup(group, sheet.name, multi)}
                        />
                        <span style={{ flex: 1, fontSize: '13px', fontWeight: checked ? 700 : 500 }}>
                          {sheet.name}
                        </span>
                        <span className="sync-tag-count">
                          {sheet.rowCount?.toLocaleString() || 0} tasks
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer Actions */}
        <div className="pm-modal-actions">
          <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 600,
                color: selectedCount > 0 ? 'var(--primary)' : 'var(--ink-muted)',
                background: selectedCount > 0 ? 'var(--primary-subtle)' : 'var(--bg-deep)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                border: selectedCount > 0 ? '1px solid var(--primary-border)' : '1px solid transparent',
              }}
            >
              <IconCheck size={13} />
              {selectedCount} sheet{selectedCount === 1 ? '' : 's'} · {selectedRows.toLocaleString()} tasks
            </span>
          </div>

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

