import { useState, type FormEvent } from 'react'
import { X, Mail, Lock, Sun, Moon, Loader2, Check, Globe, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLang } from '../contexts/LangContext'
import { LANGS } from '../lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  theme: string
  onThemeChange: (t: string) => void
  onClearChats: () => Promise<void>
}

export default function Settings({ open, onClose, theme, onThemeChange, onClearChats }: Props) {
  const { user, updateEmail, updatePassword } = useAuth()
  const { t, lang, setLang } = useLang()

  const [newEmail, setNewEmail] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [emailStatus, setEmailStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [passStatus, setPassStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [loadingPass, setLoadingPass] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [clearingChats, setClearingChats] = useState(false)
  const [clearDone, setClearDone] = useState(false)

  if (!open) return null

  const handleEmail = async (e: FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return
    setEmailStatus(null)
    setLoadingEmail(true)
    const { error } = await updateEmail(newEmail.trim())
    setLoadingEmail(false)
    if (error) {
      setEmailStatus({ ok: false, text: error })
    } else {
      setEmailStatus({ ok: true, text: t('settings.emailSent') })
      setNewEmail('')
    }
  }

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPassStatus(null)
    if (newPass.length < 6) {
      setPassStatus({ ok: false, text: t('settings.min6') })
      return
    }
    if (newPass !== confirmPass) {
      setPassStatus({ ok: false, text: t('settings.noMatch') })
      return
    }
    setLoadingPass(true)
    const { error } = await updatePassword(newPass)
    setLoadingPass(false)
    if (error) {
      setPassStatus({ ok: false, text: error })
    } else {
      setPassStatus({ ok: true, text: t('settings.passwordUpdated') })
      setNewPass('')
      setConfirmPass('')
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <header className="settings__header">
          <h2>{t('settings.title')}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {/* Language */}
        <section className="settings__section">
          <h3 className="settings__label">
            <Globe size={15} style={{ opacity: 0.6 }} />
            {t('settings.language')}
          </h3>
          <div className="settings__lang-row">
            {LANGS.map((l) => (
              <button
                key={l.id}
                className={`settings__lang-btn ${lang === l.id ? 'settings__lang-btn--active' : ''}`}
                onClick={() => setLang(l.id)}
              >
                <span className="settings__lang-flag">{l.flag}</span>
                {l.name}
              </button>
            ))}
          </div>
        </section>

        <div className="settings__divider" />

        {/* Theme */}
        <section className="settings__section">
          <h3 className="settings__label">{t('settings.theme')}</h3>
          <div className="settings__theme-row">
            <button
              className={`settings__theme-btn ${theme === 'dark' ? 'settings__theme-btn--active' : ''}`}
              onClick={() => onThemeChange('dark')}
            >
              <Moon size={16} />
              {t('settings.dark')}
            </button>
            <button
              className={`settings__theme-btn ${theme === 'light' ? 'settings__theme-btn--active' : ''}`}
              onClick={() => onThemeChange('light')}
            >
              <Sun size={16} />
              {t('settings.light')}
            </button>
          </div>
        </section>

        <div className="settings__divider" />

        {/* Email */}
        <section className="settings__section">
          <h3 className="settings__label">{t('settings.email')}</h3>
          <p className="settings__current">{t('settings.currentEmail')} {user?.email}</p>
          <form className="settings__form" onSubmit={handleEmail}>
            <label className="settings__field">
              <Mail size={15} className="settings__field-icon" />
              <input
                type="email"
                placeholder={t('settings.newEmail')}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </label>
            <button className="settings__submit" type="submit" disabled={loadingEmail}>
              {loadingEmail ? <Loader2 size={16} className="spin" /> : t('settings.updateEmail')}
            </button>
          </form>
          {emailStatus && (
            <div className={`settings__msg ${emailStatus.ok ? 'settings__msg--ok' : 'settings__msg--err'}`}>
              {emailStatus.ok && <Check size={14} />}
              {emailStatus.text}
            </div>
          )}
        </section>

        <div className="settings__divider" />

        {/* Password */}
        <section className="settings__section">
          <h3 className="settings__label">{t('settings.password')}</h3>
          <form className="settings__form" onSubmit={handlePassword}>
            <label className="settings__field">
              <Lock size={15} className="settings__field-icon" />
              <input
                type="password"
                placeholder={t('settings.newPassword')}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                required
                minLength={6}
              />
            </label>
            <label className="settings__field">
              <Lock size={15} className="settings__field-icon" />
              <input
                type="password"
                placeholder={t('settings.confirmPassword')}
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                required
                minLength={6}
              />
            </label>
            <button className="settings__submit" type="submit" disabled={loadingPass}>
              {loadingPass ? <Loader2 size={16} className="spin" /> : t('settings.updatePassword')}
            </button>
          </form>
          {passStatus && (
            <div className={`settings__msg ${passStatus.ok ? 'settings__msg--ok' : 'settings__msg--err'}`}>
              {passStatus.ok && <Check size={14} />}
              {passStatus.text}
            </div>
          )}
        </section>

        <div className="settings__divider" />

        {/* Clear Chats */}
        <section className="settings__section">
          <h3 className="settings__label">
            <Trash2 size={15} style={{ opacity: 0.6 }} />
            {t('settings.clearChats')}
          </h3>
          {!clearConfirm ? (
            <button
              className="settings__danger-btn"
              onClick={() => setClearConfirm(true)}
              disabled={clearingChats}
            >
              <Trash2 size={14} />
              {t('settings.clearChatsBtn')}
            </button>
          ) : (
            <div className="settings__confirm">
              <p className="settings__confirm-text">{t('settings.clearChatsConfirm')}</p>
              <div className="settings__confirm-actions">
                <button
                  className="settings__danger-btn"
                  onClick={async () => {
                    setClearingChats(true)
                    await onClearChats()
                    setClearingChats(false)
                    setClearConfirm(false)
                    setClearDone(true)
                    setTimeout(() => setClearDone(false), 3000)
                  }}
                  disabled={clearingChats}
                >
                  {clearingChats ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                  {t('settings.clearChatsBtn')}
                </button>
                <button
                  className="settings__cancel-btn"
                  onClick={() => setClearConfirm(false)}
                >
                  {t('export.cancel')}
                </button>
              </div>
            </div>
          )}
          {clearDone && (
            <div className="settings__msg settings__msg--ok">
              <Check size={14} />
              {t('settings.clearChatsDone')}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
