import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth, DEFAULT_TEMP_PASSWORD } from '../hooks/useAuth'
import { normalizeRole, ROLES } from '../lib/roles'
import { UserAvatar } from './UserAvatar'
import {
  IconCross,
  IconSave,
  IconCheck,
  IconMail,
  IconBriefcase,
  IconBuilding,
  IconMapPin,
  IconBadge,
  IconClock,
  IconUsers,
} from './Icons'

const COLOR_PRESETS = [
  '#2563eb',
  '#0d9488',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#ca8a04',
  '#059669',
  '#dc2626',
  '#0284c7',
  '#475569',
  '#0f172a',
]

const COMPANY = 'Vard Vung Tau Ltd'
const WORK_LOCATION = 'Vung Tau'
const DEPARTMENT = 'Engineering Department'

function formatLocalTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function ContactRow({ icon, label, value }) {
  if (!value) return null
  return (
    <div className="profile-contact-row">
      <div className="profile-contact-icon">{icon}</div>
      <div className="profile-contact-body">
        <div className="profile-contact-label">{label}</div>
        <div className="profile-contact-value">{value}</div>
      </div>
    </div>
  )
}

function PersonChip({ person }) {
  const name = person.display_name || person.email || 'User'
  return (
    <div className="profile-org-chip" title={person.email || name}>
      <UserAvatar
        name={name}
        avatarUrl={person.avatar_url}
        themeColor={person.theme_color || '#64748b'}
        size={36}
        rounded="full"
        className="profile-org-avatar"
      />
      <div className="profile-org-meta">
        <div className="profile-org-name">{name}</div>
        <div className="profile-org-role">{person.position || 'Engineer'}</div>
      </div>
    </div>
  )
}

