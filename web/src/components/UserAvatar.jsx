/** Circular/square avatar with image fallback to initial + theme color */
export function UserAvatar({
  name = 'U',
  avatarUrl,
  themeColor,
  size = 34,
  className = '',
  rounded = 'md',
  status,
}) {
  const initial = String(name || 'U').trim().slice(0, 1).toUpperCase() || 'U'
  const radius =
    rounded === 'full' ? '50%' : rounded === 'lg' ? '16px' : 'var(--radius-md)'

  return (
    <div
      className={`user-avatar ${className}`.trim()}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: avatarUrl ? 'var(--surface-subtle)' : themeColor || 'var(--shell-accent, #2563eb)',
        fontSize: Math.max(11, Math.round(size * 0.38)),
      }}
      aria-hidden={!avatarUrl}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="user-avatar-img" />
      ) : (
        <span className="user-avatar-initial">{initial}</span>
      )}
      {status ? <span className={`user-avatar-status status-${status}`} title={status} /> : null}
    </div>
  )
}
