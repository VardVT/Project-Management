import { useEffect, useMemo, useRef, useState } from 'react'
import { IconChevronDown, IconSearch } from './Icons'

function empSortKey(id) {
  if (id != null && /^\d+$/.test(String(id))) return Number(id)
  return Number.MAX_SAFE_INTEGER
}

export function EmailPicker({ users, value, onChange, required, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const sorted = useMemo(() => {
    return [...users].sort((a, b) => {
      const d = empSortKey(a.employeeId) - empSortKey(b.employeeId)
      if (d !== 0) return d
      return String(a.email).localeCompare(String(b.email))
    })
  }, [users])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((u) => {
      const hay = `${u.employeeId || ''} ${u.name || ''} ${u.email || ''} ${u.position || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [sorted, query])

  const selected = sorted.find((u) => u.email === value)

  useEffect(() => {
    function onDoc(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(user) {
    onChange(user.email)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="email-picker" ref={rootRef}>
      <button
        type="button"
        className={`email-picker-trigger ${open ? 'open' : ''}`}
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
      >
        {selected ? (
          <span className="email-picker-selected" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong className="emp-id">{selected.employeeId ? `#${selected.employeeId}` : '—'}</strong>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 600, fontSize: '12.5px' }}>{selected.name}</span>
              <span className="muted" style={{ fontSize: '11px' }}>{selected.email}</span>
            </span>
          </span>
        ) : (
          <span className="muted">Select engineer profile…</span>
        )}
        <IconChevronDown size={14} style={{ color: 'var(--ink-muted)' }} />
      </button>

      <input type="email" value={value} required={required} readOnly tabIndex={-1} className="email-picker-hidden" />

      {open && (
        <div className="email-picker-dropdown">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <IconSearch size={14} style={{ position: 'absolute', left: '8px', color: 'var(--ink-faint)' }} />
            <input
              ref={inputRef}
              className="email-picker-search"
              type="search"
              placeholder="Search by ID, name, email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              style={{ width: '100%', paddingLeft: '28px' }}
            />
          </div>
          <ul className="email-picker-list" role="listbox">
            {filtered.length === 0 ? (
              <li className="email-picker-empty" style={{ padding: '12px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                No engineer found
              </li>
            ) : (
              filtered.map((u) => (
                <li key={u.email}>
                  <button
                    type="button"
                    className={u.email === value ? 'active' : ''}
                    onClick={() => pick(u)}
                  >
                    <span className="emp-id">{u.employeeId ? `#${u.employeeId}` : '—'}</span>
                    <span className="emp-meta">
                      <strong>{u.name}</strong>
                      <span className="muted" style={{ fontSize: '11px' }}>{u.email}</span>
                    </span>
                    <span className="pill muted-pill">{u.position}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
