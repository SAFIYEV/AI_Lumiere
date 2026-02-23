import type { Plugin, Connect } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import dotenv from 'dotenv'

dotenv.config()

const GROQ_API_KEY = process.env.GROQ_API_KEY!
const GROQ_BASE = 'https://api.groq.com/openai/v1'

const ALLOWED_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'moonshotai/kimi-k2-instruct-0905',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
])

const MAX_MSG_LEN = 32000
const MAX_MSGS = 100

function validateBody(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Invalid body'
  if (!body.model || !ALLOWED_MODELS.has(body.model)) return 'Unknown model'
  if (!Array.isArray(body.messages) || !body.messages.length) return 'No messages'
  if (body.messages.length > MAX_MSGS) return 'Too many messages'
  for (const m of body.messages) {
    if (!['user', 'assistant', 'system'].includes(m.role)) return 'Invalid role'
    if (typeof m.content === 'string') {
      if (m.content.length > MAX_MSG_LEN) return 'Message too long'
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === 'text' && typeof part.text === 'string') {
          if (part.text.length > MAX_MSG_LEN) return 'Message too long'
        } else if (part.type === 'image_url' && part.image_url?.url) {
          continue
        } else {
          return 'Invalid content part'
        }
      }
    } else {
      return 'Content must be string or array'
    }
  }
  return null
}

function sanitize(body: any) {
  return {
    model: body.model,
    messages: body.messages.map((m: any) => {
      if (Array.isArray(m.content)) {
        return {
          role: m.role,
          content: m.content.map((p: any) => {
            if (p.type === 'image_url') return { type: 'image_url', image_url: { url: p.image_url.url } }
            return { type: 'text', text: p.text }
          }),
        }
      }
      return { role: m.role, content: m.content }
    }),
    temperature: Math.min(Math.max(Number(body.temperature) || 0.7, 0), 2),
    max_tokens: Math.min(Number(body.max_tokens) || 4096, 16384),
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function groqFetch(endpoint: string, init: RequestInit, maxRetries = 5) {
  for (let i = 0; i <= maxRetries; i++) {
    const res = await fetch(`${GROQ_BASE}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string>),
      },
    })
    if (res.ok) return res
    if (res.status === 429) {
      const ra = res.headers.get('retry-after')
      const wait = ra ? parseInt(ra, 10) * 1000 : Math.min(1000 * 2 ** i + Math.random() * 500, 32000)
      console.log(`[AI Lumiere] Rate limited – ${Math.round(wait)}ms (${i + 1}/${maxRetries})`)
      await sleep(wait)
      continue
    }
    return res
  }
  return Response.json({ error: { message: 'Rate limit exceeded' } }, { status: 429 })
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

const MAX_BODY_SIZE = 25 * 1024 * 1024 // 25MB for base64 images

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = ''
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_SIZE) {
        req.destroy()
        resolve(null)
        return
      }
      data += c.toString()
    })
    req.on('end', () => {
      try { resolve(JSON.parse(data)) }
      catch { resolve(null) }
    })
  })
}

const rateLimits = new Map<string, { count: number; reset: number }>()

function isLimited(ip: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const e = rateLimits.get(ip)
  if (!e || now > e.reset) {
    rateLimits.set(ip, { count: 1, reset: now + windowMs })
    return false
  }
  e.count++
  return e.count > max
}

export function apiPlugin(): Plugin {
  return {
    name: 'ai-lumiere-api',
    configureServer(server) {
      const handle: Connect.NextHandleFunction = async (req, res, next) => {
        const url = req.url || ''

        if (!url.startsWith('/api')) return next()

        const ip = req.socket.remoteAddress || '0'

        if (url.startsWith('/api/chat') && isLimited(ip, 20, 60000)) {
          return sendJson(res as ServerResponse, 429, { error: { message: 'Слишком много запросов' } })
        }

        if (url === '/api/chat/stream' && req.method === 'POST') {
          const body = await readBody(req)
          const err = validateBody(body)
          if (err) return sendJson(res as ServerResponse, 400, { error: { message: err } })

          try {
            const groqRes = await groqFetch('/chat/completions', {
              method: 'POST',
              body: JSON.stringify({ ...sanitize(body), stream: true }),
            })

            if (!groqRes.ok) {
              const d = await groqRes.json()
              return sendJson(res as ServerResponse, groqRes.status, d)
            }

            res.writeHead!(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            })

            const reader = groqRes.body!.getReader()
            const dec = new TextDecoder()

            const pump = async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  res.write(dec.decode(value, { stream: true }))
                }
              } catch (e) {
                console.error('[AI Lumiere] Stream error:', e)
              } finally {
                res.end()
              }
            }

            req.on('close', () => reader.cancel().catch(() => {}))
            pump()
          } catch (e: any) {
            console.error('[AI Lumiere] Error:', e)
            sendJson(res as ServerResponse, 500, { error: { message: 'Internal error' } })
          }
          return
        }

        if (url === '/api/chat' && req.method === 'POST') {
          const body = await readBody(req)
          const err = validateBody(body)
          if (err) return sendJson(res as ServerResponse, 400, { error: { message: err } })

          try {
            const groqRes = await groqFetch('/chat/completions', {
              method: 'POST',
              body: JSON.stringify(sanitize(body)),
            })
            const d = await groqRes.json()
            sendJson(res as ServerResponse, groqRes.status, d)
          } catch (e: any) {
            sendJson(res as ServerResponse, 500, { error: { message: 'Internal error' } })
          }
          return
        }

        if (url === '/api/audio/transcribe' && req.method === 'POST') {
          if (isLimited(ip, 30, 60000)) {
            return sendJson(res as ServerResponse, 429, { error: { message: 'Слишком много запросов' } })
          }

          const body = await readBody(req)
          if (!body?.audio || typeof body.audio !== 'string') {
            return sendJson(res as ServerResponse, 400, { error: { message: 'Audio data required' } })
          }

          try {
            const audioBuffer = Buffer.from(body.audio, 'base64')
            const mimeType = body.mimeType || 'audio/webm'
            const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'

            const formData = new FormData()
            formData.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`)
            formData.append('model', 'whisper-large-v3-turbo')
            if (body.language) formData.append('language', body.language)

            const groqRes = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
              body: formData,
            })

            if (!groqRes.ok) {
              const d = await groqRes.json()
              return sendJson(res as ServerResponse, groqRes.status, d)
            }

            const data = await groqRes.json()
            sendJson(res as ServerResponse, 200, data)
          } catch (e: any) {
            console.error('[AI Lumiere] Transcribe error:', e)
            sendJson(res as ServerResponse, 500, { error: { message: 'Transcription failed' } })
          }
          return
        }

        if (url === '/api/models' && req.method === 'GET') {
          try {
            const groqRes = await groqFetch('/models', { method: 'GET' })
            const d = await groqRes.json()
            sendJson(res as ServerResponse, groqRes.status, d)
          } catch (e: any) {
            sendJson(res as ServerResponse, 500, { error: { message: 'Internal error' } })
          }
          return
        }

        sendJson(res as ServerResponse, 404, { error: { message: 'Not found' } })
      }

      server.middlewares.use(handle)
    },
  }
}
