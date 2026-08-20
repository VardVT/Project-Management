import { useEffect } from 'react'
import { IconCross } from './Icons'

/**
 * Right slide-over panel — NO backdrop overlay.
 * Panel floats over content without dimming the background.
 * Closes on Escape key.
 */
export function RightDrawer({ isOpen, onClose, title = 'Filter & Search', subtitle, children, footer }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  return (
    <aside className={`pm-right-drawer ${isOpen ? 'pm-right-drawer--open' : ''}`}>
      <div className="pm-drawer-header">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted" style={{ margin: '2px 0 0', fontSize: '11px' }}>{subtitle}</p>}
        </div>
        <button
          type="button"
          className="pm-btn tiny ghost icon-only"
          onClick={onClose}
          title="Close panel (Esc)"
        >
          <IconCross size={16} />
        </button>
      </div>

      <div className="pm-drawer-body">
        {children}
      </div>

      {footer && (
        <div className="pm-drawer-footer">
          {footer}
        </div>
      )}
    </aside>
  )
}
