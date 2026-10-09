
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { EmailPicker } from '../components/EmailPicker'
import { supabase } from '../lib/supabase'
import { IconVessel } from '../components/Icons'

const CAT_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuA2CG04f0OHBUOPb1rIwte6Y4niO2xA6YYqhWTZX1AbjyEZgxD88jQ-_zXrO33R5BgbCn4TzXf3QU2gmE3rzEKJTRaZKYjSNFWMexvHt9Y0lCDiZhU1hxkimLBMwc5LmBUiH3w_zQJN6MQK7yX8Ju0zzf7pSr5hhdKGHjFjJXdfZXaRAzRoY_FhBINEkDqErb5Nbxb-TYbwbmg_S8bO6NZLIDugxQlR10xS1K2PRZAO1_cge2ko55ltcw'

const IDLE_MESSAGE =
  '"Purr-fect timing, Engineer. Ready to authenticate your credentials for vessel telemetry and shipyard milestones."'

function friendlyError(err) {
  const msg = err?.message || ''

  if (msg.includes('Invalid login credentials')) {
    return 'Invalid email or password.'
  }

  if (msg.includes('Email not confirmed')) {
    return 'Email is not confirmed. Please verify your email first.'
  }

  if (msg.includes('Too many requests')) {
    return 'Too many login attempts. Please wait and try again.'
  }

  if (msg.includes('Failed to fetch')) {
    return 'Unable to reach the authentication server. Check your connection.'
  }

  return msg || 'Sign in failed. Please try again.'
}

const CAT_MESSAGES = [
  '"*Happy mechanical purr* Ear antennas tuned to the fleet band!"',
  '"Visor diagnostic scan: Shipyard systems standing by!"',
  '"Engineer, your fleet telemetry console is ready for authentication."',
  '"VARD vessel monitoring systems are standing by. Ready to connect!"',
]

function StatusDot({ color = 'cyan' }) {
  return <span className={`vard-status-dot ${color}`} aria-hidden="true" />
}

