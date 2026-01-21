/**
 * Manga Translator - Background Proxy Module
 * 
 * Handles CORS-free fetch operations and header spoofing.
 * Provides image fetching and API proxying for content scripts.
 */

// Rule ID for declarativeNetRequest
const REFERER_RULE_ID = 1;

// Response interface for message handlers
interface MessageResponse {
    success?: boolean;
    error?: string;
    [key: string]: unknown;
}

/**
 * Set up a dynamic rule to spoof the Referer header for a specific URL.
 * This bypasses CDN anti-hotlinking protection.
 */
export async function setRefererRule(targetUrl: string, referer: string): Promise<void> {
    console.log('[MangaTranslator:BG] Setting referer rule for:', targetUrl.substring(0, 60) + '...');

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
export async function clearRefererRule(): Promise<void> {
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
 * Convert a Blob to a Base64 Data URL string.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
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

/**
 * Convert a Base64 Data URL to a Blob.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
}

/**
 * Fetch an image as Base64 Data URL with referer spoofing.
 * Background service worker has full host_permissions and bypasses CORS.
 */
export async function handleFetchImageBlob(
    message: { url?: string; referer?: string },
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
        if (referer) {
            await setRefererRule(url, referer);
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Referer': referer || '',
                'Origin': referer ? new URL(referer).origin : '',
            },
        });

        if (referer) {
            await clearRefererRule();
        }

        if (!response.ok) {
            throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        console.log('[MangaTranslator:BG] Image fetched:', blob.size, 'bytes, type:', blob.type);

        const dataUrl = await blobToDataUrl(blob);

        sendResponse({
            success: true,
            dataUrl: dataUrl,
            size: blob.size,
            mimeType: blob.type,
        });

    } catch (error) {
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
 * Proxy API requests from content script to bypass PNA restrictions.
 */
export async function handleProxyApiRequest(
    message: {
        url?: string;
        method?: string;
        formDataParts?: Array<{ name: string; data: string; filename?: string }>;
        headers?: Record<string, string>;
    },
    sendResponse: (response: MessageResponse) => void
): Promise<void> {
    const url = message.url as string;
    const method = message.method || 'POST';
    const formDataParts = message.formDataParts;
    const headers = message.headers;

    if (!url) {
        sendResponse({ success: false, error: 'No URL provided' });
        return;
    }

    console.log('[MangaTranslator:BG] Proxying API request:', method, url);

    try {
        const fetchOptions: RequestInit = {
            method,
            headers: headers || {},
        };

        if (formDataParts && formDataParts.length > 0) {
            const formData = new FormData();

            for (const part of formDataParts) {
                if (part.data.startsWith('data:') || part.data.includes(',')) {
                    const blob = await dataUrlToBlob(part.data);
                    formData.append(part.name, blob, part.filename || 'file');
                } else {
                    formData.append(part.name, part.data);
                }
            }

            fetchOptions.body = formData;
        }

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[MangaTranslator:BG] API response received:', typeof data);

        sendResponse({
            success: true,
            data: data,
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[MangaTranslator:BG] API proxy error:', errorMessage);
        sendResponse({
            success: false,
            error: errorMessage,
        });
    }
}
