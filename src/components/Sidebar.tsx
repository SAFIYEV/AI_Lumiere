import {
  Plus,
  Trash2,
  MessageSquare,
  LogOut,
  User,
  SettingsIcon,
} from 'lucide-react'
import type { Conversation } from '../types'
import { useLang } from '../contexts/LangContext'

interface Props {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
  userEmail?: string
  onSignOut: () => void
  onOpenSettings: () => void
}

function useTimeAgo() {
  const { t, lang } = useLang()

  return (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('sidebar.justNow')
    if (mins < 60) return `${mins} ${t('sidebar.minsAgo')}`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} ${t('sidebar.hoursAgo')}`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days} ${t('sidebar.daysAgo')}`
    const locale = lang === 'kz' ? 'kk-KZ' : lang === 'en' ? 'en-US' : 'ru-RU'
    return new Date(dateStr).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
    })
  }
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  userEmail,
  onSignOut,
  onOpenSettings,
}: Props) {
  const { t } = useLang()
  const timeAgo = useTimeAgo()

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div className="sidebar__logo">
          <img src="/logo.jpg" alt="AI Lumiere" className="sidebar__logo-img" />
          <span>AI Lumiere</span>
        </div>
      </div>

      <button className="sidebar__new-chat" onClick={onNewChat}>
        <Plus size={16} />
        {t('sidebar.newChat')}
      </button>

      <div className="sidebar__conversations">
        {conversations.length === 0 ? (
          <div className="sidebar__empty">{t('sidebar.empty')}</div>
        ) : (
          conversations.map((c) => (
            <div
              key={c.id}
              className={`conv-item ${c.id === activeId ? 'conv-item--active' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <MessageSquare
                size={16}
                style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
              />
              <div className="conv-item__text">
                <div className="conv-item__title">{c.title}</div>
                <div className="conv-item__meta">{timeAgo(c.createdAt)}</div>
              </div>
              <button
                className="conv-item__delete"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(c.id)
                }}
                aria-label={t('sidebar.delete')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar__user">
        <div className="sidebar__user-info">
          <div className="sidebar__user-avatar">
            <User size={16} />
          </div>
          <span className="sidebar__user-email">{userEmail}</span>
        </div>
        <button
          className="sidebar__action-btn"
          onClick={onOpenSettings}
          aria-label={t('sidebar.settings')}
        >
          <SettingsIcon size={16} />
        </button>
        <button
          className="sidebar__action-btn sidebar__action-btn--danger"
          onClick={onSignOut}
          aria-label={t('sidebar.signOut')}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
