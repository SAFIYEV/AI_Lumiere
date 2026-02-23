import type { FileAttachment } from './types'
import { VISION_MODELS } from './types'

const API_BASE = import.meta.env.VITE_API_URL || ''

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface ApiMessage {
  role: string
  content: string | ContentPart[]
}

export function buildApiMessages(
  messages: { role: string; content: string; files?: FileAttachment[] }[],
  model: string
): ApiMessage[] {
  const supportsVision = VISION_MODELS.has(model)

  return messages.map((m) => {
    const hasImages = m.files?.some((f) => f.type === 'image')
    const hasPdfs = m.files?.some((f) => f.type === 'pdf')

    if (!m.files?.length || (!hasImages && !hasPdfs)) {
      return { role: m.role, content: m.content }
    }

    if (hasImages && supportsVision) {
      const parts: ContentPart[] = []

      if (hasPdfs) {
        const pdfTexts = m.files
          .filter((f) => f.type === 'pdf')
          .map((f) => `📄 Содержимое файла "${f.name}":\n${f.data}`)
          .join('\n\n')
        parts.push({ type: 'text', text: pdfTexts })
      }

      const ocrContext = m.files
        .filter((f) => f.type === 'image' && f.ocrText)
        .map((f) => `🔍 OCR текст из "${f.name}":\n${f.ocrText}`)
        .join('\n\n')
      if (ocrContext) {
        parts.push({ type: 'text', text: ocrContext })
      }

      for (const f of m.files.filter((f) => f.type === 'image')) {
        parts.push({ type: 'image_url', image_url: { url: f.data } })
      }

      if (m.content) {
        parts.push({ type: 'text', text: m.content })
      }

      return { role: m.role, content: parts }
    }

    let textContent = ''

    if (hasPdfs) {
      textContent += m.files
        .filter((f) => f.type === 'pdf')
        .map((f) => `📄 Содержимое файла "${f.name}":\n${f.data}`)
        .join('\n\n')
    }

    if (hasImages && !supportsVision) {
      const imageFiles = m.files.filter((f) => f.type === 'image')
      const ocrTexts = imageFiles
        .filter((f) => f.ocrText)
        .map((f) => `🔍 OCR текст из "${f.name}":\n${f.ocrText}`)
      if (ocrTexts.length) {
        textContent += (textContent ? '\n\n' : '') + ocrTexts.join('\n\n')
      }
      const noOcr = imageFiles.filter((f) => !f.ocrText)
      if (noOcr.length) {
        textContent += `\n\n[Прикреплены изображения без текста: ${noOcr.map((f) => f.name).join(', ')}. Для анализа изображений используйте Llama 4 Scout 17B.]`
      }
    }

    if (m.content) {
      textContent += (textContent ? '\n\n' : '') + m.content
    }

    return { role: m.role, content: textContent }
  })
}

export async function streamChat(
  messages: { role: string; content: string; files?: FileAttachment[] }[],
  model: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const apiMessages = buildApiMessages(messages, model)

    const res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
      signal,
    })

    if (!res.ok) {
      const data = await res.json()
      onError(data.error?.message || `Error ${res.status}`)
      return
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue

        const payload = trimmed.slice(6)
        if (payload === '[DONE]') {
          onDone()
          return
        }

        try {
          const parsed = JSON.parse(payload)
          const token = parsed.choices?.[0]?.delta?.content
          if (token) onChunk(token)
        } catch {
          // skip malformed chunks
        }
      }
    }

    onDone()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return
    onError(err instanceof Error ? err.message : 'Network error')
  }
}
