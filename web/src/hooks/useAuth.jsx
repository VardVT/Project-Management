import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeRole, getCapabilities } from '../lib/roles'

const AuthContext = createContext(null)

// Token phiên lưu riêng theo trình duyệt (localStorage) — đại diện cho
// "phiên đăng nhập trên thiết bị/trình duyệt này". Nếu ai đó đăng nhập lại
// cùng tài khoản ở nơi khác, DB sẽ có active_session_id MỚI, khác token này.
const SESSION_TOKEN_KEY = 'pm_session_token'

function getLocalSessionToken() {
  return localStorage.getItem(SESSION_TOKEN_KEY)
}

function setLocalSessionToken(token) {
  if (token) localStorage.setItem(SESSION_TOKEN_KEY, token)
  else localStorage.removeItem(SESSION_TOKEN_KEY)
}

function genSessionToken() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [kicked, setKicked] = useState(false) // true khi bị đăng xuất do đăng nhập nơi khác
  const channelRef = useRef(null)

  async function fetchProfile(userId) {
    if (!userId) {
      setProfile(null)
      return null
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (!error && data) {
      setProfile(data)
      return data
    }
    setProfile(null)
    return null
  }

  // FIX: theo dõi Realtime trên profiles — nếu active_session_id đổi khác
  // token cục bộ (nghĩa là có người đăng nhập cùng tài khoản ở nơi khác),
  // tự động sign out phiên này ngay lập tức.
  function watchSession(userId) {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    if (!userId) return

    const channel = supabase
      .channel(`profile-session-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const newToken = payload.new?.active_session_id
          const myToken = getLocalSessionToken()
          if (newToken && myToken && newToken !== myToken) {
            forceLogout()
          }
        }
      )
      .subscribe()

    channelRef.current = channel
  }

  async function forceLogout() {
    setKicked(true)
    setLocalSessionToken(null)
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }

  useEffect(() => {
    let mounted = true

    async function initAuth() {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      const currentSession = data.session
      setSession(currentSession)

      if (currentSession?.user) {
        const p = await fetchProfile(currentSession.user.id)
        // FIX: khi load lại trang (không phải vừa đăng nhập), so sánh token
        // cục bộ với token trong DB — nếu lệch nghĩa là phiên này đã bị
        // thay thế bởi 1 lần đăng nhập khác trong lúc mình không mở app.
        const myToken = getLocalSessionToken()
        if (p?.active_session_id && myToken && p.active_session_id !== myToken) {
          await forceLogout()
        } else {
          watchSession(currentSession.user.id)
        }
      }
      setLoading(false)
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession)
      if (currentSession?.user) {
        await fetchProfile(currentSession.user.id)
        watchSession(currentSession.user.id)
      } else {
        setProfile(null)
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current)
          channelRef.current = null
        }
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  const caps = getCapabilities(normalizeRole(profile?.position))

  const value = {
    session, // TRẢ LẠI BIẾN NÀY ĐỂ KHÔNG LỖI APP
    user: session?.user || null,
    profile,
    loading,
    caps,
    kicked, // FIX: cờ báo "bạn vừa bị đăng xuất do đăng nhập nơi khác" — UI có thể hiện thông báo
    clearKicked: () => setKicked(false),

    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // FIX: sau khi đăng nhập thành công, sinh token phiên MỚI, ghi đè
      // active_session_id trong DB — mọi phiên cũ (thiết bị khác) sẽ thấy
      // token của mình không còn khớp và tự bị đăng xuất qua watchSession().
      const token = genSessionToken()
      setLocalSessionToken(token)
      if (data?.user?.id) {
        await supabase.from('profiles').update({ active_session_id: token }).eq('id', data.user.id)
      }
      setKicked(false)
      return data
    },

    async signOut() {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setLocalSessionToken(null)
      setSession(null)
      setProfile(null)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    },

    async createUser(userData) {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: userData,
      })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      return data
    },

    async deleteUser(userId) {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: userId },
      })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      return data
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
