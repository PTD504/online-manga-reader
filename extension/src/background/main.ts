/**
 * Manga Translator - Background Service Worker Entry Point
 * 
 * Handles message passing between content scripts and popup.
 * Routes messages to appropriate handlers in the proxy module.
 */

import { handleFetchImageBlob, handleProxyApiRequest, clearRefererRule } from './proxy';

// Message interfaces
interface MessageRequest {
    type: string;
    [key: string]: unknown;
}

interface MessageResponse {
    success?: boolean;
    error?: string;
    [key: string]: unknown;
}

/**
 * Handle messages from content scripts or popup
 */
chrome.runtime.onMessage.addListener(
    (
        message: MessageRequest,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: MessageResponse) => void
    ) => {
        console.log('[MangaTranslator:BG] Received message:', message.type, 'from:', sender.tab?.id);

        switch (message.type) {
            case 'FETCH_IMAGE_BLOB':
                handleFetchImageBlob(message as { url?: string; referer?: string }, sendResponse);
                break;

            case 'PROXY_API_REQUEST':
                handleProxyApiRequest(
                    message as {
                        url?: string;
                        method?: string;
                        formDataParts?: Array<{ name: string; data: string; filename?: string }>;
                        headers?: Record<string, string>;
                    },
                    sendResponse
                );
                break;

            case 'GET_SETTINGS':
                handleGetSettings(sendResponse);
                break;

            case 'SAVE_SETTINGS':
                handleSaveSettings(message, sendResponse);
                break;

            case 'FORWARD_TO_TAB':
                handleForwardToTab(message, sendResponse);
                break;

            default:
                sendResponse({ error: 'Unknown message type' });
        }

        return true;
    }
);

/**
 * Get settings from storage
 */
async function handleGetSettings(
    sendResponse: (response: MessageResponse) => void
): Promise<void> {
    try {
        const result = await chrome.storage.sync.get([
            'enabled',
            'targetLang',
            'backendUrl',
        ]);

        sendResponse({
            success: true,
            settings: {
                enabled: result.enabled ?? true,
                targetLang: result.targetLang ?? 'en',
                backendUrl: result.backendUrl ?? 'http://localhost:8000',
            },
        });
    } catch (error) {
        console.error('[MangaTranslator:BG] Failed to get settings:', error);
        sendResponse({ error: 'Failed to get settings' });
    }
}

/**
 * Save settings to storage
 */
async function handleSaveSettings(
    message: MessageRequest,
    sendResponse: (response: MessageResponse) => void
): Promise<void> {
    try {
        const { enabled, targetLang, backendUrl } = message;

        await chrome.storage.sync.set({
            enabled,
            targetLang,
            backendUrl,
        });

        sendResponse({ success: true });
    } catch (error) {
        console.error('[MangaTranslator:BG] Failed to save settings:', error);
        sendResponse({ error: 'Failed to save settings' });
    }
}

/**
 * Forward a message to a specific tab's content script
 */
async function handleForwardToTab(
    message: MessageRequest,
    sendResponse: (response: MessageResponse) => void
): Promise<void> {
    try {
        const { tabId, payload } = message as {
            tabId: number;
            payload: MessageRequest;
            type: string;
        };

        if (!tabId) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                const response = await chrome.tabs.sendMessage(tab.id, payload);
                sendResponse({ success: true, ...response });
            } else {
                sendResponse({ error: 'No active tab found' });
            }
        } else {
            const response = await chrome.tabs.sendMessage(tabId, payload);
            sendResponse({ success: true, ...response });
        }
    } catch (error) {
        console.error('[MangaTranslator:BG] Failed to forward message:', error);
        sendResponse({ error: 'Failed to forward message to tab' });
    }
}

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
    console.log('[MangaTranslator:BG] Extension installed:', details.reason);

    if (details.reason === 'install') {
        chrome.storage.sync.set({
            enabled: true,
            targetLang: 'en',
            backendUrl: 'http://localhost:8000',
        });

        console.log('[MangaTranslator:BG] Default settings initialized');
    }

    clearRefererRule().catch(console.error);
});

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(() => {
    console.log('[MangaTranslator:BG] Extension started');
    clearRefererRule().catch(console.error);
});

console.log('[MangaTranslator:BG] Service worker initialized');
