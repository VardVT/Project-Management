import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import fallbackDirectory from '../data/directory.json'

function friendlyError(err) {
  const msg = err?.message || ''
  if (msg.includes('Invalid login credentials')) {
    return 'Invalid email or password. Please verify your credentials and try again.'
  }
  if (msg.includes('Email not confirmed')) {
    return 'Email is not confirmed. Please verify your email first.'
  }
  if (msg.includes('Too many requests')) {
    return 'Too many login attempts. Please wait a moment and try again.'
  }
  if (msg.includes('Failed to fetch')) {
    return 'Unable to reach the Supabase authentication server. Please check your network connection.'
  }
  return msg || 'Sign in failed. Please try again.'
}

export function LoginPage() {
  const { session, loading, signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [directory, setDirectory] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [helpModalOpen, setHelpModalOpen] = useState(false)
  const [helpModalTab, setHelpModalTab] = useState('accounts') // 'accounts' | 'reset' | 'info'

  const suggestRef = useRef(null)

  // Load engineer directory from Supabase Edge Function with fallback
  useEffect(() => {
    let active = true

    async function loadDirectory() {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('get-directory')
        if (!active) return

        if (invokeError || !Array.isArray(data) || data.length === 0) {
          setDirectory(Array.isArray(fallbackDirectory) ? fallbackDirectory : [])
        } else {
          setDirectory(data)
        }
      } catch {
        if (!active) return
        setDirectory(Array.isArray(fallbackDirectory) ? fallbackDirectory : [])
      }
    }

    loadDirectory()
    return () => {
      active = false
    }
  }, [])

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    function onDocClick(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filteredSuggestions = directory.filter((u) => {
    if (!email) return true
    const q = email.toLowerCase()
    return (
      u.email?.toLowerCase().includes(q) ||
      u.name?.toLowerCase().includes(q) ||
      String(u.employeeId || '').includes(q)
    )
  }).slice(0, 6)

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting) return

    setError('')

    const cleanEmail = email.trim()
    if (!cleanEmail) {
      setError('Please enter your engineer email.')
      return
    }

    if (!password) {
      setError('Please enter your password.')
      return
    }

    setSubmitting(true)

    try {
      await signIn(cleanEmail, password)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }

  function handleQuickFill(accountEmail, accountPassword = '01') {
    setEmail(accountEmail)
    setPassword(accountPassword)
    setError('')
    setShowSuggestions(false)
    setHelpModalOpen(false)
  }

  // Redirect if already authenticated
  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="vard-suite-login">
      {/* BEGIN: Bottom Left Isometric Corner Illustration */}
      <div
        className="corner-illustration-left"
        data-purpose="corner-illustration-left"
        aria-hidden="true"
      >
        <svg
          className="w-full h-auto opacity-80"
          style={{ width: '100%', height: 'auto', opacity: 0.8 }}
          fill="none"
          viewBox="0 0 460 360"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="leftHullGrad" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#0B1E36" />
              <stop offset="100%" stopColor="#1E3A5F" />
            </linearGradient>
            <linearGradient id="deckGrad" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#D90429" />
              <stop offset="100%" stopColor="#FF4D6D" />
            </linearGradient>
            <linearGradient id="dockGridGrad" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#0284C7" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon
            fill="url(#dockGridGrad)"
            points="0,320 180,240 380,270 200,350 0,350"
            stroke="#94A3B8"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <line
            stroke="#0284C7"
            strokeDasharray="3 3"
            strokeWidth="1.2"
            x1="40"
            x2="220"
            y1="300"
            y2="220"
          />
          <line
            stroke="#0284C7"
            strokeDasharray="3 3"
            strokeWidth="1.2"
            x1="100"
            x2="280"
            y1="310"
            y2="230"
          />
          <polygon fill="#0F172A" points="20,270 160,210 230,235 90,295" />
          <polygon fill="#1E293B" points="90,295 230,235 230,250 90,310" />
          <polygon fill="#0B1E36" points="20,270 90,295 90,310 20,285" />
          <path
            d="M 40,245 L 180,185 L 250,210 L 220,245 L 80,265 Z"
            fill="url(#leftHullGrad)"
            stroke="#38BDF8"
            strokeWidth="1.5"
          />
          <path
            d="M 80,265 L 220,245 L 220,260 L 80,280 Z"
            fill="#071426"
          />
          <line
            stroke="#D90429"
            strokeWidth="2.5"
            x1="45"
            x2="175"
            y1="243"
            y2="187"
          />
          <polygon
            fill="url(#deckGrad)"
            points="130,170 170,155 190,165 150,180"
          />
          <rect
            fill="#F8FAFC"
            height="18"
            stroke="#CBD5E1"
            strokeWidth="1"
            transform="skewY(-14)"
            width="34"
            x="145"
            y="190"
          />
          <line
            stroke="#38BDF8"
            strokeWidth="1.5"
            x1="150"
            x2="172"
            y1="162"
            y2="157"
          />
          <path
            d="M 70,230 L 70,120 L 115,100 L 155,100 L 115,120 L 70,120"
            fill="none"
            stroke="#D90429"
            strokeWidth="3"
          />
          <polygon fill="#B90322" points="70,120 115,100 115,108 70,128" />
          <line
            stroke="#0B1E36"
            strokeWidth="1"
            x1="135"
            x2="135"
            y1="100"
            y2="145"
          />
          <circle cx="135" cy="148" fill="#D90429" r="3" />
          <circle
            cx="320"
            cy="180"
            fill="none"
            r="50"
            stroke="#38BDF8"
            strokeDasharray="2 4"
            strokeWidth="1"
          />
          <circle
            cx="320"
            cy="180"
            fill="none"
            r="30"
            stroke="#38BDF8"
            strokeWidth="0.8"
          />
          <line
            stroke="#38BDF8"
            strokeWidth="1"
            x1="260"
            x2="380"
            y1="180"
            y2="180"
          />
          <line
            stroke="#38BDF8"
            strokeWidth="1"
            x1="320"
            x2="320"
            y1="120"
            y2="240"
          />
          <line
            stroke="#D90429"
            strokeLinecap="round"
            strokeWidth="1.5"
            x1="320"
            x2="355"
            y1="180"
            y2="150"
          />
          <circle cx="355" cy="150" fill="#D90429" r="2.5" />
          <text
            fill="#64748B"
            fontFamily="monospace"
            fontSize="9"
            letterSpacing="1"
            x="270"
            y="245"
          >
            SEC-04 DOCK TELEMETRY
          </text>
        </svg>
      </div>
      {/* END: Bottom Left Isometric Corner Illustration */}

      {/* BEGIN: Bottom Right Isometric Corner Illustration */}
      <div
        className="corner-illustration-right"
        data-purpose="corner-illustration-right"
        aria-hidden="true"
      >
        <svg
          className="w-full h-auto opacity-80"
          style={{ width: '100%', height: 'auto', opacity: 0.8 }}
          fill="none"
          viewBox="0 0 460 360"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="rightHullGrad" x1="0%" x2="100%" y1="0%" y2="80%">
              <stop offset="0%" stopColor="#1E3A5F" />
              <stop offset="100%" stopColor="#0B1E36" />
            </linearGradient>
            <linearGradient id="craneGrad" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#D90429" />
              <stop offset="100%" stopColor="#EF233C" />
            </linearGradient>
          </defs>
          <polygon
            fill="#E2E8F0"
            fillOpacity="0.4"
            points="60,290 260,230 450,280 250,340"
          />
          <line
            stroke="#94A3B8"
            strokeDasharray="4 4"
            strokeWidth="1"
            x1="160"
            x2="350"
            y1="260"
            y2="310"
          />
          <line
            stroke="#94A3B8"
            strokeDasharray="4 4"
            strokeWidth="1"
            x1="110"
            x2="300"
            y1="275"
            y2="325"
          />
          <polygon fill="#1E293B" points="180,240 340,195 420,230 260,275" />
          <polygon fill="#0F172A" points="180,240 260,275 260,290 180,255" />
          <polygon fill="#334155" points="260,275 420,230 420,245 260,290" />
          <path
            d="M 220,210 C 270,185 360,180 430,210 L 400,245 C 340,225 270,230 220,210 Z"
            fill="url(#rightHullGrad)"
            stroke="#38BDF8"
            strokeWidth="1.5"
          />
          <path
            d="M 220,210 C 270,185 360,180 430,210"
            fill="none"
            stroke="#D90429"
            strokeWidth="2.5"
          />
          <polygon
            fill="#FFFFFF"
            points="260,120 380,85 410,185 290,220"
            stroke="#CBD5E1"
            strokeWidth="1.5"
          />
          <polygon
            fill="#F8FAFC"
            points="275,130 370,102 395,178 300,206"
          />
          <line
            stroke="#0284C7"
            strokeDasharray="2 2"
            strokeWidth="1.5"
            x1="285"
            x2="380"
            y1="145"
            y2="118"
          />
          <line
            stroke="#0284C7"
            strokeDasharray="2 2"
            strokeWidth="1.5"
            x1="290"
            x2="385"
            y1="165"
            y2="138"
          />
          <line
            stroke="#D90429"
            strokeWidth="2"
            x1="295"
            x2="360"
            y1="185"
            y2="166"
          />
          <circle cx="325" cy="155" fill="#D90429" r="3" />
          <path
            d="M 370,170 L 370,50 L 430,20 L 440,25 L 390,50 L 390,170"
            fill="url(#craneGrad)"
          />
          <line
            stroke="#94A3B8"
            strokeWidth="1"
            x1="420"
            x2="420"
            y1="30"
            y2="90"
          />
          <rect fill="#0F172A" height="8" width="12" x="414" y="90" />
          <text
            fill="#0B1E36"
            fontFamily="monospace"
            fontSize="10"
            fontWeight="bold"
            letterSpacing="1.5"
            x="240"
            y="320"
          >
            VARD YARD 01 // HULL ASSY
          </text>
        </svg>
      </div>
      {/* END: Bottom Right Isometric Corner Illustration */}

      {/* Top spacer for optical centering */}
      <div style={{ height: '48px', width: '100%', flexShrink: 0 }} />

      {/* BEGIN: Main Login Card Container */}
      <main style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 16px', zIndex: 10, margin: 'auto' }}>
        <div className="auth-card" data-purpose="auth-card">
          {/* BEGIN: Brand Logo */}
          <header style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }} data-purpose="brand-header">
            <a
              href="#"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
              onClick={(e) => e.preventDefault()}
            >
              {/* Nautical Shield / Compass Bow Icon */}
              <svg
                style={{ width: '32px', height: '32px', flexShrink: 0 }}
                fill="none"
                viewBox="0 0 36 36"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 2L32 10V22C32 29 18 34 18 34C18 34 4 29 4 22V10L18 2Z"
                  fill="#D90429"
                />
                <path
                  d="M18 2L32 10V22C32 29 18 34 18 34V2Z"
                  fill="#B90322"
                />
                <path d="M18 8L25 19H11L18 8Z" fill="white" />
                <path
                  d="M18 20L23 27H13L18 20Z"
                  fill="white"
                  fillOpacity="0.85"
                />
              </svg>

              <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                <span style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.02em', color: '#0B1E36' }}>
                  VARD
                </span>
                <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.16em', color: '#6B778C', textTransform: 'uppercase', marginTop: '2px' }}>
                  Shipbuilding Suite
                </span>
              </div>
            </a>
          </header>
          {/* END: Brand Logo */}

          {/* Section Title */}
          <h1 style={{ color: '#172B4D', fontSize: '15px', fontWeight: 600, marginBottom: '20px', letterSpacing: '-0.01em', marginTop: 0 }}>
            Sign in to Shipbuilding Suite
          </h1>

          {/* Error Message Banner */}
          {error && (
            <div className="auth-error-banner" role="alert">
              <svg
                style={{ width: '16px', height: '16px', flexShrink: 0, marginTop: '1px' }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
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

          {/* BEGIN: Primary Form */}
          <form
            style={{ width: '100%', textAlign: 'left' }}
            data-purpose="login-form"
            onSubmit={handleSubmit}
          >
            {/* Email Field */}
            <div style={{ marginBottom: '14px', position: 'relative' }} ref={suggestRef}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label
                  htmlFor="email"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#6B778C' }}
                >
                  Email <span style={{ color: '#D90429' }}>*</span>
                </label>

                {directory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSuggestions((v) => !v)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#0052CC',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {showSuggestions ? 'Hide accounts' : 'Select engineer ▾'}
                  </button>
                )}
              </div>

              <input
                id="email"
                name="email"
                type="email"
                className="atlassian-input"
                placeholder="name@vard.com"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                onFocus={() => {
                  if (directory.length > 0 && !email) setShowSuggestions(true)
                }}
                autoComplete="email"
                disabled={submitting}
              />

              {/* Suggestions Dropdown */}
              {showSuggestions && directory.length > 0 && (
                <ul className="engineer-suggest-dropdown" role="listbox">
                  <li
                    style={{
                      padding: '5px 10px',
                      fontSize: '10.5px',
                      color: '#6B778C',
                      fontWeight: 600,
                      borderBottom: '1px solid #ebecf0',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Shipyard Engineer Directory
                  </li>
                  {filteredSuggestions.map((u) => (
                    <li
                      key={u.email}
                      className="engineer-suggest-item"
                      onClick={() => handleQuickFill(u.email, '01')}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong>{u.name}</strong>
                        <span style={{ fontSize: '11px', color: '#6B778C' }}>{u.email}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {u.employeeId && <span className="emp-badge">#{u.employeeId}</span>}
                        <span style={{ fontSize: '11px', color: '#0052CC', fontWeight: 600 }}>
                          {u.position || 'Engineer'}
                        </span>
                      </div>
                    </li>
                  ))}
                  <li
                    style={{
                      padding: '6px 10px',
                      fontSize: '11px',
                      color: '#0052CC',
                      textAlign: 'center',
                      background: '#fafbfc',
                      borderTop: '1px solid #ebecf0',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setShowSuggestions(false)
                      setHelpModalTab('accounts')
                      setHelpModalOpen(true)
                    }}
                  >
                    View all credentials & Supabase setup →
                  </li>
                </ul>
              )}
            </div>

            {/* Password Field */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label
                  htmlFor="password"
                  style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#6B778C' }}
                >
                  Password <span style={{ color: '#D90429' }}>*</span>
                </label>
                <button
                  type="button"
                  style={{ fontSize: '12px', color: '#0052CC', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  onClick={() => {
                    setHelpModalTab('reset')
                    setHelpModalOpen(true)
                  }}
                >
                  Forgot password?
                </button>
              </div>

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="atlassian-input"
                  style={{ paddingRight: '36px' }}
                  placeholder="Enter your password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  autoComplete="current-password"
                  disabled={submitting}
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    border: 'none',
                    background: 'transparent',
                    color: '#6B778C',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0,
                  }}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <svg
                    style={{ width: '16px', height: '16px' }}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    viewBox="0 0 24 24"
                  >
                    {showPassword ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>

              <p style={{ fontSize: '11px', color: '#6B778C', margin: '4px 0 0' }}>
                Minimum 6 characters
              </p>
            </div>

            {/* Remember Me Checkbox with Tooltip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: '14px', height: '14px', accentColor: '#D90429', cursor: 'pointer', margin: 0 }}
              />
              <label
                htmlFor="remember-me"
                style={{ fontSize: '12px', color: '#172B4D', cursor: 'pointer', userSelect: 'none' }}
              >
                Remember me
              </label>

              <div
                title="Saves session for fast shipyard telemetry access"
                style={{ display: 'flex', alignItems: 'center', cursor: 'help' }}
              >
                <svg
                  style={{ width: '14px', height: '14px', color: '#6B778C' }}
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z" />
                  <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
                </svg>
              </div>
            </div>

            {/* Sign In Submit Button */}
            <button
              type="submit"
              className="atlassian-btn-submit"
              disabled={submitting || loading}
            >
              {submitting ? (
                <>
                  <span
                    style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderTopColor: '#ffffff',
                      borderRadius: '50%',
                      animation: 'vard-spin-cw 0.7s linear infinite',
                      display: 'inline-block',
                    }}
                  />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
          {/* END: Primary Form */}

          {/* BEGIN: Account Recovery & Supabase Help Links */}
          <nav
            style={{
              marginTop: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '12px',
            }}
            data-purpose="recovery-links"
          >
            <button
              type="button"
              style={{ color: '#0052CC', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
              onClick={() => {
                setHelpModalTab('reset')
                setHelpModalOpen(true)
              }}
            >
              Can't log in?
            </button>
            <span style={{ color: '#6B778C', fontSize: '11px' }}>•</span>
            <button
              type="button"
              style={{ color: '#0052CC', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
              onClick={() => {
                setHelpModalTab('accounts')
                setHelpModalOpen(true)
              }}
            >
              Need help?
            </button>
            <span style={{ color: '#6B778C', fontSize: '11px' }}>•</span>
            <button
              type="button"
              style={{ color: '#0052CC', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
              onClick={() => {
                setHelpModalTab('info')
                setHelpModalOpen(true)
              }}
            >
              Create an account
            </button>
          </nav>
          {/* END: Account Recovery Links */}

          {/* Card Internal Divider */}
          <hr style={{ width: '100%', border: 'none', borderTop: '1px solid #DFE1E6', margin: '20px 0' }} />

          {/* BEGIN: Card Footer Info */}
          <footer
            style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            data-purpose="card-footer"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', opacity: 0.9 }}>
              <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 36 36">
                <path
                  d="M18 2L32 10V22C32 29 18 34 18 34C18 34 4 29 4 22V10L18 2Z"
                  fill="#D90429"
                />
                <path d="M18 8L25 19H11L18 8Z" fill="white" />
              </svg>
              <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', color: '#0B1E36' }}>
                VARD
              </span>
            </div>

            <p style={{ fontSize: '11px', color: '#5E6C84', margin: '0 0 8px', lineHeight: 1.3 }}>
              VARD Progress Management • Shipbuilding Suite
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', color: '#5E6C84' }}>
              <a
                href="#/login"
                onClick={(e) => {
                  e.preventDefault()
                  setHelpModalTab('info')
                  setHelpModalOpen(true)
                }}
                style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
              >
                Privacy Policy
                <svg style={{ width: '8px', height: '8px', color: '#6B778C' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <span>•</span>
              <a
                href="#/login"
                onClick={(e) => {
                  e.preventDefault()
                  setHelpModalTab('info')
                  setHelpModalOpen(true)
                }}
                style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
              >
                User Notice
                <svg style={{ width: '8px', height: '8px', color: '#6B778C' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          </footer>
          {/* END: Card Footer Info */}
        </div>
      </main>
      {/* END: Main Login Card Container */}

      {/* Bottom spacer for balanced viewport alignment */}
      <div style={{ height: '48px', width: '100%', flexShrink: 0 }} />

      {/* BEGIN: Supabase Connection & Help Modal */}
      {helpModalOpen && (
        <div className="supabase-help-modal-overlay" onClick={() => setHelpModalOpen(false)}>
          <div className="supabase-help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="supabase-help-header">
              <h3>
                <svg style={{ width: '18px', height: '18px', color: '#3ECF8E' }} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.362 9.354H12V.396a.396.396 0 0 0-.716-.234L.436 13.923a.396.396 0 0 0 .313.639H12v8.958a.396.396 0 0 0 .716.234l10.848-13.761a.396.396 0 0 0-.313-.639z" />
                </svg>
                Supabase Authentication & Shipyard Access
              </h3>
              <button
                type="button"
                onClick={() => setHelpModalOpen(false)}
                style={{ border: 'none', background: 'transparent', fontSize: '18px', color: '#6B778C', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div className="supabase-help-body">
              {/* Status Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F4F5F7', borderRadius: '4px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#6B778C', textTransform: 'uppercase', fontWeight: 700 }}>
                    Backend Service
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#172B4D', fontFamily: 'monospace' }}>
                    zfawytyfeaxvrvtjvsun.supabase.co
                  </div>
                </div>
                <div className="supabase-status-pill">
                  <span className="supabase-status-dot" />
                  <span>Connected</span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #DFE1E6', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => setHelpModalTab('accounts')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '8px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: helpModalTab === 'accounts' ? '#0052CC' : '#6B778C',
                    borderBottom: helpModalTab === 'accounts' ? '2px solid #0052CC' : '2px solid transparent',
                  }}
                >
                  Authorized Shipyard Accounts
                </button>
                <button
                  type="button"
                  onClick={() => setHelpModalTab('reset')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '8px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: helpModalTab === 'reset' ? '#0052CC' : '#6B778C',
                    borderBottom: helpModalTab === 'reset' ? '2px solid #0052CC' : '2px solid transparent',
                  }}
                >
                  Password Help
                </button>
                <button
                  type="button"
                  onClick={() => setHelpModalTab('info')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '8px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: helpModalTab === 'info' ? '#0052CC' : '#6B778C',
                    borderBottom: helpModalTab === 'info' ? '2px solid #0052CC' : '2px solid transparent',
                  }}
                >
                  New Account
                </button>
              </div>

              {/* Tab 1: Authorized Accounts */}
              {helpModalTab === 'accounts' && (
                <div>
                  <p style={{ fontSize: '13px', color: '#5E6C84', margin: '0 0 12px', lineHeight: 1.5 }}>
                    Click <strong>Use Account</strong> to automatically populate credentials for testing and authorized vessel telemetry:
                  </p>

                  {/* Seeded and directory accounts */}
                  <div className="supabase-account-card">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '13px', color: '#172B4D' }}>Nguyễn Trần Hưng</strong>
                        <span className="role-pill manager">Manager</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#6B778C' }}>nguyen.tran.hung@vard.com • Pass: <code style={{ color: '#D90429' }}>01</code> / <code style={{ color: '#D90429' }}>Pass01</code></div>
                    </div>
                    <button
                      type="button"
                      className="btn-fill-account"
                      onClick={() => handleQuickFill('nguyen.tran.hung@vard.com', '01')}
                    >
                      Use Account
                    </button>
                  </div>

                  <div className="supabase-account-card">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '13px', color: '#172B4D' }}>Nguyễn Quốc Toàn</strong>
                        <span className="role-pill senior">Senior</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#6B778C' }}>nguyen.quoc.toan@vard.com • Pass: <code style={{ color: '#D90429' }}>01</code> / <code style={{ color: '#D90429' }}>Pass01</code></div>
                    </div>
                    <button
                      type="button"
                      className="btn-fill-account"
                      onClick={() => handleQuickFill('nguyen.quoc.toan@vard.com', '01')}
                    >
                      Use Account
                    </button>
                  </div>

                  <div className="supabase-account-card">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '13px', color: '#172B4D' }}>Đặng Duy Hoàng</strong>
                        <span className="role-pill engineer">Engineer</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#6B778C' }}>dang.duy.hoang@vard.com • Pass: <code style={{ color: '#D90429' }}>01</code></div>
                    </div>
                    <button
                      type="button"
                      className="btn-fill-account"
                      onClick={() => handleQuickFill('dang.duy.hoang@vard.com', '01')}
                    >
                      Use Account
                    </button>
                  </div>

                  <div className="supabase-account-card">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '13px', color: '#172B4D' }}>Hồ Thanh Tuất</strong>
                        <span className="role-pill senior">Senior</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#6B778C' }}>ho.thanh.tuat@vard.com • Pass: <code style={{ color: '#D90429' }}>01</code></div>
                    </div>
                    <button
                      type="button"
                      className="btn-fill-account"
                      onClick={() => handleQuickFill('ho.thanh.tuat@vard.com', '01')}
                    >
                      Use Account
                    </button>
                  </div>

                  <div style={{ marginTop: '12px', padding: '10px', background: '#F4F5F7', borderRadius: '4px', fontSize: '12px', color: '#5E6C84' }}>
                    Tip: Initial engineer accounts are provisioned with temporary password <code style={{ color: '#D90429' }}>01</code> or <code style={{ color: '#D90429' }}>Pass01</code>.
                  </div>
                </div>
              )}

              {/* Tab 2: Password Help */}
              {helpModalTab === 'reset' && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#172B4D', margin: '0 0 8px' }}>
                    Resetting Your Password
                  </h4>
                  <p style={{ fontSize: '13px', color: '#5E6C84', lineHeight: 1.5, margin: '0 0 12px' }}>
                    VARD Shipbuilding Suite accounts are managed securely via Supabase Auth and Yard IT administration:
                  </p>
                  <ol style={{ fontSize: '12.5px', color: '#172B4D', paddingLeft: '20px', lineHeight: 1.6, margin: '0 0 16px' }}>
                    <li>If you were assigned a temporary password (<strong>Pass01</strong> or <strong>01</strong>), log in and you will be prompted to set your personal password.</li>
                    <li>For password resets on live shipyard email addresses, contact your Project Lead or shipyard database administrator.</li>
                    <li>Alternatively, select any authorized test account from the <strong>Authorized Shipyard Accounts</strong> tab.</li>
                  </ol>
                  <button
                    type="button"
                    className="atlassian-btn-submit"
                    style={{ width: 'auto', padding: '8px 16px' }}
                    onClick={() => setHelpModalTab('accounts')}
                  >
                    Select an Authorized Account
                  </button>
                </div>
              )}

              {/* Tab 3: New Account Info */}
              {helpModalTab === 'info' && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#172B4D', margin: '0 0 8px' }}>
                    User Account Provisioning
                  </h4>
                  <p style={{ fontSize: '13px', color: '#5E6C84', lineHeight: 1.5, margin: '0 0 12px' }}>
                    Due to shipyard security requirements, new engineer accounts are created by Managers in the <strong>Users</strong> management section of the app.
                  </p>
                  <div style={{ padding: '12px', background: '#E3FCEF', border: '1px solid #ABF5D1', borderRadius: '4px', fontSize: '12.5px', color: '#006644', lineHeight: 1.5 }}>
                    <strong>Accessing as Manager:</strong> Use Manager account <strong>nguyen.tran.hung@vard.com</strong> with password <strong>01</strong> to access the admin user creation portal.
                  </div>
                  <div style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      className="btn-fill-account"
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                      onClick={() => handleQuickFill('nguyen.tran.hung@vard.com', '01')}
                    >
                      Fill Manager Credentials
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* END: Supabase Connection & Help Modal */}
    </div>
  )
}
