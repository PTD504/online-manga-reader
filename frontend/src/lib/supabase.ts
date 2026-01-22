/**
 * Supabase Client Module
 * 
 * Initializes the Supabase client for frontend authentication and database access.
 * Uses Vite environment variables with VITE_ prefix.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables (Vite requires VITE_ prefix)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
        '[MangaTranslator] Supabase credentials not configured. ' +
        'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
    );
}

/**
 * Supabase client instance.
 * Uses the anon key for frontend operations (respects RLS policies).
 */
export const supabase: SupabaseClient = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
        auth: {
            // Persist session in localStorage (works in Chrome extension popup)
            persistSession: true,
            // Auto-refresh tokens
            autoRefreshToken: true,
            // Detect session from URL (for OAuth redirects)
            detectSessionInUrl: false,
        },
    }
);

/**
 * Store the access token in Chrome storage for content script access.
 * Content scripts cannot access localStorage, so we use chrome.storage.
 */
export async function syncTokenToStorage(): Promise<void> {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.access_token) {
            await chrome.storage.local.set({
                supabaseAccessToken: session.access_token,
                supabaseRefreshToken: session.refresh_token,
            });
            console.log('[MangaTranslator] Token synced to chrome.storage');
        } else {
            await chrome.storage.local.remove(['supabaseAccessToken', 'supabaseRefreshToken']);
            console.log('[MangaTranslator] Token cleared from chrome.storage');
        }
    } catch (error) {
        console.error('[MangaTranslator] Failed to sync token:', error);
    }
}

/**
 * Initialize auth state listener to sync tokens on changes.
 */
export function initAuthListener(): void {
    supabase.auth.onAuthStateChange(async (_event, _session) => {
        console.log('[MangaTranslator] Auth state changed:', _event);
        await syncTokenToStorage();
    });
}
