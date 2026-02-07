/**
 * Popup App Component
 * 
 * Main extension popup. Checks auth state and directs users to dashboard for login.
 */

import { useState, useEffect, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase, initAuthListener } from '../lib/supabase';

/**
 * Settings interface
 */
interface Settings {
    enabled: boolean;
    targetLang: string;
    backendUrl: string;
}

/**
 * Available target languages - matches backend TargetLanguage enum exactly
 */
const LANGUAGES = [
    { value: 'Vietnamese', label: 'Vietnamese' },
    { value: 'English', label: 'English' },
    { value: 'Japanese', label: 'Japanese' },
    { value: 'Korean', label: 'Korean' },
    { value: 'Chinese (Simplified)', label: 'Chinese (Simplified)' },
    { value: 'Chinese (Traditional)', label: 'Chinese (Traditional)' },
    { value: 'Spanish', label: 'Spanish' },
    { value: 'French', label: 'French' },
    { value: 'Portuguese', label: 'Portuguese' },
    { value: 'Indonesian', label: 'Indonesian' },
    { value: 'Thai', label: 'Thai' },
    { value: 'Russian', label: 'Russian' },
    { value: 'German', label: 'German' },
    { value: 'Italian', label: 'Italian' },
    { value: 'Arabic', label: 'Arabic' },
    { value: 'Hindi', label: 'Hindi' },
    { value: 'Filipino', label: 'Filipino' },
    { value: 'Polish', label: 'Polish' },
    { value: 'Turkish', label: 'Turkish' },
    { value: 'Ukrainian', label: 'Ukrainian' },
];

/**
 * Default settings
 */
const DEFAULT_SETTINGS: Settings = {
    enabled: true,
    targetLang: 'Vietnamese',
    backendUrl: 'http://localhost:8000',
};

/**
 * Popup App Component
 */
