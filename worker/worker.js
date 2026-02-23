const GROQ_BASE = 'https://api.groq.com/openai/v1';

const ALLOWED_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'moonshotai/kimi-k2-instruct-0905',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
]);

const MAX_MSG_LEN = 32000;
const MAX_MSGS = 100;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function validateBody(body) {
  if (!body || typeof body !== 'object') return 'Invalid body';
  if (!body.model || !ALLOWED_MODELS.has(body.model)) return 'Unknown model';
  if (!Array.isArray(body.messages) || !body.messages.length) return 'No messages';
  if (body.messages.length > MAX_MSGS) return 'Too many messages';
  for (const m of body.messages) {
    if (!['user', 'assistant', 'system'].includes(m.role)) return 'Invalid role';
    if (typeof m.content === 'string') {
      if (m.content.length > MAX_MSG_LEN) return 'Message too long';
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === 'text' && typeof part.text === 'string') {
          if (part.text.length > MAX_MSG_LEN) return 'Message too long';
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

function sanitize(body) {
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

async function groqFetch(apiKey, endpoint, init, maxRetries = 3) {
  for (let i = 0; i <= maxRetries; i++) {
    const res = await fetch(`${GROQ_BASE}${endpoint}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    if (res.ok) return res;
    if (res.status === 429 && i < maxRetries) {
      const ra = res.headers.get('retry-after');
      const wait = ra ? parseInt(ra, 10) * 1000 : Math.min(1000 * 2 ** i + Math.random() * 500, 16000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  return json({ error: { message: 'Rate limit exceeded' } }, 429);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const apiKey = env.GROQ_API_KEY;
    if (!apiKey) {
      return json({ error: { message: 'Server misconfigured' } }, 500);
    }

    // POST /api/chat/stream
    if (url.pathname === '/api/chat/stream' && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      const err = validateBody(body);
      if (err) return json({ error: { message: err } }, 400);

      const groqRes = await groqFetch(apiKey, '/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ ...sanitize(body), stream: true }),
      });

      if (!groqRes.ok) {
        const d = await groqRes.json();
        return json(d, groqRes.status);
      }

      return new Response(groqRes.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        },
      });
    }

    // POST /api/chat
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      const err = validateBody(body);
      if (err) return json({ error: { message: err } }, 400);

      const groqRes = await groqFetch(apiKey, '/chat/completions', {
        method: 'POST',
        body: JSON.stringify(sanitize(body)),
      });
      const d = await groqRes.json();
      return json(d, groqRes.status);
    }

    // POST /api/audio/transcribe
    if (url.pathname === '/api/audio/transcribe' && request.method === 'POST') {
      const body = await request.json().catch(() => null);
      if (!body?.audio || typeof body.audio !== 'string') {
        return json({ error: { message: 'Audio data required' } }, 400);
      }

      const binaryString = atob(body.audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const mimeType = body.mimeType || 'audio/webm';
      const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';

      const formData = new FormData();
      formData.append('file', new Blob([bytes], { type: mimeType }), `audio.${ext}`);
      formData.append('model', 'whisper-large-v3-turbo');
      if (body.language) formData.append('language', body.language);

      const groqRes = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      const d = await groqRes.json();
      return json(d, groqRes.status);
    }

    // GET /api/models
    if (url.pathname === '/api/models' && request.method === 'GET') {
      const groqRes = await groqFetch(apiKey, '/models', { method: 'GET' });
      const d = await groqRes.json();
      return json(d, groqRes.status);
    }

    return json({ error: { message: 'Not found' } }, 404);
  },
};
