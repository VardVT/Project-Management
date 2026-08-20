import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://zfawytyfeaxvrvtjvsun.supabase.co'
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmYXd5dHlmZWF4dnJ2dGp2c3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyOTM0MjUsImV4cCI6MjA5OTg2OTQyNX0.HmhPEmHT5eaWcCRW9Z4Ii5bUlWN3cLUNDs8DZ3le5Bs'

if (!url || !anonKey || anonKey === 'YOUR_ANON_KEY') {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment configuration.'
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
