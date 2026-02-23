import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Mail, Lock, ArrowRight, Loader2, KeyRound } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLang } from '../contexts/LangContext'
import { LANGS, type Lang } from '../lib/i18n'

type View = 'login' | 'register' | 'verify'

export default function AuthPage() {
  const { signUp, signIn, verifyOtp } = useAuth()
  const { t, lang, setLang } = useLang()

  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setLoading(false)
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setError(t('auth.passwordMin'))
      return
    }
    setError('')
    setLoading(true)
    const { error } = await signUp(email, password)
    if (error) {
      setError(error)
      setLoading(false)
      return
    }
    setLoading(false)
    setView('verify')
  }

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await verifyOtp(email, otp)
    if (error) setError(error)
    setLoading(false)
  }

  const formRef = useRef<HTMLDivElement>(null)

  const switchTo = (v: View) => {
    const el = formRef.current
    if (el) {
      el.classList.add('auth__form-exit')
      setTimeout(() => {
        setView(v)
        setError('')
        el.classList.remove('auth__form-exit')
      }, 150)
    } else {
      setView(v)
      setError('')
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__lang-row">
          {LANGS.map((l) => (
            <button
              key={l.id}
              className={`auth__lang-btn ${lang === l.id ? 'auth__lang-btn--active' : ''}`}
              onClick={() => setLang(l.id)}
            >
              <span className="auth__lang-flag">{l.flag}</span>
              {l.name}
            </button>
          ))}
        </div>

        <div className="auth__brand">
          <img src="/logo.jpg" alt="AI Lumiere" className="auth__logo-img" />
          <h1 className="auth__title">AI Lumiere</h1>
          <p className="auth__subtitle">
            {view === 'verify' ? t('auth.verifyTitle') : t('auth.subtitle')}
          </p>
        </div>

        {view !== 'verify' && (
          <div className="auth__tabs">
            <button
              className={`auth__tab ${view === 'login' ? 'auth__tab--active' : ''}`}
              onClick={() => switchTo('login')}
            >
              {t('auth.login')}
            </button>
            <button
              className={`auth__tab ${view === 'register' ? 'auth__tab--active' : ''}`}
              onClick={() => switchTo('register')}
            >
              {t('auth.register')}
            </button>
          </div>
        )}

        {error && <div className="auth__error">{error}</div>}

        <div ref={formRef} className="auth__form-wrapper" key={view}>
        {view === 'login' && (
          <form className="auth__form" onSubmit={handleLogin}>
            <label className="auth__field">
              <Mail size={16} className="auth__field-icon" />
              <input
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="auth__field">
              <Lock size={16} className="auth__field-icon" />
              <input
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <button className="auth__submit" type="submit" disabled={loading}>
              {loading ? <Loader2 size={18} className="spin" /> : <><span>{t('auth.signIn')}</span><ArrowRight size={16} /></>}
            </button>
          </form>
        )}

        {view === 'register' && (
          <form className="auth__form" onSubmit={handleRegister}>
            <label className="auth__field">
              <Mail size={16} className="auth__field-icon" />
              <input
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>
            <label className="auth__field">
              <Lock size={16} className="auth__field-icon" />
              <input
                type="password"
                placeholder={t('auth.passwordMinPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </label>
            <button className="auth__submit" type="submit" disabled={loading}>
              {loading ? <Loader2 size={18} className="spin" /> : <><span>{t('auth.createAccount')}</span><ArrowRight size={16} /></>}
            </button>
          </form>
        )}

        {view === 'verify' && (
          <form className="auth__form" onSubmit={handleVerify}>
            <p className="auth__verify-text">
              {t('auth.otpSent')}<br />
              <strong>{email}</strong>
            </p>
            <label className="auth__field">
              <KeyRound size={16} className="auth__field-icon" />
              <input
                type="text"
                placeholder={t('auth.otpPlaceholder')}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                autoComplete="one-time-code"
                maxLength={6}
              />
            </label>
            <button className="auth__submit" type="submit" disabled={loading}>
              {loading ? <Loader2 size={18} className="spin" /> : <><span>{t('auth.confirm')}</span><ArrowRight size={16} /></>}
            </button>
            <button
              type="button"
              className="auth__link"
              onClick={() => switchTo('login')}
            >
              {t('auth.alreadyConfirmed')}
            </button>
          </form>
        )}
        </div>

        <div className="auth__footer">AI Lumiere © 2026</div>
      </div>
    </div>
  )
}
