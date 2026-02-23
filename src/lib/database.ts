import { supabase } from './supabase'
import type { Conversation, Message } from '../types'

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
