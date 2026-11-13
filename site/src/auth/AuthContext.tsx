import { onAuthStateChanged, type User } from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth } from '../lib/firebase'
import { loadProfile, type Profile } from '../lib/users'

interface AuthState {
  /** undefined — ещё грузится */
  user: User | null | undefined
  profile: Profile | null
  reloadProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState>({ user: undefined, profile: null, reloadProfile: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setProfile(u ? await loadProfile(u.uid).catch(() => null) : null)
        setUser(u)
      }),
    [],
  )

  const reloadProfile = useCallback(async () => {
    if (auth.currentUser) setProfile(await loadProfile(auth.currentUser.uid))
  }, [])

  return <AuthContext.Provider value={{ user, profile, reloadProfile }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