export function LoginPage() {
  const { session, loading, signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [directory, setDirectory] = useState([])
  const [directoryLoading, setDirectoryLoading] = useState(true)

  const [rememberSession, setRememberSession] = useState(true)

  const [catState, setCatState] = useState('idle')
  const [bubbleMode, setBubbleMode] = useState('AI COMPANION // ONLINE')
  const [message, setMessage] = useState(IDLE_MESSAGE)
  const [securityText, setSecurityText] = useState('Tier-4 Encrypted')

  const [directoryError, setDirectoryError] = useState('')
  const [authSuccess, setAuthSuccess] = useState(false)

  const catTimeoutRef = useRef(null)
  const mountedRef = useRef(false)

  // Load the engineer directory from the existing Supabase Edge Function.
  useEffect(() => {
    let active = true

    async function loadDirectory() {
      setDirectoryLoading(true)
      setDirectoryError('')

      try {
        const { data, error: invokeError } =
          await supabase.functions.invoke('get-directory')

        if (!active) return

        if (invokeError) {
          throw invokeError
        }

        if (!Array.isArray(data)) {
          throw new Error('The engineer directory returned an invalid response.')
        }

        setDirectory(data)
      } catch (err) {
        if (!active) return

        setDirectory([])
        setDirectoryError(
          err?.message ||
            'Unable to load the engineer directory. Please try again.'
        )
      } finally {
        if (active) {
          setDirectoryLoading(false)
        }
      }
    }

    loadDirectory()

    return () => {
      active = false
    }
  }, [])

  // Clear interaction timers when this page unmounts.
  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      clearTimeout(catTimeoutRef.current)
    }
  }, [])

  const resetCat = useCallback(() => {
    clearTimeout(catTimeoutRef.current)
    setCatState('idle')
    setBubbleMode('AI COMPANION // ONLINE')
    setMessage(IDLE_MESSAGE)
    setSecurityText('Tier-4 Encrypted')
  }, [])

  function handleAccountFocus() {
    if (submitting) return

    clearTimeout(catTimeoutRef.current)
    setCatState('forward')
    setBubbleMode('SCANNING PROFILE')
    setMessage(
      'Scanning engineer directory. Select your authorized account to continue.'
    )
  }

  function handlePasswordFocus() {
    if (submitting) return

    clearTimeout(catTimeoutRef.current)
    setCatState('defensive')
    setBubbleMode('SECURING UPLINK')
    setMessage('Securing the authentication channel. Enter your access code.')
    setSecurityText('Authentication Required')
  }

  function handlePasswordChange(value) {
    setPassword(value)
    setError('')
    setAuthSuccess(false)

    if (value.length > 0) {
      setMessage(
        `Password field updated (${value.length} characters). Ready for authentication.`
      )
    } else {
      setMessage('Enter your engineer password to access the fleet system.')
    }
  }

  function handleCatInteraction() {
    if (submitting) return

    clearTimeout(catTimeoutRef.current)

    const randomMessage =
      CAT_MESSAGES[Math.floor(Math.random() * CAT_MESSAGES.length)]

    setCatState('forward')
    setBubbleMode('FELINE DIAGNOSTICS')
    setMessage(randomMessage)

    catTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        resetCat()
      }
    }, 2500)
  }

  function handleResetCode() {
    setMessage(
      'To reset your password, use your organization’s approved password recovery process or contact your Supabase administrator.'
    )
    setBubbleMode('RECOVERY INFORMATION')
  }

  async function onSubmit(event) {
    event.preventDefault()

    if (submitting) return

    setError('')
    setAuthSuccess(false)

    if (!email.trim()) {
      setError('Please select an engineer account from the directory.')
      return
    }

    if (!password) {
      setError('Please enter your password.')
      return
    }

    setSubmitting(true)
    setCatState('forward')
    setBubbleMode('UPLINK BUSY')
    setMessage(
      '"Handshaking with VARD authentication services... Validating engineer credentials."'
    )

    try {
      // Authentication is performed by the existing Supabase Auth hook.
      await signIn(email.trim(), password)

      if (!mountedRef.current) return

      setAuthSuccess(true)
      setCatState('success')
      setBubbleMode('AUTHENTICATION ACCEPTED')
      setMessage(
        '"Authentication successful. Welcome aboard, Engineer. Opening the fleet dashboard..."'
      )
      setSecurityText('Authenticated')
    } catch (err) {
      if (!mountedRef.current) return

      setError(friendlyError(err))
      setCatState('defensive')
      setBubbleMode('CHECKSUM FAILED')
      setMessage(
        '"Access denied. Verify your engineer account and password, then try again."'
      )
      setSecurityText('Authentication Failed')
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  // Let the existing auth provider handle redirects and session restoration.
  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="vard-login">
      {/* Technical background */}
      <div className="vard-background" aria-hidden="true">
        <div className="vard-bg-glow vard-bg-red" />
        <div className="vard-bg-glow vard-bg-cyan" />
        <div className="vard-bg-glow vard-bg-bottom" />
        <div className="vard-grid" />
        <div className="vard-micro-grid" />
        <div className="vard-vignette" />
      </div>

      {/* Top navigation */}
      <header className="vard-header">
        <div className="vard-header-inner">
          <div className="vard-header-brand">
            <div className="vard-brand-mark">
              <IconVessel size={18} />
            </div>

            <span className="vard-brand-title">
              VARD // SHIPBUILDING SUITE
            </span>

            <span className="vard-header-divider" />

            <div className="vard-online">
              <StatusDot color="red" />
              <span>YARD_OPS: ONLINE</span>
            </div>
          </div>

          <div className="vard-header-status">
            <div className="vard-header-chip vard-ai-chip">
              <span className="vard-paw" aria-hidden="true">
                ✦
              </span>
              <span>AI COMPANION: ACTIVE</span>
            </div>

            <div className="vard-header-chip">
              <span className="vard-satellite" aria-hidden="true">
                ◉
              </span>
              <span>FLEET_SYNC 99.9%</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="vard-main">
        <div className="vard-layout">
          {/* Left: Cyber Feline */}
          <section className="vard-mascot-section">
            <div className="vard-mascot-aura" aria-hidden="true" />

            <div
              className={`vard-speech-bubble ${
                catState === 'forward'
                  ? 'bubble-cyan'
                  : catState === 'defensive'
                    ? 'bubble-red'
                    : catState === 'success'
                      ? 'bubble-success'
                      : ''
              }`}
              aria-live="polite"
            >
              <div className="vard-bubble-header">
                <div className="vard-bubble-label">
                  <StatusDot
                    color={catState === 'success' ? 'green' : 'red'}
                  />
                  <span>VARD CYBER FELINE ASSISTANT</span>
                </div>

                <span className="vard-bubble-mode">{bubbleMode}</span>
              </div>

              <p>{message}</p>
            </div>

            <button
              type="button"
              className={`vard-cat-portal cat-${catState}`}
              onClick={handleCatInteraction}
              aria-label="Interact with VARD Cyber Feline assistant"
              title="Click to interact with the Cyber Feline"
            >
              <div className="vard-orbit vard-orbit-outer" />
              <div className="vard-orbit vard-orbit-middle" />
              <div className="vard-orbit vard-orbit-inner" />

              <div className="vard-cat-frame">
                <img
                  src={CAT_IMAGE}
                  alt="Cyber Feline Engineer mascot"
                  draggable="false"
                />
                <div className="vard-cat-reflection" />
              </div>

              <span className="vard-hud-label vard-hud-top">
                HUD://01.FELINE
              </span>

              <span className="vard-hud-label vard-hud-bottom">
                OPTICS://ACTIVE
              </span>
            </button>

            <div className="vard-mascot-meta">
              <div className="vard-meta-chip">
                <span className="vard-meta-icon">✦</span>
                <span>
                  Unit: <strong>FELINE-01 VARD</strong>
                </span>
              </div>

              <div className="vard-meta-chip">
                <StatusDot
                  color={error ? 'red' : 'cyan'}
                />
                <span>
                  Diagnostics:{' '}
                  <strong className="vard-cyan-text">
                    {error
                      ? 'Authentication Warning'
                      : authSuccess
                        ? 'Verified'
                        : 'Optimal // 100%'}
                  </strong>
                </span>
              </div>

              <div className="vard-meta-chip">
                <span className="vard-meta-icon vard-red-text">▣</span>
                <span>
                  Security:{' '}
                  <strong className="vard-red-text">{securityText}</strong>
                </span>
              </div>
            </div>
          </section>

          {/* Right: Supabase login */}
          <section className="vard-form-section">
            <div className="vard-login-card">
              <div className="vard-card-accent" />

              <div className="vard-card-heading">
                <div className="vard-product-brand">
                  <div className="vard-product-icon">
                    <IconVessel size={22} />
                  </div>

                  <div>
                    <div className="vard-product-name">
                      VARD <span>SECURE</span>
                    </div>
                    <p>SHIPBUILDING PROGRESS SUITE</p>
                  </div>
                </div>

                <span className="vard-version">v2.4.1</span>
              </div>

              <div className="vard-welcome">
                <h1>Welcome Back</h1>
                <p>
                  Authenticate with your specialized engineer credentials to
                  monitor vessel milestones and shipyard tasks.
                </p>
              </div>

              {error && (
                <div className="vard-error" role="alert">
                  <span className="vard-error-icon" aria-hidden="true">
                    !
                  </span>

                  <p>{error}</p>

                  <button
                    type="button"
                    onClick={() => setError('')}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              )}

              {directoryError && (
                <div className="vard-directory-notice" role="status">
                  <p>
                    Engineer directory unavailable. Check the directory
                    service before signing in.
                  </p>

                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                  >
                    Retry
                  </button>
                </div>
              )}

              <form className="vard-form" onSubmit={onSubmit}>
                {/* Engineer account */}
                <div className="vard-field">
                  <div className="vard-field-heading">
                    <label htmlFor="engineer-account">
                      Engineer Account
                    </label>

                    <span className="vard-directory-status">
                      <StatusDot
                        color={directoryLoading ? 'red' : 'cyan'}
                      />
                      {directoryLoading ? 'Loading Directory' : 'Directory'}
                    </span>
                  </div>

                  <div
                    className="vard-picker"
                    id="engineer-account"
                    onFocus={handleAccountFocus}
                  >
                    <EmailPicker
                      users={directory}
                      value={email}
                      onChange={(value) => {
                        setEmail(value)
                        setError('')
                        setAuthSuccess(false)
                      }}
                      required
                      disabled={directoryLoading || submitting}
                    />
                  </div>

                  {!directoryLoading &&
                    !directoryError &&
                    directory.length === 0 && (
                      <p className="vard-field-hint">
                        No engineer accounts were returned by the directory.
                      </p>
                    )}
                </div>

                {/* Password */}
                <div className="vard-field">
                  <div className="vard-field-heading">
                    <label htmlFor="vard-password">Password</label>

                    <button
                      type="button"
                      className="vard-text-button"
                      onClick={handleResetCode}
                    >
                      Reset code?
                    </button>
                  </div>

                  <div className="vard-password-wrap">
                    <span
                      className="vard-password-symbol"
                      aria-hidden="true"
                    >
                      ◈
                    </span>

                    <input
                      id="vard-password"
                      className="vard-password-input"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) =>
                        handlePasswordChange(event.target.value)
                      }
                      onFocus={handlePasswordFocus}
                      placeholder="Enter access code"
                      minLength={6}
                      required
                      disabled={submitting}
                    />

                    <button
                      type="button"
                      className="vard-password-toggle"
                      onClick={() =>
                        setShowPassword((previous) => !previous)
                      }
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  <p className="vard-field-hint">
                    Use the password associated with your engineer account.
                  </p>
                </div>

                {/* Remember session */}
                <div className="vard-form-options">
                  <label className="vard-remember">
                    <input
                      type="checkbox"
                      checked={rememberSession}
                      onChange={(event) =>
                        setRememberSession(event.target.checked)
                      }
                    />
                    <span>Remember terminal session</span>
                  </label>

                  <span className="vard-encryption-label">
                    <span aria-hidden="true">▣</span> TLS / AUTH
                  </span>
                </div>

                {/* Submit */}
                <button
                  className="vard-submit"
                  type="submit"
                  disabled={submitting || loading || directoryLoading}
                  onMouseEnter={() => {
                    if (!submitting) {
                      setCatState('ready')
                      setBubbleMode('FLEET OS SYNC')
                      setMessage(
                        'All systems ready. Waiting for secure authentication...'
                      )
                    }
                  }}
                  onMouseLeave={() => {
                    if (!submitting) resetCat()
                  }}
                >
                  {submitting ? (
                    <>
                      <span className="vard-spinner" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {authSuccess
                          ? 'Authenticated'
                          : 'Sign in to System'}
                      </span>
                      <span aria-hidden="true">→</span>
                    </>
                  )}
                </button>
              </form>

              <footer className="vard-card-footer">
                <div className="vard-footer-row">
                  <span>▣ TLS // Secure Auth</span>
                  <span>Yard Vung Tau / VietNam</span>
                </div>

                <p>Fleet Database Revision 2025.4-STABLE</p>
              </footer>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
