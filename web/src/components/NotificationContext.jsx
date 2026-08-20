import { createContext, useCallback, useContext, useState } from 'react'
import { IconCheck, IconCross, IconAlertTriangle } from './Icons'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [promptDialog, setPromptDialog] = useState(null)
  const [promptInput, setPromptInput] = useState('')

  // --- TOAST NOTIFICATIONS ---
  const addToast = useCallback((type, title, message, duration = 4500) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, type, title, message }])
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
    }
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = {
    success: (title, message, duration) => addToast('success', title, message, duration),
    error: (title, message, duration) => addToast('error', title, message, duration),
    info: (title, message, duration) => addToast('info', title, message, duration),
    warning: (title, message, duration) => addToast('warning', title, message, duration),
  }

  // --- CONFIRM MODAL ---
  const confirm = useCallback(({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false }) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        title: title || 'Are you sure?',
        message: message || '',
        confirmText,
        cancelText,
        isDanger,
        onConfirm: () => {
          setConfirmDialog(null)
          resolve(true)
        },
        onCancel: () => {
          setConfirmDialog(null)
          resolve(false)
        },
      })
    })
  }, [])

  // --- PROMPT MODAL ---
  const prompt = useCallback(({ title, message, defaultValue = '', placeholder = '', confirmText = 'Submit', cancelText = 'Cancel' }) => {
    return new Promise((resolve) => {
      setPromptInput(defaultValue)
      setPromptDialog({
        title: title || 'Input required',
        message: message || '',
        placeholder,
        confirmText,
        cancelText,
        onConfirm: (val) => {
          setPromptDialog(null)
          resolve(val)
        },
        onCancel: () => {
          setPromptDialog(null)
          resolve(null)
        },
      })
    })
  }, [])

  return (
    <NotificationContext.Provider value={{ toast, confirm, prompt }}>
      {children}

      {/* TOASTS CONTAINER */}
      <div className="pm-toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`pm-toast pm-toast-${t.type}`}>
            <div className="pm-toast-icon">
              {t.type === 'success' && <IconCheck size={16} />}
              {t.type === 'error' && <IconCross size={16} />}
              {t.type === 'warning' && <IconAlertTriangle size={16} />}
              {t.type === 'info' && <span style={{ fontSize: '14px', fontWeight: 700 }}>ℹ</span>}
            </div>
            <div className="pm-toast-content">
              <div className="pm-toast-title">{t.title}</div>
              {t.message && <div className="pm-toast-msg">{t.message}</div>}
            </div>
            <button
              type="button"
              className="pm-toast-close"
              onClick={() => removeToast(t.id)}
              title="Dismiss"
            >
              <IconCross size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* CONFIRM DIALOG */}
      {confirmDialog && (
        <div className="pm-modal-backdrop" onClick={confirmDialog.onCancel}>
          <div className="pm-modal pm-dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div className={`pm-dialog-icon ${confirmDialog.isDanger ? 'danger' : 'primary'}`}>
                {confirmDialog.isDanger ? <IconAlertTriangle size={18} /> : <IconCheck size={18} />}
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{confirmDialog.title}</h3>
            </div>
            <p className="pm-dialog-message">{confirmDialog.message}</p>
            <div className="pm-modal-actions" style={{ marginTop: '20px' }}>
              <button type="button" className="pm-btn ghost" onClick={confirmDialog.onCancel}>
                {confirmDialog.cancelText}
              </button>
              <button
                type="button"
                className={`pm-btn ${confirmDialog.isDanger ? 'danger' : 'primary'}`}
                onClick={confirmDialog.onConfirm}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROMPT DIALOG */}
      {promptDialog && (
        <div className="pm-modal-backdrop" onClick={promptDialog.onCancel}>
          <div className="pm-modal pm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 700 }}>{promptDialog.title}</h3>
            <p className="pm-dialog-message">{promptDialog.message}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                promptDialog.onConfirm(promptInput)
              }}
              style={{ marginTop: '12px' }}
            >
              <input
                autoFocus
                value={promptInput}
                placeholder={promptDialog.placeholder}
                onChange={(e) => setPromptInput(e.target.value)}
                style={{ width: '100%', marginBottom: '16px' }}
              />
              <div className="pm-modal-actions">
                <button type="button" className="pm-btn ghost" onClick={promptDialog.onCancel}>
                  {promptDialog.cancelText}
                </button>
                <button type="submit" className="pm-btn primary">
                  {promptDialog.confirmText}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const ctx = useContext(NotificationContext)
  if (!ctx) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return ctx
}
