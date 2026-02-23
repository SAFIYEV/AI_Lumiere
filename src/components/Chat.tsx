import { useEffect, useRef, useCallback } from 'react'
import { MessageSquareOff } from 'lucide-react'
import type { Conversation } from '../types'
import Message from './Message'
import { useLang } from '../contexts/LangContext'

interface Props {
  conversation: Conversation
  isStreaming: boolean
}

export default function Chat({ conversation, isStreaming }: Props) {
  const { t } = useLang()
  const containerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  const checkNearBottom = useCallback(() => {
    const el = containerRef.current?.parentElement
    if (!el) return
    const threshold = 120
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  useEffect(() => {
    const el = containerRef.current?.parentElement
    if (!el) return
    el.addEventListener('scroll', checkNearBottom, { passive: true })
    return () => el.removeEventListener('scroll', checkNearBottom)
  }, [checkNearBottom])

  useEffect(() => {
    if (!isNearBottomRef.current) return
    const el = containerRef.current?.parentElement
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [conversation.messages])

  if (!conversation.messages.length) {
    return (
      <div className="chat chat--empty">
        <MessageSquareOff size={40} strokeWidth={1.2} />
        <p>{t('chat.empty')}</p>
        <span>{t('chat.emptyHint')}</span>
      </div>
    )
  }

  return (
    <div className="chat" ref={containerRef}>
      <div className="chat__messages">
        {conversation.messages.map((msg, i) => {
          const isLast = i === conversation.messages.length - 1
          const showStreaming = isStreaming && isLast && msg.role === 'assistant'
          return <Message key={msg.id} message={msg} isStreaming={showStreaming} />
        })}
      </div>
    </div>
  )
}
