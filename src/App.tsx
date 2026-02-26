import { useState, useEffect, useRef, useCallback } from 'react'
import type { Conversation, Message, FileAttachment, UserBot } from './types'
import { MODELS } from './types'
import { streamChat } from './api'
import * as db from './lib/database'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LangProvider, useLang } from './contexts/LangContext'
import AuthPage from './components/AuthPage'
import Sidebar from './components/Sidebar'
import Chat from './components/Chat'
import WelcomeScreen from './components/WelcomeScreen'
import ModelSelector from './components/ModelSelector'
import BotSelector from './components/BotSelector'
import BotMarketplace from './components/BotMarketplace'
import AdminPanel from './components/AdminPanel'
import InputArea from './components/InputArea'
import Settings from './components/Settings'
import { PanelLeftClose, PanelLeft, Sparkles, Sun, Moon, Store, Shield } from 'lucide-react'

const MODEL_KEY = 'ai-lumiere-model'
const THEME_KEY = 'ai-lumiere-theme'
const BOT_KEY = 'ai-lumiere-selected-bot'
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || 'safievmarat65@gmail.com')
  .split(',')
  .map((x: string) => x.trim().toLowerCase())
  .filter(Boolean)

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </LangProvider>
  )
}

function AppRouter() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <Sparkles size={36} className="loading-icon" />
        <span>AI Lumiere</span>
      </div>
    )
  }

  if (!user) return <AuthPage />
  return <ChatApp />
}