export function ProfileModal({ onClose }) {
  const { profile, user, caps, updateProfile, changePassword, uploadAvatar, removeAvatar } = useAuth()
  const fileRef = useRef(null)
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [employeeId, setEmployeeId] = useState(profile?.employee_id || '')
  const [themeColor, setThemeColor] = useState(profile?.theme_color || '#2563eb')
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [showPwText, setShowPwText] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [team, setTeam] = useState([])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    setDisplayName(profile?.display_name || '')
    setEmployeeId(profile?.employee_id || '')
    setThemeColor(profile?.theme_color || '#2563eb')
  }, [profile])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadTeam() {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, email, position, theme_color, employee_id, avatar_url')
        .order('display_name', { ascending: true })
      if (!mounted) return
      setTeam((data || []).filter((p) => p.id !== profile?.id))
    }
    loadTeam()
    return () => {
      mounted = false
    }
  }, [profile?.id])

  const email = user?.email || profile?.email || ''
  const jobTitle = caps.label || profile?.position || 'Engineer'
  const avatarUrl = profile?.avatar_url || null

  const managers = useMemo(
    () =>
      team.filter((p) => {
        const r = normalizeRole(p.position)
        return r === ROLES.MANAGER || r === ROLES.ADMIN
      }),
    [team],
  )
  const colleagues = useMemo(
    () => team.filter((p) => !managers.some((m) => m.id === p.id)),
    [team, managers],
  )
  const colleaguesPreview = colleagues.slice(0, 8)

  function switchTab(tab) {
    setActiveTab(tab)
    setError('')
    setOkMsg('')
  }

  async function onPickAvatar(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setOkMsg('')
    setAvatarBusy(true)
    try {
      await uploadAvatar(file)
      setOkMsg('Photo updated.')
      setTimeout(() => setOkMsg(''), 3000)
    } catch (err) {
      setError(err?.message || 'Could not upload photo.')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function onRemoveAvatar() {
    setError('')
    setOkMsg('')
    setAvatarBusy(true)
    try {
      await removeAvatar()
      setOkMsg('Photo removed.')
      setTimeout(() => setOkMsg(''), 3000)
    } catch (err) {
      setError(err?.message || 'Could not remove photo.')
    } finally {
      setAvatarBusy(false)
    }
  }

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
      setOkMsg('Profile updated successfully.')
      setTimeout(() => setOkMsg(''), 3000)
      setActiveTab('overview')
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
      setOkMsg('Password changed successfully.')
      setTimeout(() => setOkMsg(''), 3000)
    } catch (err) {
      setError(err?.message || 'Could not update password.')
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="pm-modal-backdrop" onClick={onClose}>
      <div className="pm-modal profile-card-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="profile-card-close" onClick={onClose} title="Close">
          <IconCross size={16} />
        </button>

        <div className="profile-card-header">
          <button
            type="button"
            className="profile-card-avatar-btn"
            onClick={() => {
              switchTab('profile')
              setTimeout(() => fileRef.current?.click(), 50)
            }}
            title="Change photo"
            disabled={avatarBusy}
          >
            <UserAvatar
              name={displayName || email || 'U'}
              avatarUrl={avatarUrl}
              themeColor={themeColor}
              size={72}
              rounded="full"
              className="profile-card-avatar"
              status="available"
            />
          </button>
          <div className="profile-card-identity">
            <h2>{displayName || 'Your name'}</h2>
            <p>
              {jobTitle}
              <span className="dot">·</span>
              {DEPARTMENT}
            </p>
            {employeeId ? <p className="profile-card-id">Employee #{employeeId}</p> : null}
          </div>
        </div>

        <div className="profile-card-tabs">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'profile', label: 'Profile' },
            { id: 'organization', label: 'Organization' },
            { id: 'security', label: 'Security' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`profile-card-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => switchTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="profile-card-body">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={onPickAvatar}
          />

          {activeTab === 'overview' && (
            <>
              <div className="profile-availability">
                <div className="profile-availability-row">
                  <span className="profile-availability-dot" />
                  <strong>Available</strong>
                  <span className="muted">· Signed in</span>
                </div>
                <div className="profile-availability-row muted">
                  <IconClock size={14} />
                  <span>{formatLocalTime(now)} — your local time</span>
                </div>
              </div>

              <h3 className="profile-section-title">Contact information</h3>
              <div className="profile-contact-grid">
                <ContactRow icon={<IconMail size={15} />} label="Email" value={email} />
                <ContactRow icon={<IconBadge size={15} />} label="Employee ID" value={employeeId ? `#${employeeId}` : '—'} />
                <ContactRow icon={<IconMapPin size={15} />} label="Work location" value={WORK_LOCATION} />
                <ContactRow icon={<IconBuilding size={15} />} label="Company" value={COMPANY} />
                <ContactRow icon={<IconBriefcase size={15} />} label="Job title" value={jobTitle} />
                <ContactRow icon={<IconUsers size={15} />} label="Department" value={DEPARTMENT} />
              </div>

              {(managers.length > 0 || colleaguesPreview.length > 0) && (
                <>
                  <h3 className="profile-section-title">Organization</h3>
                  {managers[0] && (
                    <div className="profile-org-block">
                      <div className="profile-org-label">Manager</div>
                      <PersonChip person={managers[0]} />
                    </div>
                  )}
                  {colleaguesPreview.length > 0 && (
                    <div className="profile-org-block">
                      <div className="profile-org-label">You work with</div>
                      <div className="profile-org-grid">
                        {colleaguesPreview.map((p) => (
                          <PersonChip key={p.id} person={p} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {activeTab === 'profile' && (
            <form onSubmit={onSaveProfile} className="profile-edit-form">
              <div className="profile-photo-editor">
                <UserAvatar
                  name={displayName || email || 'U'}
                  avatarUrl={avatarUrl}
                  themeColor={themeColor}
                  size={64}
                  rounded="full"
                />
                <div className="profile-photo-actions">
                  <div className="profile-photo-title">Profile photo</div>
                  <p className="muted" style={{ margin: 0, fontSize: '12px', lineHeight: 1.4 }}>
                    Any photo · auto-resized for avatar
                  </p>
                  <div className="profile-photo-btns">
                    <button
                      type="button"
                      className="pm-btn tiny"
                      disabled={avatarBusy}
                      onClick={() => fileRef.current?.click()}
                    >
                      {avatarBusy ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
                    </button>
                    {avatarUrl ? (
                      <button
                        type="button"
                        className="pm-btn tiny ghost"
                        disabled={avatarBusy}
                        onClick={onRemoveAvatar}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <label>
                Display name
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required placeholder="Your name" />
              </label>
              <label>
                Employee ID
                <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="e.g. 2107" />
              </label>
              <div>
                <div className="profile-edit-label-row">
                  <span>Fallback avatar color</span>
                  <code>{themeColor}</code>
                </div>
                <p className="muted" style={{ margin: '0 0 8px', fontSize: '11.5px' }}>
                  Used when no photo is set
                </p>
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
                        {isActive ? (
                          <span style={{ color: '#fff', display: 'grid', placeItems: 'center', height: '100%' }}>
                            <IconCheck size={13} />
                          </span>
                        ) : null}
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
              <div className="pm-modal-actions" style={{ marginTop: 8, paddingTop: 12 }}>
                <button type="button" className="pm-btn ghost" onClick={() => switchTab('overview')}>
                  Cancel
                </button>
                <button type="submit" className="pm-btn primary" disabled={saving}>
                  <IconSave size={14} />
                  <span>{saving ? 'Saving…' : 'Save changes'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'organization' && (
            <div>
              <p className="muted" style={{ fontSize: '12.5px', margin: '0 0 14px', lineHeight: 1.45 }}>
                People in the engineering directory. Manager roles are listed first.
              </p>
              {managers.length > 0 && (
                <div className="profile-org-block">
                  <div className="profile-org-label">Managers</div>
                  <div className="profile-org-grid">
                    {managers.map((p) => (
                      <PersonChip key={p.id} person={p} />
                    ))}
                  </div>
                </div>
              )}
              <div className="profile-org-block">
                <div className="profile-org-label">Team</div>
                <div className="profile-org-grid">
                  {colleagues.length === 0 ? (
                    <p className="muted" style={{ fontSize: '12px' }}>No other users found.</p>
                  ) : (
                    colleagues.map((p) => <PersonChip key={p.id} person={p} />)
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <form onSubmit={onSavePassword} className="profile-edit-form">
              <p className="muted" style={{ fontSize: '12.5px', margin: 0, lineHeight: 1.45 }}>
                Choose a password different from the temporary <code>{DEFAULT_TEMP_PASSWORD}</code>.
              </p>
              <label>
                New password
                <div className="profile-pw-wrap">
                  <input
                    type={showPwText ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="At least 6 characters"
                    minLength={6}
                    required
                  />
                  <button type="button" className="profile-pw-toggle" onClick={() => setShowPwText((v) => !v)}>
                    {showPwText ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <label>
                Confirm password
                <input
                  type={showPwText ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Re-enter password"
                  minLength={6}
                  required
                />
              </label>
              <div className="pm-modal-actions" style={{ marginTop: 8, paddingTop: 12 }}>
                <button type="button" className="pm-btn ghost" onClick={() => switchTab('overview')} disabled={pwBusy}>
                  Cancel
                </button>
                <button type="submit" className="pm-btn primary" disabled={pwBusy || !newPw}>
                  {pwBusy ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          )}

          {error ? <div className="profile-alert danger">{error}</div> : null}
          {okMsg ? <div className="profile-alert success">✓ {okMsg}</div> : null}
        </div>
      </div>
    </div>
  )
}
