import { supabase } from './supabase'
import type { AdminSummary, Conversation, Message, UserBot } from '../types'

async function retry<T>(fn: () => Promise<T>, attempts = 3, delay = 500): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, delay * (i + 1)))
    }
  }
  throw new Error('Retry exhausted')
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
}

function mapBotRow(row: Record<string, unknown>): UserBot {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    slug: row.slug as string,
    authorName: (row.author_name as string) || '',
    username: (row.username as string) || '',
    description: (row.description as string) || '',
    model: row.model as string,
    systemPrompt: (row.system_prompt as string) || '',
    isPublic: Boolean(row.is_public),
    avatarUrl: (row.avatar_url as string) || '',
    mediaLinks: (row.media_links as string[]) || [],
    useCount: Number(row.use_count || 0),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function loadConversations(userId: string): Promise<Conversation[]> {
  const { data: convRows, error: convError } = await supabase
    .from('conversations')
    .select('id, title, model, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (convError) throw convError
  if (!convRows?.length) return []

  const convIds = convRows.map((c) => c.id)

  const { data: msgRows, error: msgError } = await supabase
    .from('messages')
    .select('id, conversation_id, role, content, model, created_at')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: true })

  if (msgError) {
    console.error('[AI Lumiere] Failed to load messages:', msgError)
  }

  const msgByConv = new Map<string, Message[]>()
  for (const msg of msgRows || []) {
    const convId = msg.conversation_id as string
    if (!msgByConv.has(convId)) msgByConv.set(convId, [])
    msgByConv.get(convId)!.push({
      id: msg.id as string,
      role: msg.role as Message['role'],
      content: (msg.content as string) || '',
      model: (msg.model as string) || undefined,
      timestamp: msg.created_at as string,
    })
  }

  return convRows.map((conv) => ({
    id: conv.id as string,
    title: conv.title as string,
    model: conv.model as string,
    createdAt: conv.created_at as string,
    messages: msgByConv.get(conv.id as string) || [],
  }))
}

export async function createConversation(
  id: string,
  userId: string,
  title: string,
  model: string
): Promise<void> {
  await retry(async () => {
    const { error } = await supabase
      .from('conversations')
      .insert({ id, user_id: userId, title, model })
    if (error) throw error
  })
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from('conversations').delete().eq('id', id)
  if (error) throw error
}

export async function addMessage(
  id: string,
  conversationId: string,
  role: string,
  content: string,
  model?: string
): Promise<void> {
  await retry(async () => {
    const { error } = await supabase
      .from('messages')
      .insert({ id, conversation_id: conversationId, role, content, model })
    if (error) throw error
  })
}

export async function updateMessageContent(
  id: string,
  content: string
): Promise<void> {
  if (!id) return
  await retry(async () => {
    const { error } = await supabase
      .from('messages')
      .update({ content })
      .eq('id', id)
    if (error) throw error
  })
}

