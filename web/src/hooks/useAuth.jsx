import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeRole, getCapabilities } from '../lib/roles'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId) {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (!error && data) {
      setProfile(data)
    } else {
      setProfile(null)
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
        await fetchProfile(currentSession.user.id)
      }
      setLoading(false)
    }
    initAuth()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession)
      if (currentSession?.user) {
        await fetchProfile(currentSession.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  const caps = getCapabilities(normalizeRole(profile?.position))

  const value = {
    session, // TRẢ LẠI BIẾN NÀY ĐỂ KHÔNG LỖI APP
    user: session?.user || null,
    profile,
    loading,
    caps,
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data
    },
    async signOut() {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setSession(null)
      setProfile(null)
    },
    async createUser(userData) {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: userData
      })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      return data
    },
    async deleteUser(userId) {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: userId }
      })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      return data
    }
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
