import { useState, useEffect, useCallback } from 'react';

/**
 * Settings interface
 */
interface Settings {
    enabled: boolean;
    targetLang: string;
    backendUrl: string;
}

/**
 * Available target languages
 */
const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
];

/**
 * Default settings
 */
const DEFAULT_SETTINGS: Settings = {
    enabled: true,
    targetLang: 'en',
    backendUrl: 'http://localhost:8000',
};

/**
 * Popup App Component
 */
function App() {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [status, setStatus] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);

    /**
     * Load settings from storage on mount
     */
    useEffect(() => {
        loadSettings();
    }, []);

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
     */
    const handleToggleEnabled = useCallback((): void => {
        saveSettings({ ...settings, enabled: !settings.enabled });
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
        } catch (error) {
            console.error('Failed to reprocess page:', error);
            setStatus('Failed to reprocess page');
        }
    }, []);

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
                <h1>🎌 Manga Translator</h1>
            </header>

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
                            <option key={lang.code} value={lang.code}>
                                {lang.name}
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

                {/* Reprocess Button */}
                <button
                    className="action-button"
                    onClick={handleReprocess}
                    disabled={!settings.enabled}
                >
                    🔄 Reprocess Page
                </button>

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
