import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { IconVessel } from '../components/Icons'

const DEFAULT_PASSWORD = 'Pass01'

export function ChangePasswordPage() {
  const { profile, changePassword, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    const next = password.trim()
    if (next.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (next.toLowerCase() === DEFAULT_PASSWORD.toLowerCase()) {
      setError(`Please choose a password other than ${DEFAULT_PASSWORD}.`)
      return
    }
    if (next !== confirm) {
      setError('Password confirmation does not match.')
      return
    }
    setSubmitting(true)
    try {
      await changePassword(next)
    } catch (err) {
      setError(err?.message || 'Could not update password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-scene">
      <div className="login-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <IconVessel size={20} style={{ color: 'var(--primary)' }} />
          <p className="brand" style={{ margin: 0 }}>Progress Management</p>
        </div>
        <h1>Change password</h1>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: '13px', lineHeight: 1.45 }}>
          {profile?.display_name || profile?.email || 'Your account'} is using the temporary password{' '}
          <code>{DEFAULT_PASSWORD}</code>. Set a new password to continue.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              minLength={6}
              required
              autoFocus
            />
          </label>

          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter new password"
              minLength={6}
              required
            />
          </label>

          <button type="submit" className="pm-btn primary" disabled={submitting} style={{ height: '36px', marginTop: '6px' }}>
            {submitting ? 'Saving…' : 'Save new password'}
          </button>
        </form>

        {error ? <p className="error" style={{ marginTop: '14px' }}>{error}</p> : null}

        <button
          type="button"
          className="pm-btn ghost"
          style={{ width: '100%', marginTop: '12px' }}
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
