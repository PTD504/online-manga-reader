-- Supabase Schema for Manga Translator
-- Run this in Supabase SQL Editor to create required tables

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- User Usage Table
-- Tracks translation quota and subscription status per user
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Usage tracking
    translations_today INTEGER NOT NULL DEFAULT 0,
    translations_total INTEGER NOT NULL DEFAULT 0,
    last_translation_at TIMESTAMPTZ,
    
    -- Subscription info
    subscription_tier TEXT NOT NULL DEFAULT 'free',
    daily_limit INTEGER NOT NULL DEFAULT 50,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure one record per user
    UNIQUE(user_id)
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_usage_user_id ON user_usage(user_id);

-- ============================================================================
-- Translation Logs Table
-- Stores translation history for analytics and caching
-- ============================================================================

CREATE TABLE IF NOT EXISTS translation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Translation content
    source_text TEXT NOT NULL DEFAULT '',
    translated_text TEXT NOT NULL DEFAULT '',
    source_lang VARCHAR(10) NOT NULL DEFAULT 'auto',
    target_lang VARCHAR(10) NOT NULL DEFAULT 'en',
    
    -- Image hash for potential caching
    image_hash VARCHAR(64),
    
    -- Performance metrics
    tokens_used INTEGER NOT NULL DEFAULT 0,
    processing_time_ms INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_translation_logs_user_id ON translation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_translation_logs_created_at ON translation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_translation_logs_image_hash ON translation_logs(image_hash) WHERE image_hash IS NOT NULL;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on tables
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_logs ENABLE ROW LEVEL SECURITY;

-- User Usage: Users can only see and modify their own records
CREATE POLICY "Users can view own usage" ON user_usage
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own usage" ON user_usage
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all usage" ON user_usage
    FOR ALL USING (auth.role() = 'service_role');

-- Translation Logs: Users can only see their own logs
CREATE POLICY "Users can view own logs" ON translation_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own logs" ON translation_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage all logs" ON translation_logs
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- Auto-update updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_usage_updated_at
    BEFORE UPDATE ON user_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Auto-create user_usage on signup (optional trigger)
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_usage (user_id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