function App() {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [status, setStatus] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [session, setSession] = useState<Session | null>(null);
    const [authChecking, setAuthChecking] = useState<boolean>(true);

    /**
     * Initialize auth listener and check session on mount
     */
    useEffect(() => {
        initAuthListener();
        checkSession();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    /**
     * Load settings when authenticated
     */
    useEffect(() => {
        if (session) {
            loadSettings();
        }
    }, [session]);

    /**
     * Check current auth session
     */
    const checkSession = async (): Promise<void> => {
        try {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            setSession(currentSession);
        } catch (error) {
            console.error('Failed to check session:', error);
        } finally {
            setAuthChecking(false);
        }
    };

    /**
     * Load settings from Chrome storage
     */
    const loadSettings = async (): Promise<void> => {
        try {
            const result = await chrome.storage.sync.get([
                'enabled',
                'targetLang',
                'backendUrl',
            ]);

            setSettings({
                enabled: result.enabled ?? DEFAULT_SETTINGS.enabled,
                targetLang: result.targetLang ?? DEFAULT_SETTINGS.targetLang,
                backendUrl: result.backendUrl ?? DEFAULT_SETTINGS.backendUrl,
            });
        } catch (error) {
            console.error('Failed to load settings:', error);
            setStatus('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Save settings to Chrome storage
     */
    const saveSettings = useCallback(async (newSettings: Settings): Promise<void> => {
        try {
            await chrome.storage.sync.set(newSettings);
            setSettings(newSettings);
            setStatus('Settings saved!');
            setTimeout(() => setStatus(''), 2000);
        } catch (error) {
            console.error('Failed to save settings:', error);
            setStatus('Failed to save settings');
        }
    }, []);

    /**
     * Toggle extension enabled state
     * When enabling, automatically trigger page reprocessing
     */
    const handleToggleEnabled = useCallback(async (): Promise<void> => {
        const newEnabled = !settings.enabled;
        await saveSettings({ ...settings, enabled: newEnabled });

        // Auto-trigger reprocess when enabling
        if (newEnabled) {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                    await chrome.tabs.sendMessage(tab.id, { type: 'REPROCESS_PAGE' });
                    setStatus('Translation enabled! Processing page...');
                    setTimeout(() => setStatus(''), 2000);
                }
            } catch {
                // Ignore connection errors - content script may not be loaded on this page
                console.log('[Popup] Content script not available on this page');
                setStatus('Translation enabled!');
                setTimeout(() => setStatus(''), 2000);
            }
        }
    }, [settings, saveSettings]);

    /**
     * Handle language change
     */
    const handleLanguageChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>): void => {
            saveSettings({ ...settings, targetLang: event.target.value });
        },
        [settings, saveSettings]
    );

    /**
     * Handle backend URL change
     */
    const handleBackendUrlChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>): void => {
            setSettings((prev) => ({ ...prev, backendUrl: event.target.value }));
        },
        []
    );

    /**
     * Save backend URL on blur
     */
    const handleBackendUrlBlur = useCallback((): void => {
        saveSettings(settings);
    }, [settings, saveSettings]);

    /**
     * Reprocess current page
     */
    const handleReprocess = useCallback(async (): Promise<void> => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                await chrome.tabs.sendMessage(tab.id, { type: 'REPROCESS_PAGE' });
                setStatus('Page reprocessing...');
                setTimeout(() => setStatus(''), 2000);
            }
        } catch {
            // Ignore connection errors - content script may not be loaded on this page
            console.log('[Popup] Content script not available on this page');
            setStatus('Not available on this page');
            setTimeout(() => setStatus(''), 2000);
        }
    }, []);

    /**
     * Open dashboard in new tab
     */
    const openDashboard = useCallback((): void => {
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/dashboard/index.html')
        });
    }, []);

    // Show loading while checking auth
    if (authChecking) {
        return (
            <div className="popup-container">
                <div className="loading">Loading...</div>
            </div>
        );
    }

    // Show login prompt if not authenticated
    if (!session) {
        return (
            <div className="popup-container">
                <header className="popup-header">
                    <h1>Manga Translator</h1>
                </header>
                <div className="auth-prompt">
                    <p>Please log in to use Manga Translator</p>
                    <button
                        className="action-button"
                        onClick={openDashboard}
                    >
                        Open Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // Show main app if logged in (still loading settings)
    if (loading) {
        return (
            <div className="popup-container">
                <div className="loading">Loading...</div>
            </div>
        );
    }

    return (
        <div className="popup-container">
            {/* Header */}
            <header className="popup-header">
                <h1>Manga Translator</h1>
            </header>

            {/* User Info */}
            <div className="user-info">
                <span>Hello, {session.user?.email}</span>
                <button
                    className="manage-account-button"
                    onClick={openDashboard}
                    title="Manage Account"
                >
                    Manage Account
                </button>
            </div>

            {/* Main Content */}
            <main className="popup-content">
                {/* Enable/Disable Toggle */}
                <div className="setting-row">
                    <label htmlFor="enabled-toggle">Enable Translation</label>
                    <button
                        id="enabled-toggle"
                        className={`toggle-button ${settings.enabled ? 'active' : ''}`}
                        onClick={handleToggleEnabled}
                        aria-pressed={settings.enabled}
                    >
                        {settings.enabled ? 'ON' : 'OFF'}
                    </button>
                </div>

                {/* Language Selection */}
                <div className="setting-row">
                    <label htmlFor="language-select">Target Language</label>
                    <select
                        id="language-select"
                        value={settings.targetLang}
                        onChange={handleLanguageChange}
                        disabled={!settings.enabled}
                    >
                        {LANGUAGES.map((lang) => (
                            <option key={lang.value} value={lang.value}>
                                {lang.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Backend URL */}
                <div className="setting-row setting-row--vertical">
                    <label htmlFor="backend-url">Backend URL</label>
                    <input
                        id="backend-url"
                        type="text"
                        value={settings.backendUrl}
                        onChange={handleBackendUrlChange}
                        onBlur={handleBackendUrlBlur}
                        placeholder="http://localhost:8000"
                        disabled={!settings.enabled}
                    />
                </div>

                {/* Action Buttons */}
                <div className="action-buttons">
                    <button
                        className="action-button"
                        onClick={handleReprocess}
                        disabled={!settings.enabled}
                    >
                        Reprocess Page
                    </button>
                </div>

                {/* Status Message */}
                {status && <div className="status-message">{status}</div>}
            </main>

            {/* Footer */}
            <footer className="popup-footer">
                <span>v1.0.0</span>
            </footer>
        </div>
    );
}

export default App;
