import { useEffect, useState } from 'react'
import { useAuth, DEFAULT_TEMP_PASSWORD } from '../hooks/useAuth'
import { IconCross, IconSave, IconUsers, IconCheck } from './Icons'

const COLOR_PRESETS = [
  '#2563eb', // Blue
  '#0d9488', // Teal
  '#7c3aed', // Purple
  '#db2777', // Pink
  '#ea580c', // Orange
  '#ca8a04', // Amber
  '#059669', // Emerald
  '#dc2626', // Red
  '#0284c7', // Sky
  '#475569', // Slate
  '#0f172a', // Dark Navy
]

export function ProfileModal({ onClose }) {
  const { profile, user, caps, updateProfile, changePassword } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [employeeId, setEmployeeId] = useState(profile?.employee_id || '')
  const [themeColor, setThemeColor] = useState(profile?.theme_color || '#2563eb')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const [activeTab, setActiveTab] = useState('profile') // 'profile' | 'security'
  const [showPwText, setShowPwText] = useState(false)
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
      setOkMsg('Profile updated successfully!')
      setTimeout(() => setOkMsg(''), 3000)
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
      setOkMsg('Password changed successfully!')
      setTimeout(() => setOkMsg(''), 3000)
    } catch (err) {
      setError(err?.message || 'Could not update password.')
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="pm-modal-backdrop" onClick={onClose}>
      <div className="pm-modal profile-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Personal Profile</h2>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '12px' }}>
              Manage your identity, theme color, and security preferences
            </p>
          </div>
          <button type="button" className="pm-btn tiny ghost icon-only" onClick={onClose} title="Close">
            <IconCross size={16} />
          </button>
        </div>

        {/* Hero User Banner */}
        <div className="profile-modal-hero">
          <div
            className="profile-modal-avatar"
            style={{
              background: themeColor,
              boxShadow: `0 8px 20px -4px ${themeColor}66`,
            }}
          >
            {initial}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--ink-primary)' }}>
              {displayName || 'Your name'}
            </div>
            <div className="muted" style={{ fontSize: '12px', marginTop: '2px', wordBreak: 'break-all' }}>
              {user?.email || profile?.email || '—'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
              <span className={`pm-role-badge role-${caps.shell}`} style={{ display: 'inline-flex' }}>
                {caps.label || profile?.position || 'Engineer'}
              </span>
              {employeeId && (
                <span
                  style={{
                    fontSize: '11px',
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--ink-muted)',
                    background: 'var(--bg)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border)',
                  }}
                >
                  ID: #{employeeId}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            marginBottom: '16px',
            gap: '16px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab('profile')
              setError('')
              setOkMsg('')
            }}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '8px 4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'profile' ? 700 : 500,
              fontSize: '13px',
              color: activeTab === 'profile' ? 'var(--primary)' : 'var(--ink-muted)',
              borderBottom: activeTab === 'profile' ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: '-1px',
              transition: 'all 0.15s ease',
            }}
          >
            Profile Info
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('security')
              setError('')
              setOkMsg('')
            }}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '8px 4px',
              cursor: 'pointer',
              fontWeight: activeTab === 'security' ? 700 : 500,
              fontSize: '13px',
              color: activeTab === 'security' ? 'var(--primary)' : 'var(--ink-muted)',
              borderBottom: activeTab === 'security' ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: '-1px',
              transition: 'all 0.15s ease',
            }}
          >
            Security & Password
          </button>
        </div>

        {/* Tab 1: Profile Info */}
        {activeTab === 'profile' && (
          <form onSubmit={onSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', fontWeight: 600 }}>
              <span>Display Name <strong style={{ color: 'var(--danger)' }}>*</strong></span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. John Doe"
                required
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  outline: 'none',
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', fontWeight: 600 }}>
              <span>Employee ID / Badge No.</span>
              <input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g. 2107"
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  outline: 'none',
                }}
              />
            </label>

            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Avatar Theme Color</span>
                <span style={{ fontSize: '11px', color: 'var(--ink-muted)', fontFamily: 'var(--font-mono)' }}>
                  {themeColor}
                </span>
              </div>
              <div className="profile-color-grid">
                {COLOR_PRESETS.map((c) => {
                  const isActive = themeColor.toLowerCase() === c.toLowerCase()
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`profile-color-swatch ${isActive ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setThemeColor(c)}
                      title={c}
                    >
                      {isActive && (
                        <div style={{ color: '#fff', display: 'grid', placeItems: 'center', height: '100%' }}>
                          <IconCheck size={14} />
                        </div>
                      )}
                    </button>
                  )
                })}
                <label className="profile-color-custom" title="Custom color">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(themeColor) ? themeColor : '#2563eb'}
                    onChange={(e) => setThemeColor(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="pm-modal-actions">
              <button type="button" className="pm-btn ghost" onClick={onClose}>
                Close
              </button>
              <button type="submit" className="pm-btn primary" disabled={saving}>
                <IconSave size={14} />
                <span>{saving ? 'Saving…' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Security & Password */}
        {activeTab === 'security' && (
          <form onSubmit={onSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', fontWeight: 600 }}>
              <span>New Password</span>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showPwText ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 36px 8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwText(!showPwText)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '11px',
                    color: 'var(--ink-muted)',
                  }}
                >
                  {showPwText ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', fontWeight: 600 }}>
              <span>Confirm Password</span>
              <input
                type={showPwText ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Re-enter your new password"
                minLength={6}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  outline: 'none',
                }}
              />
            </label>

            <div className="pm-modal-actions">
              <button type="button" className="pm-btn ghost" onClick={onClose} disabled={pwBusy}>
                Cancel
              </button>
              <button type="submit" className="pm-btn primary" disabled={pwBusy || !newPw}>
                {pwBusy ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        )}

        {/* Feedback Alerts */}
        {error ? (
          <div
            style={{
              marginTop: '14px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-subtle)',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger)',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        ) : null}

        {okMsg ? (
          <div
            style={{
              marginTop: '14px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--success-subtle)',
              border: '1px solid var(--success-border)',
              color: 'var(--success)',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            ✓ {okMsg}
          </div>
        ) : null}
      </div>
    </div>
  )
}

