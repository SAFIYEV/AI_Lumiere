-- =============================================
-- Lumiere AI — Supabase Database Schema
-- =============================================
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Conversations table
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  model       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_user ON conversations(user_id);

-- 2. Messages table
CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL DEFAULT '',
  model             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- 3. User chat bots table (custom personas)
CREATE TABLE chat_bots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  model         TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_bots_user ON chat_bots(user_id);

-- 3. Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_bots     ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies — conversations
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  USING (auth.uid() = user_id);

-- 5. RLS Policies — messages
CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert messages in own conversations"
  ON messages FOR INSERT
  WITH CHECK (conversation_id IN (
    SELECT id FROM conversations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update messages in own conversations"
  ON messages FOR UPDATE
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE user_id = auth.uid()
  ));

-- 6. RLS Policies — chat_bots
CREATE POLICY "Users can view own bots"
  ON chat_bots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own bots"
  ON chat_bots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bots"
  ON chat_bots FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own bots"
  ON chat_bots FOR DELETE
  USING (auth.uid() = user_id);
