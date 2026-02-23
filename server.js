import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Startup checks ───
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error('[AI Lumiere] GROQ_API_KEY is not set in .env — server cannot start.');
  process.exit(1);
}

const app = express();

// ─── Security headers ───
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false, // CSP managed by Vite for frontend
  })
);
app.disable('x-powered-by');

// ─── CORS — allow frontend origins ───
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
];
if (process.env.ORIGIN) {
  process.env.ORIGIN.split(',').forEach((o) => ALLOWED_ORIGINS.push(o.trim()));
}

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error('CORS: origin not allowed'));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    maxAge: 86400,
  })
);

// ─── Body parser with size limit ───
app.use(express.json({ limit: '5mb' }));

// ─── Rate limiting ───
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Слишком много запросов. Подождите минуту.' } },
});

const authBruteforceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Слишком много попыток. Подождите 15 минут.' } },
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Превышен лимит запросов.' } },
});

app.use('/api', globalLimiter);
app.use('/api/chat', chatLimiter);

// ─── Request timeout middleware ───
function requestTimeout(ms) {
  return (_req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: { message: 'Тайм-аут запроса' } });
      }
    }, ms);
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}

// ─── Input validation ───
const ALLOWED_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'moonshotai/kimi-k2-instruct-0905',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
]);

const MAX_MESSAGE_LENGTH = 32000;
const MAX_MESSAGES = 100;

function validateChatBody(body) {
  if (!body || typeof body !== 'object') return 'Invalid request body';
  if (!body.model || !ALLOWED_MODELS.has(body.model))
    return `Неизвестная модель: ${body.model}`;
  if (!Array.isArray(body.messages) || body.messages.length === 0)
    return 'Messages array is required';
  if (body.messages.length > MAX_MESSAGES)
    return `Максимум ${MAX_MESSAGES} сообщений в контексте`;

  for (const msg of body.messages) {
    if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role))
      return 'Invalid message role';
    if (typeof msg.content === 'string') {
      if (msg.content.length > MAX_MESSAGE_LENGTH)
        return `Сообщение слишком длинное (макс. ${MAX_MESSAGE_LENGTH} символов)`;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text' && typeof part.text === 'string') {
          if (part.text.length > MAX_MESSAGE_LENGTH) return 'Message too long';
        } else if (part.type === 'image_url' && part.image_url?.url) {
          continue;
        } else {
          return 'Invalid content part';
        }
      }
    } else {
      return 'Content must be string or array';
    }
  }

  return null;
}

function sanitizeParams(body) {
  return {
    model: body.model,
    messages: body.messages.map((m) => {
      if (Array.isArray(m.content)) {
        return {
          role: m.role,
          content: m.content.map((p) => {
            if (p.type === 'image_url') return { type: 'image_url', image_url: { url: p.image_url.url } };
            return { type: 'text', text: p.text };
          }),
        };
      }
      return { role: m.role, content: m.content };
    }),
    temperature: Math.min(Math.max(Number(body.temperature) || 0.7, 0), 2),
    max_tokens: Math.min(Number(body.max_tokens) || 4096, 16384),
  };
}

// ─── Groq API proxy ───
const GROQ_BASE = 'https://api.groq.com/openai/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function groqFetch(endpoint, options, maxRetries = 5) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${GROQ_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (res.ok) return res;
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const wait = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * 2 ** attempt + Math.random() * 500, 32000);
      console.log(
        `[AI Lumiere] Rate limited – waiting ${Math.round(wait)}ms (attempt ${attempt + 1}/${maxRetries})`
      );
      await sleep(wait);
      continue;
    }
    return res;
  }
  return new Response(
    JSON.stringify({ error: { message: 'Rate limit exceeded after max retries' } }),
    { status: 429, headers: { 'Content-Type': 'application/json' } }
  );
}

// ─── Routes ───

app.post('/api/chat', requestTimeout(120000), async (req, res) => {
  const err = validateChatBody(req.body);
  if (err) return res.status(400).json({ error: { message: err } });

  try {
    const response = await groqFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(sanitizeParams(req.body)),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    console.error('[AI Lumiere] Chat error:', e);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

app.post('/api/chat/stream', async (req, res) => {
  const err = validateChatBody(req.body);
  if (err) return res.status(400).json({ error: { message: err } });

  try {
    const response = await groqFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ ...sanitizeParams(req.body), stream: true }),
    });

    if (!response.ok) {
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (e) {
        console.error('[AI Lumiere] Stream read error:', e);
      } finally {
        res.end();
      }
    };

    req.on('close', () => reader.cancel().catch(() => {}));
    pump();
  } catch (e) {
    console.error('[AI Lumiere] Stream error:', e);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

app.post('/api/audio/transcribe', requestTimeout(30000), async (req, res) => {
  const { audio, mimeType, language } = req.body || {};
  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: { message: 'Audio data required' } });
  }

  try {
    const audioBuffer = Buffer.from(audio, 'base64');
    const ext = (mimeType || '').includes('ogg') ? 'ogg' : (mimeType || '').includes('mp4') ? 'mp4' : 'webm';

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), `audio.${ext}`);
    formData.append('model', 'whisper-large-v3-turbo');
    if (language) formData.append('language', language);

    const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('[AI Lumiere] Transcribe error:', e);
    res.status(500).json({ error: { message: 'Transcription failed' } });
  }
});

app.get('/api/models', requestTimeout(10000), async (_req, res) => {
  try {
    const response = await groqFetch('/models', { method: 'GET' });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// ─── Serve built frontend (production) ───
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[AI Lumiere] Running → http://localhost:${PORT}`);
});
