export interface FileAttachment {
  id: string
  name: string
  type: 'image' | 'pdf'
  mimeType: string
  /** base64 data URL for images, extracted text for PDFs */
  data: string
  /** preview thumbnail (base64 data URL) for images */
  preview?: string
  /** OCR-extracted text from image or scanned PDF */
  ocrText?: string
  size: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  timestamp: string
  files?: FileAttachment[]
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  model: string
  createdAt: string
}

export interface UserBot {
  id: string
  userId?: string
  name: string
  slug: string
  authorName: string
  username: string
  description: string
  model: string
  systemPrompt: string
  isPublic: boolean
  avatarUrl: string
  mediaLinks: string[]
  useCount: number
  createdAt: string
  updatedAt: string
}

export interface AdminSummary {
  totalBots: number
  publicBots: number
  totalConversations: number
  totalMessages: number
  topBots: UserBot[]
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  speed: string
  context: string
  vision?: boolean
}

export const MODELS: ModelInfo[] = [
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    provider: 'OpenAI',
    speed: '~500 T/s',
    context: '131K',
  },
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    provider: 'OpenAI',
    speed: '~1000 T/s',
    context: '131K',
  },
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout 17B',
    provider: 'Meta',
    speed: '~750 T/s',
    context: '131K',
    vision: true,
  },
  {
    id: 'moonshotai/kimi-k2-instruct-0905',
    name: 'Kimi K2',
    provider: 'Moonshot AI',
    speed: '~200 T/s',
    context: '262K',
  },
  {
    id: 'qwen/qwen3-32b',
    name: 'Qwen3 32B',
    provider: 'Alibaba',
    speed: '~400 T/s',
    context: '131K',
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B Instant',
    provider: 'Meta',
    speed: '~560 T/s',
    context: '131K',
  },
]

export const VISION_MODELS = new Set(
  MODELS.filter((m) => m.vision).map((m) => m.id)
)
