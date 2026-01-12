/**
 * Manga Translator - Background Service Worker
 * 
 * Handles message passing between content scripts and popup.
 * Provides CORS-free fetch proxy with referer spoofing for content scripts.
 */

// ============================================================================
// Types
// ============================================================================

interface MessageRequest {
    type: string;
    [key: string]: unknown;
}

interface MessageResponse {
    success?: boolean;
    error?: string;
    [key: string]: unknown;
}

// Rule ID for declarativeNetRequest (using fixed ID for simplicity)
const REFERER_RULE_ID = 1;

// ============================================================================
// Message Handlers
// ============================================================================

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
                handleFetchImageBlob(message, sendResponse);
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

        return true; // Keep channel open for async response
    }
);

// ============================================================================
// Image Fetch Proxy with Referer Spoofing (CORS & Anti-Hotlinking Bypass)
// ============================================================================

/**
 * Set up a dynamic rule to spoof the Referer header for a specific URL.
 * This bypasses CDN anti-hotlinking protection.
 */
async function setRefererRule(targetUrl: string, referer: string): Promise<void> {
    console.log('[MangaTranslator:BG] Setting referer rule for:', targetUrl.substring(0, 60) + '...');
    console.log('[MangaTranslator:BG] Referer:', referer);

    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [REFERER_RULE_ID],
            addRules: [{
                id: REFERER_RULE_ID,
                priority: 1,
                action: {
                    type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
                    requestHeaders: [
                        {
                            header: 'Referer',
                            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                            value: referer
                        },
                        {
                            header: 'Origin',
                            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                            value: new URL(referer).origin
                        }
                    ]
                },
                condition: {
                    urlFilter: targetUrl,
                    resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST]
                }
            }]
        });
        console.log('[MangaTranslator:BG] Referer rule set successfully');
    } catch (error) {
        console.error('[MangaTranslator:BG] Failed to set referer rule:', error);
        throw error;
    }
}

/**
 * Clean up the dynamic referer rule after fetch is complete.
 */
async function clearRefererRule(): Promise<void> {
    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [REFERER_RULE_ID]
        });
        console.log('[MangaTranslator:BG] Referer rule cleared');
    } catch (error) {
        console.error('[MangaTranslator:BG] Failed to clear referer rule:', error);
    }
}

/**
 * Fetch an image as Base64 Data URL with referer spoofing.
 * Background service worker has full host_permissions and bypasses CORS.
 * 
 * @param message - Contains { type: 'FETCH_IMAGE_BLOB', url: string, referer: string }
 * @param sendResponse - Callback to send response back to content script
 */
async function handleFetchImageBlob(
    message: MessageRequest,
    sendResponse: (response: MessageResponse) => void
): Promise<void> {
    const url = message.url as string;
    const referer = message.referer as string || '';

    if (!url) {
        sendResponse({ success: false, error: 'No URL provided' });
        return;
    }

    console.log('[MangaTranslator:BG] Fetching image:', url.substring(0, 80) + '...');

    try {
        // Step 1: Set up referer spoofing rule if referer is provided
        if (referer) {
            await setRefererRule(url, referer);
        }

        // Step 2: Fetch the image using extension's host_permissions (bypasses CORS)
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                // Also set headers directly as backup
                'Referer': referer || '',
                'Origin': referer ? new URL(referer).origin : '',
            },
            // No CORS restrictions in service worker with host_permissions
        });

        // Step 3: Clean up the rule (do this regardless of success/failure)
        if (referer) {
            await clearRefererRule();
        }

        if (!response.ok) {
            throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
        }

        // Get the blob
        const blob = await response.blob();
        console.log('[MangaTranslator:BG] Image fetched:', blob.size, 'bytes, type:', blob.type);

        // Convert Blob to Base64 Data URL
        // We can't send Blob directly via Chrome messaging, so we convert to string
        const dataUrl = await blobToDataUrl(blob);

        sendResponse({
            success: true,
            dataUrl: dataUrl,
            size: blob.size,
            mimeType: blob.type,
        });

    } catch (error) {
        // Clean up rule on error
        if (referer) {
            await clearRefererRule();
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[MangaTranslator:BG] Failed to fetch image:', errorMessage);
        sendResponse({
            success: false,
            error: errorMessage,
        });
    }
}

/**
 * Convert a Blob to a Base64 Data URL string.
 * Uses FileReader for browser compatibility.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error('FileReader did not return a string'));
            }
        };

        reader.onerror = () => {
            reject(new Error('FileReader error: ' + reader.error?.message));
        };

        reader.readAsDataURL(blob);
    });
}

// ============================================================================
// Settings Handlers
// ============================================================================

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
            // Send to active tab
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

// ============================================================================
// Installation & Update Handlers
// ============================================================================

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
    console.log('[MangaTranslator:BG] Extension installed:', details.reason);

    if (details.reason === 'install') {
        // Set default settings on first install
        chrome.storage.sync.set({
            enabled: true,
            targetLang: 'en',
            backendUrl: 'http://localhost:8000',
        });

        console.log('[MangaTranslator:BG] Default settings initialized');
    }

    // Clear any existing dynamic rules on install/update
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [REFERER_RULE_ID]
    }).catch(console.error);
});

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(() => {
    console.log('[MangaTranslator:BG] Extension started');

    // Clear any leftover dynamic rules
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [REFERER_RULE_ID]
    }).catch(console.error);
});

// Log that background script is ready
console.log('[MangaTranslator:BG] Service worker initialized');
