import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { EmailPicker } from '../components/EmailPicker'
import { supabase } from '../lib/supabase'
import { IconVessel } from '../components/Icons'

function friendlyError(err) {
  const msg = err?.message || ''
  if (msg.includes('Invalid login credentials')) return 'Invalid email or password.'
  if (msg.includes('Email not confirmed')) return 'Email is not confirmed.'
  return msg || 'Sign in failed.'
}

export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [directory, setDirectory] = useState([])
  const [directoryLoading, setDirectoryLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function loadDirectory() {
      const { data, error: err } = await supabase.functions.invoke('get-directory')
      if (!mounted) return
      if (!err && Array.isArray(data)) {
        setDirectory(data)
      }
      setDirectoryLoading(false)
    }
    loadDirectory()
    return () => {
      mounted = false
    }
  }, [])

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email) {
      setError('Please select an engineer account from the directory.')
      return
    }
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(friendlyError(err))
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
        <h1>Welcome Back</h1>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label>
            Engineer Account
            <EmailPicker
              users={directory}
              value={email}
              onChange={setEmail}
              required
              disabled={directoryLoading}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </label>

          <button type="submit" className="pm-btn primary" disabled={submitting} style={{ height: '36px', marginTop: '6px' }}>
            {submitting ? 'Authenticating…' : 'Sign in to System'}
          </button>
        </form>

        {error ? <p className="error" style={{ marginTop: '14px' }}>{error}</p> : null}
      </div>
    </div>
  )
}
