import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getAuthUrl, getSession } from '../services/lastfm'

interface AuthState {
  sessionKey: string | null
  username: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: () => void
  logout: () => void
  handleCallback: (token: string) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const STORAGE_KEY = 'lastfm_session'
const STORAGE_USER = 'lastfm_username'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionKey, setSessionKey] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
  })
  const [username, setUsername] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_USER) } catch { return null }
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      if (sessionKey) {
        localStorage.setItem(STORAGE_KEY, sessionKey)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch { /* localStorage unavailable */ }
  }, [sessionKey])

  useEffect(() => {
    try {
      if (username) {
        localStorage.setItem(STORAGE_USER, username)
      } else {
        localStorage.removeItem(STORAGE_USER)
      }
    } catch { /* localStorage unavailable */ }
  }, [username])

  const login = useCallback(() => {
    setError(null)
    window.location.href = getAuthUrl()
  }, [])

  const logout = useCallback(() => {
    setSessionKey(null)
    setUsername(null)
    setError(null)
  }, [])

  const handleCallback = useCallback(async (token: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getSession(token)
      setSessionKey(result.sessionKey)
      setUsername(result.username)
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        sessionKey,
        username,
        isAuthenticated: !!sessionKey,
        isLoading,
        error,
        login,
        logout,
        handleCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
