import { useEffect, useState } from 'react'
import { X, Users, MessageCircle, Bot, Globe, Loader2 } from 'lucide-react'
import type { AdminSummary } from '../types'
import { loadAdminSummary } from '../lib/database'
import { useLang } from '../contexts/LangContext'

interface Props {
  open: boolean
  onClose: () => void
}

export default function AdminPanel({ open, onClose }: Props) {
  const { t } = useLang()
  const [data, setData] = useState<AdminSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    loadAdminSummary()
      .then((res) => setData(res))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Load error'))
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings admin-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings__header">
          <h2>{t('admin.title')}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <section className="settings__section">
          {loading ? (
            <div className="loading-screen">
              <Loader2 size={20} className="spin" />
            </div>
          ) : error ? (
            <div className="settings__msg settings__msg--err">{error}</div>
          ) : data ? (
            <>
              <div className="admin-cards">
                <div className="admin-card"><Bot size={16} /> <span>{t('admin.totalBots')}: {data.totalBots}</span></div>
                <div className="admin-card"><Globe size={16} /> <span>{t('admin.publicBots')}: {data.publicBots}</span></div>
                <div className="admin-card"><Users size={16} /> <span>{t('admin.totalConversations')}: {data.totalConversations}</span></div>
                <div className="admin-card"><MessageCircle size={16} /> <span>{t('admin.totalMessages')}: {data.totalMessages}</span></div>
              </div>

              <div className="settings__divider" style={{ margin: '14px 0' }} />

              <h3 className="settings__label">{t('admin.topBots')}</h3>
              <div className="bots-settings__list">
                {data.topBots.map((b) => (
                  <div key={b.id} className="bots-settings__item">
                    <div className="bots-settings__item-main">
                      <div className="bots-settings__item-name">{b.name}</div>
                      <div className="bots-settings__item-meta">@{b.username} · {b.useCount} {t('bots.uses')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}
