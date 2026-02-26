import { useMemo, useState } from 'react'
import { Bot, Search, X, Flame } from 'lucide-react'
import type { UserBot } from '../types'
import { MODELS } from '../types'
import { useLang } from '../contexts/LangContext'

interface Props {
  open: boolean
  bots: UserBot[]
  onClose: () => void
  onUseBot: (id: string) => void
}

export default function BotMarketplace({ open, bots, onClose, onUseBot }: Props) {
  const { t } = useLang()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = bots
      .filter((b) => b.isPublic)
      .sort((a, b) => b.useCount - a.useCount || +new Date(b.updatedAt) - +new Date(a.updatedAt))
    if (!q) return base
    return base.filter((b) =>
      [b.name, b.description, b.authorName, b.username].join(' ').toLowerCase().includes(q)
    )
  }, [bots, query])

  const trends = filtered.slice(0, 6)

  if (!open) return null

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings marketplace" onClick={(e) => e.stopPropagation()}>
        <header className="settings__header">
          <h2>{t('bots.marketplace')}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <section className="settings__section">
          <label className="settings__field">
            <Search size={15} className="settings__field-icon" />
            <input
              type="text"
              placeholder={t('bots.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </section>

        <div className="settings__divider" />

        <section className="settings__section">
          <h3 className="settings__label">
            <Flame size={15} style={{ opacity: 0.7 }} />
            {t('bots.trending')}
          </h3>
          <div className="marketplace__grid">
            {trends.length === 0 ? (
              <div className="sidebar__empty">{t('bots.marketplaceEmpty')}</div>
            ) : (
              trends.map((bot) => (
                <article key={bot.id} className="market-card">
                  <div className="market-card__header">
                    <img
                      className="market-card__avatar"
                      src={bot.avatarUrl || `${import.meta.env.BASE_URL}logo.jpg`}
                      alt={bot.name}
                    />
                    <div className="market-card__meta">
                      <div className="market-card__name">{bot.name}</div>
                      <div className="market-card__author">
                        @{bot.username} · {bot.authorName || t('bots.unknownAuthor')}
                      </div>
                    </div>
                  </div>
                  <div className="market-card__desc">{bot.description || t('bots.noneDesc')}</div>
                  <div className="market-card__footer">
                    <span className="market-card__model">
                      {MODELS.find((m) => m.id === bot.model)?.name || bot.model}
                    </span>
                    <span className="market-card__uses">{bot.useCount} {t('bots.uses')}</span>
                  </div>
                  <button
                    className="settings__submit market-card__btn"
                    onClick={() => {
                      onUseBot(bot.id)
                      onClose()
                    }}
                  >
                    <Bot size={14} />
                    {t('bots.use')}
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
