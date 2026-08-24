import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { UserAvatar } from './UserAvatar'

const MENU_WIDTH = 240
const MENU_MAX_HEIGHT = 260
const GAP = 4

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

function computeMenuStyle(anchorEl) {
  if (!anchorEl) return null
  const rect = anchorEl.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  const spaceBelow = vh - rect.bottom - GAP
  const spaceAbove = rect.top - GAP
  const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 160) && spaceAbove > spaceBelow

  let left = rect.left
  if (left + MENU_WIDTH > vw - 8) left = Math.max(8, vw - MENU_WIDTH - 8)
  if (left < 8) left = 8

  const maxHeight = Math.min(MENU_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow, vh - 16)

  if (openUp) {
    return {
      position: 'fixed',
      left,
      bottom: vh - rect.top + GAP,
      top: 'auto',
      width: MENU_WIDTH,
      maxHeight: Math.max(120, maxHeight),
      zIndex: 10050,
    }
  }

  return {
    position: 'fixed',
    left,
    top: rect.bottom + GAP,
    bottom: 'auto',
    width: MENU_WIDTH,
    maxHeight: Math.max(120, maxHeight),
    zIndex: 10050,
  }
}

/**
 * Compact assignee chip: avatar + short name.
 * Click name/avatar → view overview. Optional caret opens reassignment list.
 * Menu is portaled to body so it is not clipped by table overflow.
 */
export function AssigneeCell({
  assigneeId,
  profiles = [],
  canAssign = false,
  onAssign,
  onView,
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const wrapRef = useRef(null)
  const menuRef = useRef(null)
  const person = profiles.find((p) => p.id === assigneeId) || null
  const label = shortName(person)

  const updatePosition = useCallback(() => {
    if (!wrapRef.current) return
    setMenuStyle(computeMenuStyle(wrapRef.current))
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null)
      return undefined
    }
    updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return undefined

    function onDoc(e) {
      const t = e.target
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onReposition() {
      updatePosition()
    }
    // Close on any scroll that isn't inside the menu itself (table scroll clips otherwise)
    function onScroll(e) {
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, updatePosition])

  const menu =
    canAssign && open && menuStyle
      ? createPortal(
          <div className="assignee-menu assignee-menu-portal" role="listbox" ref={menuRef} style={menuStyle}>
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
          </div>,
          document.body,
        )
      : null

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

      {menu}
    </div>
  )
}
