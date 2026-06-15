import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './AuthCallback.module.css'

export default function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { handleCallback, error, isLoading } = useAuth()
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const token = searchParams.get('token')
    if (!token) {
      navigate('/', { replace: true })
      return
    }

    handleCallback(token)
      .then(() => navigate('/', { replace: true }))
      .catch(() => {
        // error is set in context, stay on page to show it
      })
  }, [searchParams, handleCallback, navigate])

  return (
    <div className={styles.callback}>
      {isLoading && (
        <div className={styles.state}>
          <div className={styles.spinner} />
          <h2>Connecting to Last.fm...</h2>
          <p className={styles.sub}>Exchanging token for session key</p>
        </div>
      )}

      {error && (
        <div className={styles.state}>
          <span className={styles.errorIcon}>⚠️</span>
          <h2>Authentication Failed</h2>
          <p className={styles.errorText}>{error}</p>
          <button className="neuro-btn" onClick={() => navigate('/', { replace: true })}>
            Back to Home
          </button>
        </div>
      )}
    </div>
  )
}
