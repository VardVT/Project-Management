import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
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
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        await fetchProfile(currentUser.id)
      }
      setLoading(false)
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        await fetchProfile(currentUser.id)
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

  const caps = {
    isAdmin: profile?.position === 'Admin',
    isManager: profile?.position === 'Manager' || profile?.position === 'Admin',
    canManageUsers: profile?.position === 'Admin',
  }

  const value = {
    user,
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
      setUser(null)
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
