import { useMemo, useRef, useState, useEffect } from 'react'
import { Bot, ChevronDown, Check, Pencil, Trash2, X, Loader2, Plus } from 'lucide-react'
import { MODELS, type UserBot } from '../types'
import { useLang } from '../contexts/LangContext'

type BotDraft = {
  name: string
  authorName: string
  username: string
  description: string
  model: string
  systemPrompt: string
  isPublic: boolean
  avatarUrl: string
  mediaLinks: string[]
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('avatar_read_error'))
    reader.readAsDataURL(file)
  })
}

interface Props {
  bots: UserBot[]
  selectedBot: UserBot | null
  selectedBotId: string | null
  onSelect: (id: string | null) => void
  onCreate: (draft: BotDraft) => Promise<void>
  onUpdate: (id: string, draft: BotDraft) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const emptyDraft = (fallbackModel: string): BotDraft => ({
  name: '',
  authorName: '',
  username: '',
  description: '',
  model: fallbackModel,
  systemPrompt: '',
  isPublic: false,
  avatarUrl: '',
  mediaLinks: [''],
})

export default function BotSelector({
  bots,
  selectedBot,
  selectedBotId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const ownSelectedBot = useMemo(
    () => bots.find((b) => b.id === selectedBotId) || null,
    [bots, selectedBotId]
  )

  return (
    <>
      <div className="bot-selector" ref={ref}>
        <button className="bot-selector__trigger" onClick={() => setOpen((v) => !v)}>
          <Bot size={14} />
          <span>{selectedBot?.name || t('bots.none')}</span>
          <ChevronDown size={15} style={{ opacity: 0.5 }} />
        </button>

        {open && (
          <div className="bot-selector__dropdown">
            <button
              className={`bot-option ${!selectedBotId ? 'bot-option--active' : ''}`}
              onClick={() => {
                onSelect(null)
                setOpen(false)
              }}
            >
              <div className="bot-option__main">
                <div className="bot-option__name">{t('bots.none')}</div>
                <div className="bot-option__desc">{t('bots.noneDesc')}</div>
              </div>
              {!selectedBotId && <Check size={16} className="bot-option__check" />}
            </button>

            {bots.map((bot) => (
              <button
                key={bot.id}
                className={`bot-option ${bot.id === selectedBotId ? 'bot-option--active' : ''}`}
                onClick={() => {
                  onSelect(bot.id)
                  setOpen(false)
                }}
              >
                <div className="bot-option__main">
                  <div className="bot-option__name">{bot.name}</div>
                  <div className="bot-option__desc">
                    {MODELS.find((m) => m.id === bot.model)?.name || bot.model}
                  </div>
                </div>
                {bot.id === ownSelectedBot?.id && <Check size={16} className="bot-option__check" />}
              </button>
            ))}

            <div className="bot-selector__footer">
              <button
                className="bot-selector__manage-btn"
                onClick={() => {
                  setManageOpen(true)
                  setOpen(false)
                }}
              >
                {t('bots.manage')}
              </button>
            </div>
          </div>
        )}
      </div>

      {manageOpen && (
        <BotManagerModal
          bots={bots}
          onClose={() => setManageOpen(false)}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </>
  )
}

function BotManagerModal({
  bots,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  bots: UserBot[]
  onClose: () => void
  onCreate: (draft: BotDraft) => Promise<void>
  onUpdate: (id: string, draft: BotDraft) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const { t } = useLang()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<BotDraft>(() => emptyDraft(MODELS[0].id))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const startCreate = () => {
    setEditingId(null)
    setDraft(emptyDraft(MODELS[0].id))
    setError('')
  }

  const startEdit = (bot: UserBot) => {
    setEditingId(bot.id)
    setDraft({
      name: bot.name,
      authorName: bot.authorName,
      username: bot.username,
      description: bot.description,
      model: bot.model,
      systemPrompt: bot.systemPrompt,
      isPublic: bot.isPublic,
      avatarUrl: bot.avatarUrl,
      mediaLinks: bot.mediaLinks.length ? bot.mediaLinks : [''],
    })
    setError('')
  }

  useEffect(() => {
    if (!editingId) return
    const bot = bots.find((b) => b.id === editingId)
    if (!bot) startCreate()
  }, [bots, editingId])

  const submit = async () => {
    const name = draft.name.trim()
    const username = draft.username.trim().toLowerCase()
    const systemPrompt = draft.systemPrompt.trim()
    if (!name || !systemPrompt || (!editingId && !username)) {
      setError(t('bots.validation'))
      return
    }
    if (!editingId) {
      if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        setError(t('bots.usernameFormat'))
        return
      }
      if (/(ai|lumiere|safiyev|marat)/.test(username)) {
        setError(t('bots.usernameForbidden'))
        return
      }
    }

    setLoading(true)
    setError('')
    try {
      const cleanedMedia = draft.mediaLinks.map((x) => x.trim()).filter(Boolean)
      if (editingId) {
        await onUpdate(editingId, {
          ...draft,
          name,
          systemPrompt,
          mediaLinks: cleanedMedia,
        })
      } else {
        await onCreate({
          ...draft,
          name,
          username,
          systemPrompt,
          mediaLinks: cleanedMedia,
        })
      }
      startCreate()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('bots.saveError'))
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm(t('bots.deleteConfirm'))) return
    setLoading(true)
    setError('')
    try {
      await onDelete(id)
      if (editingId === id) startCreate()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('bots.deleteError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings bots-settings" onClick={(e) => e.stopPropagation()}>
        <header className="settings__header">
          <h2>{t('bots.title')}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <section className="settings__section">
          <div className="bots-settings__list">
            {bots.length === 0 ? (
              <div className="sidebar__empty">{t('bots.empty')}</div>
            ) : (
              bots.map((bot) => (
                <div key={bot.id} className="bots-settings__item">
                  <div className="bots-settings__item-main">
                    <div className="bots-settings__item-name">{bot.name}</div>
                    <div className="bots-settings__item-meta">
                      {MODELS.find((m) => m.id === bot.model)?.name || bot.model}
                    </div>
                  </div>
                  <img
                    className="bots-settings__avatar"
                    src={bot.avatarUrl || `${import.meta.env.BASE_URL}logo.jpg`}
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = `${import.meta.env.BASE_URL}logo.jpg`
                    }}
                    alt={bot.name}
                  />
                  <button className="sidebar__action-btn" onClick={() => startEdit(bot)} disabled={loading}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="sidebar__action-btn sidebar__action-btn--danger"
                    onClick={() => remove(bot.id)}
                    disabled={loading}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="settings__divider" />

        <section className="settings__section">
          <h3 className="settings__label">
            {editingId ? t('bots.edit') : t('bots.create')}
          </h3>

          <div className="settings__form">
            <label className="settings__field">
              <input
                type="text"
                placeholder={t('bots.name')}
                value={draft.name}
                onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                maxLength={64}
              />
            </label>

            <label className="settings__field">
              <span className="bots-settings__prefix">@</span>
              <input
                type="text"
                placeholder={t('bots.username')}
                value={draft.username}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))
                }
                maxLength={24}
                disabled={Boolean(editingId)}
              />
            </label>

            <label className="settings__field">
              <input
                type="text"
                placeholder={t('bots.authorName')}
                value={draft.authorName}
                onChange={(e) => setDraft((prev) => ({ ...prev, authorName: e.target.value }))}
                maxLength={64}
              />
            </label>

            <label className="settings__field">
              <input
                type="text"
                placeholder={t('bots.description')}
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                maxLength={140}
              />
            </label>

            <label className="settings__field">
              <input
                type="url"
                placeholder={t('bots.avatarUrl')}
                value={draft.avatarUrl}
                onChange={(e) => setDraft((prev) => ({ ...prev, avatarUrl: e.target.value }))}
              />
            </label>

            <button
              className="settings__cancel-btn"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*'
                input.style.display = 'none'
                document.body.appendChild(input)
                input.addEventListener('change', async () => {
                  const f = input.files?.[0]
                  if (f) {
                    try {
                      const dataUrl = await fileToDataUrl(f)
                      setDraft((prev) => ({ ...prev, avatarUrl: dataUrl }))
                    } catch {
                      setError(t('bots.saveError'))
                    }
                  }
                  document.body.removeChild(input)
                })
                input.click()
              }}
            >
              {t('bots.uploadAvatar')}
            </button>

            <label className="settings__field">
              <select
                className="bots-settings__select"
                value={draft.model}
                onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            <textarea
              className="bots-settings__prompt"
              placeholder={t('bots.systemPrompt')}
              value={draft.systemPrompt}
              onChange={(e) => setDraft((prev) => ({ ...prev, systemPrompt: e.target.value }))}
              rows={6}
            />

            <label className="bots-settings__checkbox">
              <input
                type="checkbox"
                checked={draft.isPublic}
                onChange={(e) => setDraft((prev) => ({ ...prev, isPublic: e.target.checked }))}
              />
              <span>{t('bots.publish')}</span>
            </label>

            <div className="bots-settings__links">
              <div className="bots-settings__links-title">{t('bots.mediaLinks')}</div>
              {draft.mediaLinks.map((link, idx) => (
                <div key={idx} className="bots-settings__link-row">
                  <input
                    className="bots-settings__link-input"
                    type="url"
                    placeholder={t('bots.mediaLinkPlaceholder')}
                    value={link}
                    onChange={(e) =>
                      setDraft((prev) => {
                        const next = [...prev.mediaLinks]
                        next[idx] = e.target.value
                        return { ...prev, mediaLinks: next }
                      })
                    }
                  />
                  {draft.mediaLinks.length > 1 && (
                    <button
                      className="settings__cancel-btn"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          mediaLinks: prev.mediaLinks.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                className="settings__cancel-btn"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    mediaLinks: [...prev.mediaLinks, ''],
                  }))
                }
              >
                <Plus size={14} />
              </button>
            </div>

            {editingId && (
              <div className="bots-settings__share">
                <span className="bots-settings__share-label">{t('bots.shareLink')}</span>
                <button
                  className="settings__cancel-btn"
                  onClick={() => {
                    const bot = bots.find((b) => b.id === editingId)
                    if (!bot) return
                    const url = `${window.location.origin}${import.meta.env.BASE_URL}?bot=${bot.slug}`
                    navigator.clipboard.writeText(url).catch(() => {})
                  }}
                >
                  {t('bots.copyLink')}
                </button>
              </div>
            )}

            {error && <div className="settings__msg settings__msg--err">{error}</div>}

            <button className="settings__submit" onClick={submit} disabled={loading}>
              {loading ? <Loader2 size={14} className="spin" /> : null}
              {editingId ? t('bots.save') : t('bots.create')}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
