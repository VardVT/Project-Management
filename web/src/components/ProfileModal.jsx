import { useEffect, useState } from 'react'
import { useAuth, DEFAULT_TEMP_PASSWORD } from '../hooks/useAuth'
import { IconCross, IconSave } from './Icons'

const COLOR_PRESETS = [
  '#2563eb',
  '#0d9488',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#ca8a04',
  '#059669',
  '#dc2626',
  '#475569',
  '#0f172a',
]

export function ProfileModal({ onClose }) {
  const { profile, user, caps, updateProfile, changePassword } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [employeeId, setEmployeeId] = useState(profile?.employee_id || '')
  const [themeColor, setThemeColor] = useState(profile?.theme_color || '#2563eb')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const [showPw, setShowPw] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)

  useEffect(() => {
    setDisplayName(profile?.display_name || '')
    setEmployeeId(profile?.employee_id || '')
    setThemeColor(profile?.theme_color || '#2563eb')
  }, [profile])

  const initial = (displayName || user?.email || 'U').trim().slice(0, 1).toUpperCase()

  async function onSaveProfile(e) {
    e.preventDefault()
    setError('')
    setOkMsg('')
    if (!displayName.trim()) {
      setError('Display name is required.')
      return
    }
    setSaving(true)
    try {
      await updateProfile({
        display_name: displayName.trim(),
        employee_id: employeeId.trim(),
        theme_color: themeColor,
      })
      setOkMsg('Profile saved.')
    } catch (err) {
      setError(err?.message || 'Could not save profile.')
    } finally {
      setSaving(false)
    }
  }

  async function onSavePassword(e) {
    e.preventDefault()
    setError('')
    setOkMsg('')
    if (newPw.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (newPw.toLowerCase() === DEFAULT_TEMP_PASSWORD.toLowerCase()) {
      setError(`Please choose a password other than ${DEFAULT_TEMP_PASSWORD}.`)
      return
    }
    if (newPw !== confirmPw) {
      setError('Password confirmation does not match.')
      return
    }
    setPwBusy(true)
    try {
      await changePassword(newPw)
      setNewPw('')
      setConfirmPw('')
      setShowPw(false)
      setOkMsg('Password updated.')
    } catch (err) {
      setError(err?.message || 'Could not update password.')
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="pm-modal-backdrop" onClick={onClose}>
      <div className="pm-modal profile-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0 }}>Personal profile</h2>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '12px' }}>
              Customize how you appear in the app
            </p>
          </div>
          <button type="button" className="pm-btn tiny ghost icon-only" onClick={onClose} title="Close">
            <IconCross size={14} />
          </button>
        </div>

        <div className="profile-modal-hero">
          <div className="profile-modal-avatar" style={{ background: themeColor }}>
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>{displayName || 'Your name'}</div>
            <div className="muted" style={{ fontSize: '12px', marginTop: '2px' }}>
              {user?.email || profile?.email || '—'}
            </div>
            <span className={`pm-role-badge role-${caps.shell}`} style={{ marginTop: '8px', display: 'inline-flex' }}>
              {caps.label || profile?.position || 'Engineer'}
            </span>
          </div>
        </div>

        <form onSubmit={onSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label>
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              required
              style={{ marginTop: '4px', width: '100%' }}
            />
          </label>

          <label>
            Employee ID
            <input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g. 2107"
              style={{ marginTop: '4px', width: '100%' }}
            />
          </label>

          <div>
            <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '6px' }}>Avatar color</div>
            <div className="profile-color-grid">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`profile-color-swatch ${themeColor.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setThemeColor(c)}
                  title={c}
                />
              ))}
              <label className="profile-color-custom" title="Custom color">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(themeColor) ? themeColor : '#2563eb'}
                  onChange={(e) => setThemeColor(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="pm-modal-actions" style={{ marginTop: '4px' }}>
            <button type="button" className="pm-btn ghost" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="pm-btn primary" disabled={saving}>
              <IconSave size={14} />
              <span>{saving ? 'Saving…' : 'Save profile'}</span>
            </button>
          </div>
        </form>

        <div className="profile-modal-divider" />

        {!showPw ? (
          <button type="button" className="pm-btn secondary" style={{ width: '100%' }} onClick={() => setShowPw(true)}>
            Change password
          </button>
        ) : (
          <form onSubmit={onSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                minLength={6}
                required
                style={{ marginTop: '4px', width: '100%' }}
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                minLength={6}
                required
                style={{ marginTop: '4px', width: '100%' }}
              />
            </label>
            <div className="pm-modal-actions">
              <button type="button" className="pm-btn ghost" onClick={() => setShowPw(false)} disabled={pwBusy}>
                Cancel
              </button>
              <button type="submit" className="pm-btn primary" disabled={pwBusy}>
                {pwBusy ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        )}

        {error ? <p className="error" style={{ marginTop: '12px' }}>{error}</p> : null}
        {okMsg ? <p className="muted" style={{ marginTop: '12px', color: 'var(--success)' }}>{okMsg}</p> : null}
      </div>
    </div>
  )
}
