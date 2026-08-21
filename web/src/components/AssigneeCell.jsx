import { useEffect, useRef, useState } from 'react'
import { UserAvatar } from './UserAvatar'

function shortName(person) {
  if (!person) return 'Unassigned'
  const raw = String(person.display_name || person.email?.split('@')[0] || '').trim()
  if (!raw) return 'Unassigned'
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].length > 14 ? `${parts[0].slice(0, 13)}…` : parts[0]
  // Vietnamese: given name is usually last token
  const given = parts[parts.length - 1]
  const initial = parts[0]?.[0] ? `${parts[0][0]}.` : ''
  const label = `${initial}${given}`
  return label.length > 14 ? `${label.slice(0, 13)}…` : label
}

/**
 * Compact assignee chip: avatar + short name.
 * Click name/avatar → view overview. Optional caret opens reassignment list.
 */
export function AssigneeCell({
  assigneeId,
  profiles = [],
  canAssign = false,
  onAssign,
  onView,
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const person = profiles.find((p) => p.id === assigneeId) || null
  const label = shortName(person)

  useEffect(() => {
    if (!open) return undefined
    function onDoc(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`assignee-cell ${open ? 'open' : ''}`} ref={wrapRef}>
      <div className="assignee-chip">
        <button
          type="button"
          className="assignee-chip-main"
          title={person ? `${person.display_name || person.email} — view profile` : 'Unassigned'}
          disabled={!person}
          onClick={() => person && onView?.(person)}
        >
          {person ? (
            <UserAvatar
              name={person.display_name || person.email || 'U'}
              avatarUrl={person.avatar_url}
              themeColor={person.theme_color || '#64748b'}
              size={22}
              rounded="full"
            />
          ) : (
            <span className="assignee-chip-empty" />
          )}
          <span className="assignee-chip-name">{label}</span>
        </button>

        {canAssign ? (
          <button
            type="button"
            className="assignee-chip-caret"
            title="Change assignee"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
          >
            ▾
          </button>
        ) : null}
      </div>

      {canAssign && open ? (
        <div className="assignee-menu" role="listbox">
          <button
            type="button"
            className={`assignee-menu-item ${!assigneeId ? 'active' : ''}`}
            onClick={() => {
              onAssign?.(null)
              setOpen(false)
            }}
          >
            <span className="assignee-chip-empty sm" />
            <span>Unassigned</span>
          </button>
          {profiles.map((p) => {
            const name = p.display_name || p.email || 'User'
            return (
              <button
                key={p.id}
                type="button"
                className={`assignee-menu-item ${assigneeId === p.id ? 'active' : ''}`}
                onClick={() => {
                  onAssign?.(p.id)
                  setOpen(false)
                }}
              >
                <UserAvatar
                  name={name}
                  avatarUrl={p.avatar_url}
                  themeColor={p.theme_color || '#64748b'}
                  size={22}
                  rounded="full"
                />
                <span className="assignee-menu-text">
                  <span className="assignee-menu-name">{name}</span>
                  {p.position ? <span className="assignee-menu-role">{p.position}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
