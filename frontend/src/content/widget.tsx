/**
 * Manga Translator - Floating Widget
 * 
 * Shadow DOM-isolated floating button that expands to show translation controls.
 * Injects CSS directly into Shadow DOM for style isolation.
 */

import { createRoot, Root } from 'react-dom/client';
import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from './network';

// CSS styles to inject into Shadow DOM
const WIDGET_STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  .widget-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    font-size: 14px;
  }

  .widget-button {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .widget-button:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 28px rgba(99, 102, 241, 0.5);
  }

  .widget-button svg {
    width: 28px;
    height: 28px;
    fill: white;
  }

  .widget-panel {
    position: absolute;
    bottom: 70px;
    right: 0;
    width: 280px;
    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    opacity: 0;
    transform: translateY(10px) scale(0.95);
    pointer-events: none;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .widget-panel.open {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .panel-title {
    color: white;
    font-weight: 600;
    font-size: 15px;
    margin: 0;
  }

  .credits-badge {
    background: rgba(139, 92, 246, 0.3);
    color: #c4b5fd;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .control-group {
    margin-bottom: 16px;
  }

  .control-label {
    color: #a5b4fc;
    font-size: 12px;
    font-weight: 500;
    margin-bottom: 8px;
    display: block;
  }

  .language-select {
    width: 100%;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: white;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .language-select:hover {
    border-color: rgba(139, 92, 246, 0.5);
    background: rgba(255, 255, 255, 0.08);
  }

  .language-select:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2);
  }

  .language-select option {
    background: #1e1b4b;
    color: white;
  }

  .translate-button {
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .translate-button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
  }

  .translate-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .translate-button svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }

  .translate-button.active {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    animation: pulse 2s ease-in-out infinite;
  }

  .widget-button.active {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    animation: pulse 2s ease-in-out infinite;
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
  }

  .auth-warning {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 12px;
    border-radius: 10px;
    font-size: 13px;
    text-align: center;
  }

  .status-message {
    color: #a5b4fc;
    font-size: 12px;
    text-align: center;
    margin-top: 12px;
  }

  .status-message.error {
    color: #fca5a5;
  }

  .status-message.success {
    color: #86efac;
  }
`;

// Available target languages
const LANGUAGES = [
  'Vietnamese', 'English', 'Japanese', 'Korean',
  'Chinese (Simplified)', 'Chinese (Traditional)',
  'Spanish', 'French', 'Portuguese', 'Indonesian',
  'Thai', 'Russian', 'German', 'Italian'
];

// Translation icon SVG
const TranslateIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
  </svg>
);

interface MangaWidgetProps {
  onToggleTranslation: (isActive: boolean, targetLang: string) => void;
}

function MangaWidget({ onToggleTranslation }: MangaWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credits] = useState<number | null>(null);
  const [targetLang, setTargetLang] = useState('Vietnamese');
  const [isActive, setIsActive] = useState(false);

  // Check auth status on mount and load saved language
  useEffect(() => {
    async function checkAuth() {
      const token = await getAuthToken();
      setIsAuthenticated(!!token);
    }
    checkAuth();

    // Load saved language preference
    chrome.storage.sync.get(['targetLang'], (result) => {
      if (result.targetLang) {
        setTargetLang(result.targetLang);
      }
    });
  }, []);

  // Refresh auth when panel opens
  useEffect(() => {
    if (isOpen) {
      getAuthToken().then(token => setIsAuthenticated(!!token));
    }
  }, [isOpen]);

  // Save language preference when changed
  const handleLanguageChange = useCallback((lang: string) => {
    setTargetLang(lang);
    chrome.storage.sync.set({ targetLang: lang });
  }, []);

  // Handle toggle button click
  const handleToggle = useCallback(() => {
    if (!isAuthenticated) return;

    const newActiveState = !isActive;
    setIsActive(newActiveState);
    onToggleTranslation(newActiveState, targetLang);
  }, [isAuthenticated, isActive, targetLang, onToggleTranslation]);

  return (
    <div className="widget-container">
      {/* Expandable Panel */}
      <div className={`widget-panel ${isOpen ? 'open' : ''}`}>
        <div className="panel-header">
          <h3 className="panel-title">Manga Translator</h3>
          {credits !== null && (
            <span className="credits-badge">{credits} credits</span>
          )}
        </div>

        {!isAuthenticated ? (
          <div className="auth-warning">
            Please log in via the extension popup to use translation.
          </div>
        ) : (
          <>
            <div className="control-group">
              <label className="control-label">Target Language</label>
              <select
                className="language-select"
                value={targetLang}
                onChange={(e) => handleLanguageChange(e.target.value)}
                disabled={isActive}
              >
                {LANGUAGES.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

            <button
              className={`translate-button ${isActive ? 'active' : ''}`}
              onClick={handleToggle}
            >
              <TranslateIcon />
              {isActive ? 'Stop Translating' : 'Start Auto-Translate'}
            </button>

            {isActive && (
              <div className="status-message success">
                ✓ Active Mode: Translating images as you scroll
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Button */}
      <button
        className={`widget-button ${isActive ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Manga Translator"
      >
        <TranslateIcon />
      </button>
    </div>
  );
}

// Widget state
let widgetRoot: Root | null = null;

/**
 * Initialize the floating widget with Shadow DOM isolation.
 * @param onToggleTranslation Callback triggered when user toggles Active Translation Mode
 */
export function initWidget(onToggleTranslation: (isActive: boolean, targetLang: string) => void): void {
  // Prevent double initialization
  if (document.getElementById('manga-translator-widget-host')) {
    console.log('[MangaTranslator] Widget already initialized');
    return;
  }


  // Create host element
  const host = document.createElement('div');
  host.id = 'manga-translator-widget-host';
  document.body.appendChild(host);

  // Attach Shadow DOM
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject styles into Shadow DOM
  const styleElement = document.createElement('style');
  styleElement.textContent = WIDGET_STYLES;
  shadow.appendChild(styleElement);

  // Create React mount point
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  // Render React component
  widgetRoot = createRoot(mountPoint);
  widgetRoot.render(<MangaWidget onToggleTranslation={onToggleTranslation} />);

  console.log('[MangaTranslator] Widget initialized with Shadow DOM');
}

/**
 * Destroy the widget (for cleanup)
 */
export function destroyWidget(): void {
  if (widgetRoot) {
    widgetRoot.unmount();
    widgetRoot = null;
  }

  const host = document.getElementById('manga-translator-widget-host');
  if (host) {
    host.remove();
  }

  console.log('[MangaTranslator] Widget destroyed');
}
