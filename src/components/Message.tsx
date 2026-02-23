import { useState, useMemo, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { User, Sparkles, FileDown, FileText, Image as ImageIcon } from 'lucide-react'
import type { Message as MessageType } from '../types'
import { MODELS } from '../types'
import { formatFileSize } from '../lib/fileProcessor'
import { useLang } from '../contexts/LangContext'
import ExportPreview from './ExportPreview'

function normalizeMath(text: string): string {
  text = text.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, inner) => `$$\n${inner.trim()}\n$$`)
  text = text.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_m, inner) => `$${inner.trim()}$`)
  return text
}

function cleanContent(raw: string): string {
  const codeBlocks: string[] = []
  let text = raw.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match)
    return `\x00CB${codeBlocks.length - 1}\x00`
  })
  const inlineCodes: string[] = []
  text = text.replace(/`[^`]+`/g, (match) => {
    inlineCodes.push(match)
    return `\x00IC${inlineCodes.length - 1}\x00`
  })

  text = normalizeMath(text)

  const mathBlocks: string[] = []
  text = text.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
    mathBlocks.push(match)
    return `\x00MB${mathBlocks.length - 1}\x00`
  })
  const inlineMath: string[] = []
  text = text.replace(/\$[^$\n]+\$/g, (match) => {
    inlineMath.push(match)
    return `\x00IM${inlineMath.length - 1}\x00`
  })

  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
  text = text.replace(/<think>[\s\S]*$/gi, '')
  text = text.replace(/<\/?[a-z][a-z0-9]*\b[^>]*\/?>/gi, '')

  inlineMath.forEach((m, i) => {
    text = text.replace(`\x00IM${i}\x00`, m)
  })
  mathBlocks.forEach((m, i) => {
    text = text.replace(`\x00MB${i}\x00`, m)
  })
  inlineCodes.forEach((code, i) => {
    text = text.replace(`\x00IC${i}\x00`, code)
  })
  codeBlocks.forEach((block, i) => {
    text = text.replace(`\x00CB${i}\x00`, block)
  })

  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [rehypeKatex]

interface Props {
  message: MessageType
  isStreaming: boolean
}

const MessageComponent = memo(function MessageComponent({ message, isStreaming }: Props) {
  const { t } = useLang()
  const isUser = message.role === 'user'
  const modelInfo = message.model ? MODELS.find((m) => m.id === message.model) : null
  const [showExport, setShowExport] = useState(false)

  const displayContent = useMemo(
    () => (isUser ? message.content : cleanContent(message.content)),
    [message.content, isUser]
  )

  const hasContent = displayContent && displayContent.length > 20

  return (
    <div className={`message message--${message.role}`}>
      <div className="message__avatar">
        {isUser ? <User size={17} /> : <Sparkles size={17} />}
      </div>

      <div className="message__body">
        <div className="message__role">
          {isUser ? t('message.you') : 'AI Lumiere'}
          {modelInfo && <span className="message__model-badge">{modelInfo.name}</span>}
        </div>

        {isUser && message.files && message.files.length > 0 && (
          <div className="message__files">
            {message.files.map((f) => (
              <div key={f.id} className="message__file-chip">
                {f.type === 'image' && f.preview ? (
                  <img src={f.preview} alt={f.name} className="message__file-thumb" />
                ) : (
                  <div className="message__file-icon">
                    {f.type === 'pdf' ? <FileText size={14} /> : <ImageIcon size={14} />}
                  </div>
                )}
                <span className="message__file-name">{f.name}</span>
                {f.ocrText && <span className="message__file-ocr">OCR</span>}
                <span className="message__file-size">{formatFileSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}

        <div className={`message__content ${isStreaming && displayContent ? 'streaming-cursor' : ''}`}>
          {isUser ? (
            <p>{message.content}</p>
          ) : displayContent ? (
            isStreaming ? (
              <StreamingContent content={displayContent} />
            ) : (
              <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>{displayContent}</ReactMarkdown>
            )
          ) : isStreaming ? (
            <div className="typing-indicator">
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>

        {!isUser && hasContent && !isStreaming && (
          <div className="message__toolbar">
            <button
              className="message__export-btn"
              onClick={() => setShowExport(true)}
              title={t('message.export')}
            >
              <FileDown size={14} />
              <span>{t('message.export')}</span>
            </button>
          </div>
        )}
      </div>

      {showExport && (
        <ExportPreview
          content={displayContent}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
})

function StreamingContent({ content }: { content: string }) {
  const parts = useMemo(() => {
    const result: { type: 'text' | 'code'; value: string }[] = []
    const regex = /```(\w*)\n([\s\S]*?)```/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', value: content.slice(lastIndex, match.index) })
      }
      result.push({ type: 'code', value: match[2] })
      lastIndex = regex.lastIndex
    }

    if (lastIndex < content.length) {
      result.push({ type: 'text', value: content.slice(lastIndex) })
    }

    return result
  }, [content])

  return (
    <div className="streaming-text">
      {parts.map((part, i) =>
        part.type === 'code' ? (
          <pre key={i}><code>{part.value}</code></pre>
        ) : (
          <StreamingTextBlock key={i} text={part.value} />
        )
      )}
    </div>
  )
}

function StreamingTextBlock({ text }: { text: string }) {
  const html = useMemo(() => {
    const mathHolders: string[] = []
    let safe = normalizeMath(text)
    safe = safe.replace(/\$\$[\s\S]*?\$\$/g, (m) => {
      mathHolders.push(`<span class="streaming-math">${m}</span>`)
      return `\x00MH${mathHolders.length - 1}\x00`
    })
    safe = safe.replace(/\$[^$\n]+\$/g, (m) => {
      mathHolders.push(`<span class="streaming-math">${m}</span>`)
      return `\x00MH${mathHolders.length - 1}\x00`
    })

    safe = safe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\n/g, '<br>')

    mathHolders.forEach((m, i) => {
      safe = safe.replace(`\x00MH${i}\x00`, m)
    })

    return safe
  }, [text])

  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

export default MessageComponent
