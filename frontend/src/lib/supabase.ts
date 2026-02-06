/**
 * Supabase Client Module with Chrome Storage Adapter
 * 
 * Initializes the Supabase client for Chrome Extension authentication.
 * Uses chrome.storage.local instead of localStorage for session persistence.
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
 * Custom storage adapter for Chrome Extension.
 * Uses chrome.storage.local for session persistence across popup/dashboard.
 * 
 * Note: All chrome.storage.local methods are async, which Supabase's storage
 * adapter interface supports.
 */
const chromeStorageAdapter = {
    /**
     * Get item from chrome.storage.local
     */
    getItem: async (key: string): Promise<string | null> => {
        try {
            const result = await chrome.storage.local.get(key);
            return result[key] ?? null;
        } catch (error) {
            console.error('[MangaTranslator] Storage getItem error:', error);
            return null;
        }
    },

    /**
     * Set item in chrome.storage.local
     */
    setItem: async (key: string, value: string): Promise<void> => {
        try {
            await chrome.storage.local.set({ [key]: value });
        } catch (error) {
            console.error('[MangaTranslator] Storage setItem error:', error);
        }
    },

    /**
     * Remove item from chrome.storage.local
     */
    removeItem: async (key: string): Promise<void> => {
        try {
            await chrome.storage.local.remove(key);
        } catch (error) {
            console.error('[MangaTranslator] Storage removeItem error:', error);
        }
    },
};

/**
 * Supabase client instance.
 * Uses chrome.storage.local adapter for Chrome Extension compatibility.
 */
export const supabase: SupabaseClient = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
        auth: {
            // Use custom chrome.storage.local adapter
            storage: chromeStorageAdapter,
            // Persist session across popup/dashboard
            persistSession: true,
            // Auto-refresh tokens before expiry
            autoRefreshToken: true,
            // Disable URL detection (not needed for extension)
            detectSessionInUrl: false,
        },
    }
);

/**
 * Get current session from Supabase.
 * Restores session from chrome.storage.local on first call.
 */
export async function getSession() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
            console.error('[MangaTranslator] Failed to get session:', error);
            return null;
        }
        return session;
    } catch (error) {
        console.error('[MangaTranslator] Session error:', error);
        return null;
    }
}

/**
 * Check if user is authenticated.
 */
export async function isAuthenticated(): Promise<boolean> {
    const session = await getSession();
    return session !== null;
}

/**
 * Sign out and clear all session data.
 */
export async function signOut(): Promise<void> {
    try {
        await supabase.auth.signOut();
        // Clear any additional cached data
        await chrome.storage.local.remove([
            'supabaseAccessToken',
            'supabaseRefreshToken',
        ]);
        console.log('[MangaTranslator] Signed out successfully');
    } catch (error) {
        console.error('[MangaTranslator] Sign out error:', error);
    }
}

/**
 * Initialize auth state listener.
 * Logs auth state changes for debugging.
 */
export function initAuthListener(): void {
    supabase.auth.onAuthStateChange((event, session) => {
        console.log('[MangaTranslator] Auth state changed:', event);
        if (session) {
            console.log('[MangaTranslator] User:', session.user?.email);
        }
    });
}
