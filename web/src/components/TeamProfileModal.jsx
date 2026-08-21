import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getRoleLabel, normalizeRole, ROLES } from '../lib/roles'
import { UserAvatar } from './UserAvatar'
import {
  IconCross,
  IconMail,
  IconBriefcase,
  IconBuilding,
  IconMapPin,
  IconBadge,
  IconClock,
  IconUsers,
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

/** Read-only Teams-style overview for another team member */
export function TeamProfileModal({ person, onClose }) {
  const [team, setTeam] = useState([])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadTeam() {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, email, position, theme_color, avatar_url, app_access')
        .order('display_name', { ascending: true })
      if (!mounted) return
      setTeam((data || []).filter((p) => p.id !== person?.id))
    }
    loadTeam()
    return () => {
      mounted = false
    }
  }, [person?.id])

  const name = person?.display_name || person?.email || 'User'
  const jobTitle = getRoleLabel(normalizeRole(person?.position)) || person?.position || 'Engineer'
  const email = person?.email || '—'
  const employeeId = person?.employee_id || ''
  const accessOn = person?.app_access !== false

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

  if (!person) return null

  return (
    <div className="pm-modal-backdrop" onClick={onClose}>
      <div className="pm-modal profile-card-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="profile-card-close" onClick={onClose} title="Close">
          <IconCross size={16} />
        </button>

        <div className="profile-card-header">
          <UserAvatar
            name={name}
            avatarUrl={person.avatar_url}
            themeColor={person.theme_color || '#2563eb'}
            size={72}
            rounded="full"
            className="profile-card-avatar"
            status={accessOn ? 'available' : undefined}
          />
          <div className="profile-card-identity">
            <h2>{name}</h2>
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
                  <PersonChip person={managers[0]} />
                </div>
              )}
              {colleagues.length > 0 && (
                <div className="profile-org-block">
                  <div className="profile-org-label">Works with</div>
                  <div className="profile-org-grid">
                    {colleagues.map((p) => (
                      <PersonChip key={p.id} person={p} />
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
