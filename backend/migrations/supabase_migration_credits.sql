-- ============================================================================
-- Supabase Migration: Atomic Credit Deduction Function
-- Run this in Supabase SQL Editor to enable atomic credit operations
-- ============================================================================

-- Function to atomically deduct 1 credit and return new balance
-- This prevents race conditions when multiple requests hit the API
CREATE OR REPLACE FUNCTION deduct_credit(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    UPDATE profiles 
    SET credits = credits - 1 
    WHERE id = p_user_id AND credits > 0
    RETURNING credits INTO new_balance;
    
    -- Return new balance, or -1 if update didn't happen (no credits)
    IF new_balance IS NULL THEN
        SELECT credits INTO new_balance FROM profiles WHERE id = p_user_id;
    END IF;
    
    RETURN COALESCE(new_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION deduct_credit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_credit(UUID) TO service_role;