function ChatApp() {
  const { user, signOut } = useAuth()
  const { t } = useLang()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem(MODEL_KEY) || 'openai/gpt-oss-120b'
  )
  const [bots, setBots] = useState<UserBot[]>([])
  const [publicBots, setPublicBots] = useState<UserBot[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string | null>(
    () => localStorage.getItem(BOT_KEY) || null
  )
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 768 : true
  )
  const [isStreaming, setIsStreaming] = useState(false)
  const [dbLoading, setDbLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) || 'dark'
  )
  const abortRef = useRef<AbortController | null>(null)
  const streamContentRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingFlushRef = useRef<{ convId: string; msgId: string } | null>(null)
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const allBots = [...bots, ...publicBots.filter((p) => !bots.some((b) => b.id === p.id))]
  const botsRef = useRef(allBots)
  botsRef.current = allBots

  const flushStreamContent = useCallback(() => {
    const pending = pendingFlushRef.current
    if (!pending) return
    const snapshot = streamContentRef.current
    const { convId, msgId } = pending
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === msgId ? { ...m, content: snapshot } : m
              ),
            }
          : c
      )
    )
  }, [])

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? null
  const selectedBot = allBots.find((b) => b.id === selectedBotId) || null
  const isAdmin = ADMIN_EMAILS.includes((user?.email || '').toLowerCase())

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!user) return
    setDbError(null)
    db.loadConversations(user.id)
      .then((convs) => {
        setConversations(convs)
        setDbLoading(false)
      })
      .catch((err) => {
        console.error('[AI Lumiere] DB load error:', err)
        setDbError(t('app.loadError'))
        setDbLoading(false)
      })

    db.loadBots(user.id)
      .then((list) => setBots(list))
      .catch((err) => {
        console.error('[AI Lumiere] Bots load error:', err)
        setBots([])
      })

    db.loadPublicBots(200)
      .then((list) => setPublicBots(list))
      .catch((err) => {
        console.error('[AI Lumiere] Public bots load error:', err)
        setPublicBots([])
      })
  }, [user])

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, selectedModel)
  }, [selectedModel])

  useEffect(() => {
    if (selectedBotId) localStorage.setItem(BOT_KEY, selectedBotId)
    else localStorage.removeItem(BOT_KEY)
  }, [selectedBotId])

  useEffect(() => {
    if (selectedBotId && !allBots.some((b) => b.id === selectedBotId)) {
      setSelectedBotId(null)
    }
  }, [allBots, selectedBotId])

  const toggleTheme = useCallback(
    () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
    []
  )

  const closeSidebarOnMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      setSidebarOpen(false)
    }
  }, [])

  const handleNewChat = useCallback(() => {
    if (isStreaming) {
      abortRef.current?.abort()
      setIsStreaming(false)
    }
    setActiveId(null)
    closeSidebarOnMobile()
  }, [isStreaming, closeSidebarOnMobile])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id)
      closeSidebarOnMobile()
    },
    [closeSidebarOnMobile]
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) setActiveId(null)
      db.deleteConversation(id).catch((err) =>
        console.error('[AI Lumiere] Delete error:', err)
      )
    },
    [activeId]
  )

  const handleClearChats = useCallback(async () => {
    if (isStreaming) {
      abortRef.current?.abort()
      setIsStreaming(false)
    }
    const ids = conversationsRef.current.map((c) => c.id)
    setConversations([])
    setActiveId(null)
    for (const id of ids) {
      db.deleteConversation(id).catch((err) =>
        console.error('[AI Lumiere] Clear chat error:', err)
      )
    }
  }, [isStreaming])

  const handleRetryLoad = useCallback(() => {
    if (!user) return
    setDbLoading(true)
    setDbError(null)
    db.loadConversations(user.id)
      .then((convs) => {
        setConversations(convs)
        setDbLoading(false)
      })
      .catch((err) => {
        console.error('[AI Lumiere] Retry load error:', err)
        setDbError(t('app.loadErrorShort'))
        setDbLoading(false)
      })
  }, [user, t])

  const handleCreateBot = useCallback(
    async (draft: Pick<UserBot, 'name' | 'description' | 'model' | 'systemPrompt' | 'authorName' | 'isPublic' | 'username' | 'avatarUrl' | 'mediaLinks'>) => {
      if (!user) return
      const created = await db.createBot(user.id, draft)
      setBots((prev) => [created, ...prev])
      setSelectedBotId(created.id)
      if (created.isPublic) setPublicBots((prev) => [created, ...prev])
    },
    [user]
  )

  const handleUpdateBot = useCallback(
    async (id: string, draft: Pick<UserBot, 'name' | 'description' | 'model' | 'systemPrompt' | 'authorName' | 'isPublic' | 'avatarUrl' | 'mediaLinks' | 'username'>) => {
      const updated = await db.updateBot(id, draft)
      setBots((prev) => prev.map((b) => (b.id === id ? updated : b)))
      setPublicBots((prev) => {
        const without = prev.filter((b) => b.id !== id)
        return updated.isPublic ? [updated, ...without] : without
      })
    },
    []
  )

  const handleDeleteBot = useCallback(
    async (id: string) => {
      await db.deleteBot(id)
      setBots((prev) => prev.filter((b) => b.id !== id))
      setPublicBots((prev) => prev.filter((b) => b.id !== id))
      if (selectedBotId === id) setSelectedBotId(null)
    },
    [selectedBotId]
  )

  useEffect(() => {
    if (!user) return
    const botSlug = new URLSearchParams(window.location.search).get('bot')
    if (!botSlug) return
    db.loadPublicBotBySlug(botSlug)
      .then((bot) => {
        if (!bot) return
        setPublicBots((prev) => (prev.some((b) => b.id === bot.id) ? prev : [bot, ...prev]))
        setSelectedBotId(bot.id)
        setActiveId(null)
      })
      .then(() => {
        const cleanUrl = `${window.location.origin}${window.location.pathname}`
        window.history.replaceState(null, '', cleanUrl)
      })
      .catch((err) => console.error('[AI Lumiere] Shared bot load error:', err))
  }, [user])

  const handleSend = useCallback(
    async (content: string, files?: FileAttachment[]) => {
      if (isStreaming || (!content.trim() && !files?.length) || !user) return

      const activeBot = selectedBotId
        ? botsRef.current.find((b) => b.id === selectedBotId) || null
        : null
      const model = activeBot?.model || selectedModel
      if (activeBot) {
        db.incrementBotUsage(activeBot.id).catch((err) =>
          console.error('[AI Lumiere] Bot usage increment failed:', err)
        )
      }
      let convId = activeId
      let prevMessages: Message[] = []
      const userMsgId = crypto.randomUUID()
      const userMsg: Message = {
        id: userMsgId,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        files,
      }

      const assistantMsgId = crypto.randomUUID()
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        model,
        timestamp: new Date().toISOString(),
      }

      if (!convId) {
        convId = crypto.randomUUID()
        const titleText =
          content || files?.map((f) => f.name).join(', ') || t('app.newChat')
        const title =
          titleText.length > 60 ? titleText.slice(0, 60) + '…' : titleText
        const newConv: Conversation = {
          id: convId,
          title,
          messages: [userMsg, assistantMsg],
          model,
          createdAt: new Date().toISOString(),
        }
        setConversations((prev) => [newConv, ...prev])
        setActiveId(convId)

        try {
          await db.createConversation(convId, user.id, title, model)
        } catch (err) {
          console.error('[AI Lumiere] Create conversation failed:', err)
        }
      } else {
        prevMessages =
          conversationsRef.current.find((c) => c.id === convId)?.messages ?? []
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, messages: [...c.messages, userMsg, assistantMsg] }
              : c
          )
        )
      }

      db.addMessage(userMsgId, convId, 'user', content).catch((err) =>
        console.error('[AI Lumiere] Save user msg failed:', err)
      )
      db.addMessage(assistantMsgId, convId, 'assistant', '', model).catch(
        (err) => console.error('[AI Lumiere] Save assistant msg failed:', err)
      )

      setIsStreaming(true)
      streamContentRef.current = ''

      const apiMessages = [
        ...(activeBot?.systemPrompt.trim()
          ? [{ role: 'system' as const, content: activeBot.systemPrompt.trim() }]
          : []),
        ...prevMessages.map((m) => ({
          role: m.role,
          content: m.content,
          files: m.files,
        })),
        { role: 'user' as const, content, files },
      ]

      const ctrl = new AbortController()
      abortRef.current = ctrl

      const finalConvId = convId
      pendingFlushRef.current = { convId: finalConvId, msgId: assistantMsgId }

      await streamChat(
        apiMessages,
        model,
        (token) => {
          streamContentRef.current += token
          if (!flushTimerRef.current) {
            flushTimerRef.current = setTimeout(() => {
              flushTimerRef.current = null
              flushStreamContent()
            }, 40)
          }
        },
        () => {
          if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current)
            flushTimerRef.current = null
          }
          flushStreamContent()
          pendingFlushRef.current = null
          setIsStreaming(false)
          db.updateMessageContent(
            assistantMsgId,
            streamContentRef.current
          ).catch((err) =>
            console.error('[AI Lumiere] Update msg content failed:', err)
          )
        },
        (errMsg) => {
          if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current)
            flushTimerRef.current = null
          }
          pendingFlushRef.current = null
          const errorContent = `⚠ ${errMsg}`
          setConversations((prev) =>
            prev.map((c) =>
              c.id === finalConvId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: errorContent }
                        : m
                    ),
                  }
                : c
            )
          )
          setIsStreaming(false)
          db.updateMessageContent(assistantMsgId, errorContent).catch((err) =>
            console.error('[AI Lumiere] Update error content failed:', err)
          )
        },
        ctrl.signal
      )
    },
    [isStreaming, selectedModel, selectedBotId, activeId, user, t]
  )

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    const lastMsg = conversationsRef.current
      .find((c) => c.id === activeId)
      ?.messages.slice(-1)[0]
    if (lastMsg?.id) {
      db.updateMessageContent(lastMsg.id, streamContentRef.current).catch(
        (err) => console.error('[AI Lumiere] Stop save failed:', err)
      )
    }
  }, [activeId])

  return (
    <div className={`app ${sidebarOpen ? '' : 'app--sidebar-closed'}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        onDelete={handleDeleteConversation}
        userEmail={user?.email}
        onSignOut={signOut}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="main">
        <header className="main__header">
          <button
            className="icon-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={t('app.toggleSidebar')}
          >
            {sidebarOpen ? (
              <PanelLeftClose size={20} />
            ) : (
              <PanelLeft size={20} />
            )}
          </button>
          <BotSelector
            bots={bots}
            selectedBot={selectedBot}
            selectedBotId={selectedBotId}
            onSelect={setSelectedBotId}
            onCreate={handleCreateBot}
            onUpdate={handleUpdateBot}
            onDelete={handleDeleteBot}
          />
          <button className="icon-btn" onClick={() => setMarketOpen(true)} title={t('bots.marketplace')}>
            <Store size={18} />
          </button>
          {selectedBot ? (
            <button
              className="model-selector__trigger"
              disabled
              title={t('bots.modelLocked')}
            >
              {MODELS.find((m) => m.id === selectedBot.model)?.name || selectedBot.model}
            </button>
          ) : (
            <ModelSelector
              selected={selectedModel}
              onChange={setSelectedModel}
            />
          )}
          <div className="main__header-right">
            {isAdmin && (
              <button
                className="icon-btn"
                onClick={() => setAdminOpen(true)}
                aria-label={t('admin.title')}
              >
                <Shield size={18} />
              </button>
            )}
            <button
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={t('app.toggleTheme')}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <div className="main__content">
          {dbLoading ? (
            <div className="loading-screen">
              <Sparkles size={28} className="loading-icon" />
            </div>
          ) : dbError ? (
            <div className="error-state">
              <p>{dbError}</p>
              <button className="error-state__retry" onClick={handleRetryLoad}>
                {t('app.retry')}
              </button>
            </div>
          ) : activeConversation ? (
            <Chat
              conversation={activeConversation}
              isStreaming={isStreaming}
            />
          ) : (
            <WelcomeScreen onSuggestionClick={handleSend} />
          )}
        </div>

        <div className="main__input">
          <InputArea
            onSend={handleSend}
            isStreaming={isStreaming}
            onStop={handleStop}
          />
        </div>
      </main>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        onClearChats={handleClearChats}
      />

      <BotMarketplace
        open={marketOpen}
        bots={publicBots}
        onClose={() => setMarketOpen(false)}
        onUseBot={(id) => {
          setSelectedBotId(id)
          setActiveId(null)
          closeSidebarOnMobile()
        }}
      />

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />

    </div>
  )
}
