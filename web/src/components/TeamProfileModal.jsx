import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { prepareAvatarFile } from '../lib/avatarImage'
import { getRoleLabel, normalizeRole, ROLES } from '../lib/roles'
import { UserAvatar } from './UserAvatar'
import { useNotification } from './NotificationContext'
import {
  IconCross,
  IconMail,
  IconBriefcase,
  IconBuilding,
  IconMapPin,
  IconBadge,
  IconClock,
  IconUsers,
  IconCamera,
  IconTrash,
} from './Icons'

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

function PersonChip({ person, onClick }) {
  const name = person.display_name || person.email || 'User'
  return (
    <button
      type="button"
      className="profile-org-chip clickable"
      title={`View ${name}`}
      onClick={() => onClick?.(person)}
    >
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
    </button>
  )
}

/** Teams-style overview for a team member with direct Avatar upload support */
export function TeamProfileModal({ person, onClose, onPersonUpdated }) {
  const { caps, profile: currentAuthProfile } = useAuth()
  const { toast } = useNotification()
  const [currentPerson, setCurrentPerson] = useState(person)
  const [team, setTeam] = useState([])
  const [now, setNow] = useState(() => new Date())
  const [avatarBusy, setAvatarBusy] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setCurrentPerson(person)
  }, [person])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadTeam() {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, email, position, theme_color, avatar_url, app_access, employee_id')
        .order('display_name', { ascending: true })
      if (!mounted) return
      setTeam((data || []).filter((p) => p.id !== currentPerson?.id))
    }
    loadTeam()
    return () => {
      mounted = false
    }
  }, [currentPerson?.id])

  const canEditAvatar = caps.canManageUsers || currentAuthProfile?.id === currentPerson?.id

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !currentPerson?.id) return

    setAvatarBusy(true)
    try {
      const prepared = await prepareAvatarFile(file)
      const targetUserId = currentPerson.id
      const path = `${targetUserId}/avatar.jpg`

      // 1. Upload to Supabase avatars bucket
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, prepared, {
        upsert: true,
        contentType: 'image/jpeg',
      })
      if (upErr) throw upErr

      // 2. Get public URL
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      const newAvatarUrl = `${pub.publicUrl}?t=${Date.now()}`

      // 3. Update profiles table
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl })
        .eq('id', targetUserId)
      if (dbErr) throw dbErr

      setCurrentPerson((prev) => ({ ...prev, avatar_url: newAvatarUrl }))
      if (onPersonUpdated) onPersonUpdated({ ...currentPerson, avatar_url: newAvatarUrl })
      toast.success('Avatar updated', `Profile photo updated for ${currentPerson.display_name || currentPerson.email}.`)
    } catch (err) {
      toast.error('Upload failed', err?.message || 'Could not update profile photo.')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function handleRemoveAvatar() {
    if (!currentPerson?.id) return
    setAvatarBusy(true)
    try {
      const targetUserId = currentPerson.id
      const { data: existing } = await supabase.storage.from('avatars').list(targetUserId)
      if (existing && existing.length > 0) {
        await supabase.storage
          .from('avatars')
          .remove(existing.map((f) => `${targetUserId}/${f.name}`))
      }
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', targetUserId)
      if (dbErr) throw dbErr

      setCurrentPerson((prev) => ({ ...prev, avatar_url: null }))
      if (onPersonUpdated) onPersonUpdated({ ...currentPerson, avatar_url: null })
      toast.success('Avatar removed', 'Profile photo has been reset to default initial.')
    } catch (err) {
      toast.error('Failed', err?.message || 'Could not remove profile photo.')
    } finally {
      setAvatarBusy(false)
    }
  }

  const name = currentPerson?.display_name || currentPerson?.email || 'User'
  const jobTitle = getRoleLabel(normalizeRole(currentPerson?.position)) || currentPerson?.position || 'Engineer'
  const email = currentPerson?.email || '—'
  const employeeId = currentPerson?.employee_id || ''
  const accessOn = currentPerson?.app_access !== false
  const avatarUrl = currentPerson?.avatar_url || null

  const managers = useMemo(
    () =>
      team.filter((p) => {
        const r = normalizeRole(p.position)
        return r === ROLES.MANAGER || r === ROLES.ADMIN
      }),
    [team],
  )
  const colleagues = useMemo(
    () => team.filter((p) => !managers.some((m) => m.id === p.id)).slice(0, 8),
    [team, managers],
  )

  if (!currentPerson) return null

  return (
    <div className="pm-modal-backdrop" onClick={onClose}>
      <div className="pm-modal profile-card-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="profile-card-close" onClick={onClose} title="Close">
          <IconCross size={16} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={handleAvatarFile}
        />

        <div className="profile-card-header">
          <div className="profile-avatar-interactive-wrap">
            <UserAvatar
              name={name}
              avatarUrl={avatarUrl}
              themeColor={currentPerson.theme_color || '#2563eb'}
              size={76}
              rounded="full"
              className="profile-card-avatar"
              status={accessOn ? 'available' : undefined}
            />

            {canEditAvatar && (
              <div
                className={`profile-avatar-overlay ${avatarBusy ? 'busy' : ''}`}
                onClick={() => !avatarBusy && fileInputRef.current?.click()}
                title="Click to upload profile photo"
              >
                <IconCamera size={20} />
                <span className="profile-avatar-overlay-text">
                  {avatarBusy ? 'Saving…' : 'Change'}
                </span>
              </div>
            )}
          </div>

          <div className="profile-card-identity">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h2>{name}</h2>
              {canEditAvatar && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="pm-btn tiny secondary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarBusy}
                    title="Upload new photo"
                  >
                    <IconCamera size={13} />
                    <span>{avatarBusy ? 'Saving…' : avatarUrl ? 'Change photo' : 'Upload photo'}</span>
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      className="pm-btn tiny ghost icon-only danger"
                      onClick={handleRemoveAvatar}
                      disabled={avatarBusy}
                      title="Remove custom photo"
                    >
                      <IconTrash size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
            <p>
              {jobTitle}
              <span className="dot">·</span>
              {DEPARTMENT}
            </p>
            {employeeId ? <p className="profile-card-id">Employee #{employeeId}</p> : null}
          </div>
        </div>

        <div className="profile-card-tabs">
          <button type="button" className="profile-card-tab active">
            Overview
          </button>
        </div>


        <div className="profile-card-body">
          <div className="profile-availability">
            <div className="profile-availability-row">
              <span
                className="profile-availability-dot"
                style={{ background: accessOn ? '#22c55e' : '#94a3b8', boxShadow: 'none' }}
              />
              <strong>{accessOn ? 'App access on' : 'App access off'}</strong>
              <span className="muted">· {accessOn ? 'Can sign in' : 'Blocked from app'}</span>
            </div>
            <div className="profile-availability-row muted">
              <IconClock size={14} />
              <span>{formatLocalTime(now)} — your local time</span>
            </div>
          </div>

          <h3 className="profile-section-title">Contact information</h3>
          <div className="profile-contact-grid">
            <ContactRow icon={<IconMail size={15} />} label="Email" value={email} />
            <ContactRow
              icon={<IconBadge size={15} />}
              label="Employee ID"
              value={employeeId ? `#${employeeId}` : '—'}
            />
            <ContactRow icon={<IconMapPin size={15} />} label="Work location" value={WORK_LOCATION} />
            <ContactRow icon={<IconBuilding size={15} />} label="Company" value={COMPANY} />
            <ContactRow icon={<IconBriefcase size={15} />} label="Job title" value={jobTitle} />
            <ContactRow icon={<IconUsers size={15} />} label="Department" value={DEPARTMENT} />
          </div>

          {(managers.length > 0 || colleagues.length > 0) && (
            <>
              <h3 className="profile-section-title">Organization</h3>
              {managers[0] && (
                <div className="profile-org-block">
                  <div className="profile-org-label">Manager</div>
                  <PersonChip person={managers[0]} onClick={setCurrentPerson} />
                </div>
              )}
              {colleagues.length > 0 && (
                <div className="profile-org-block">
                  <div className="profile-org-label">Works with</div>
                  <div className="profile-org-grid">
                    {colleagues.map((p) => (
                      <PersonChip key={p.id} person={p} onClick={setCurrentPerson} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