export async function loadBots(userId: string): Promise<UserBot[]> {
  const { data, error } = await supabase
    .from('chat_bots')
    .select('id, user_id, name, slug, author_name, username, description, model, system_prompt, is_public, avatar_url, media_links, use_count, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error

  return (data || []).map((row) => mapBotRow(row as unknown as Record<string, unknown>))
}

export async function createBot(
  userId: string,
  payload: Pick<UserBot, 'name' | 'description' | 'model' | 'systemPrompt' | 'authorName' | 'isPublic' | 'username' | 'avatarUrl' | 'mediaLinks'>
): Promise<UserBot> {
  const baseSlug = slugify(payload.name) || `bot-${Math.floor(Date.now() / 1000)}`
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`
  const { data, error } = await supabase
    .from('chat_bots')
    .insert({
      user_id: userId,
      name: payload.name,
      slug,
      author_name: payload.authorName,
      username: payload.username,
      description: payload.description,
      model: payload.model,
      system_prompt: payload.systemPrompt,
      is_public: payload.isPublic,
      avatar_url: payload.avatarUrl,
      media_links: payload.mediaLinks,
    })
    .select('id, user_id, name, slug, author_name, username, description, model, system_prompt, is_public, avatar_url, media_links, use_count, created_at, updated_at')
    .single()

  if (error) throw error
  return mapBotRow(data as unknown as Record<string, unknown>)
}

export async function updateBot(
  id: string,
  payload: Pick<UserBot, 'name' | 'description' | 'model' | 'systemPrompt' | 'authorName' | 'isPublic' | 'avatarUrl' | 'mediaLinks'>
): Promise<UserBot> {
  const { data: current, error: currentErr } = await supabase
    .from('chat_bots')
    .select('username')
    .eq('id', id)
    .single()
  if (currentErr) throw currentErr

  const { data, error } = await supabase
    .from('chat_bots')
    .update({
      name: payload.name,
      author_name: payload.authorName,
      description: payload.description,
      model: payload.model,
      system_prompt: payload.systemPrompt,
      is_public: payload.isPublic,
      avatar_url: payload.avatarUrl,
      media_links: payload.mediaLinks,
      username: current.username,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, user_id, name, slug, author_name, username, description, model, system_prompt, is_public, avatar_url, media_links, use_count, created_at, updated_at')
    .single()

  if (error) throw error
  return mapBotRow(data as unknown as Record<string, unknown>)
}

export async function deleteBot(id: string): Promise<void> {
  const { error } = await supabase.from('chat_bots').delete().eq('id', id)
  if (error) throw error
}

export async function loadPublicBots(limit = 100): Promise<UserBot[]> {
  const { data, error } = await supabase
    .from('chat_bots')
    .select('id, user_id, name, slug, author_name, username, description, model, system_prompt, is_public, avatar_url, media_links, use_count, created_at, updated_at')
    .eq('is_public', true)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data || []).map((row) => mapBotRow(row as unknown as Record<string, unknown>))
}

export async function loadPublicBotBySlug(slug: string): Promise<UserBot | null> {
  const { data, error } = await supabase
    .from('chat_bots')
    .select('id, user_id, name, slug, author_name, username, description, model, system_prompt, is_public, avatar_url, media_links, use_count, created_at, updated_at')
    .eq('slug', slug)
    .eq('is_public', true)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapBotRow(data as unknown as Record<string, unknown>)
}

export async function incrementBotUsage(id: string): Promise<void> {
  const { error } = await supabase.rpc('increment_bot_usage', { bot_id_input: id })
  if (error) throw error
}

export async function loadAdminSummary(): Promise<AdminSummary> {
  const [totalBotsRes, publicBotsRes, convRes, msgRes, topRes] = await Promise.all([
    supabase.from('chat_bots').select('*', { count: 'exact', head: true }),
    supabase.from('chat_bots').select('*', { count: 'exact', head: true }).eq('is_public', true),
    supabase.from('conversations').select('*', { count: 'exact', head: true }),
    supabase.from('messages').select('*', { count: 'exact', head: true }),
    supabase
      .from('chat_bots')
      .select('id, user_id, name, slug, author_name, username, description, model, system_prompt, is_public, avatar_url, media_links, use_count, created_at, updated_at')
      .order('use_count', { ascending: false })
      .limit(10),
  ])

  if (totalBotsRes.error) throw totalBotsRes.error
  if (publicBotsRes.error) throw publicBotsRes.error
  if (convRes.error) throw convRes.error
  if (msgRes.error) throw msgRes.error
  if (topRes.error) throw topRes.error

  return {
    totalBots: totalBotsRes.count || 0,
    publicBots: publicBotsRes.count || 0,
    totalConversations: convRes.count || 0,
    totalMessages: msgRes.count || 0,
    topBots: (topRes.data || []).map((row) => mapBotRow(row as unknown as Record<string, unknown>)),
  }
}
