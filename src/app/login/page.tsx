import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySessionToken } from '@/lib/auth'
import styles from './login.module.css'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  // Already authed — skip to dashboard
  const jar = await cookies()
  const token = jar.get('maia_session')?.value
  const secret = process.env.SESSION_SECRET
  if (secret && token && verifySessionToken(token, secret)) {
    redirect('/dashboard')
  }

  const params = await searchParams
  const hasError = !!params.error

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.star} aria-hidden="true" />
          <span className={styles.wordmark}>MAIA</span>
        </div>

        <p className={styles.sub}>Command Centre</p>

        <form action="/api/auth/login" method="POST" className={styles.form}>
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            className={`${styles.input} ${hasError ? styles.inputError : ''}`}
            placeholder="Enter password"
          />
          {hasError && (
            <p className={styles.errorMsg} role="alert">
              Incorrect password
            </p>
          )}
          <button type="submit" className={styles.btn}>
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
