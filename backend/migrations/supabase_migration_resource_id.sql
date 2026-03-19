-- ============================================================================
-- Supabase Migration: Add resource_id for Pay-Per-Page Idempotency
-- Run this in Supabase SQL Editor to enable smart pricing
-- ============================================================================

-- Add resource_id column to track which image URLs have been translated
-- This enables idempotency: same image URL within 24 hours = free pass
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS resource_id TEXT;

-- Create index for efficient lookup of recent usage by user + resource
-- Queries will filter by user_id, resource_id, and created_at (24h window)
CREATE INDEX IF NOT EXISTS idx_usage_logs_resource_lookup 
ON usage_logs(user_id, resource_id, created_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN usage_logs.resource_id IS 'Original image URL for pay-per-page idempotency tracking';
