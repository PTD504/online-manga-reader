/**
 * Manga Translator - Network Communication Module
 * 
 * Handles all communication with the Background Service Worker.
 * Provides CORS-free fetch proxy and API request handling.
 */

import type {
    BoundingBox,
    FetchImageResponse,
    ProxyApiResponse,
    DetectionApiResponse,
    TranslationResponse,
    Settings,
} from './types';

/**
 * Convert a Blob to a base64 Data URL for Chrome message serialization.
 * Chrome messaging cannot transfer Blob objects directly.
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
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
    });
}

/**
 * Convert a Base64 Data URL string back to a Blob.
 */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
}

/**
 * Fetch image via background service worker to bypass CORS.
 * The background worker has full host_permissions and is not subject to page CORS.
 */
export function fetchImageViaBackground(imageUrl: string): Promise<Blob> {
    console.log('[MangaTranslator] Requesting image via background proxy:', imageUrl.substring(0, 80) + '...');

    const referer = window.location.href;

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: 'FETCH_IMAGE_BLOB', url: imageUrl, referer: referer },
            (response: FetchImageResponse) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Chrome runtime error: ${chrome.runtime.lastError.message}`));
                    return;
                }

                if (!response) {
                    reject(new Error('No response from background worker'));
                    return;
                }

                if (!response.success || !response.dataUrl) {
                    reject(new Error(response.error || 'Failed to fetch image via background'));
                    return;
                }

                console.log('[MangaTranslator] Received data URL from background:', response.size, 'bytes');

                dataUrlToBlob(response.dataUrl)
                    .then(resolve)
                    .catch(reject);
            }
        );
    });
}

/**
 * Storage key for access token - must match the key used in supabase.ts
 */
const AUTH_TOKEN_KEY = 'manga-translator-access-token';

/**
 * Get the auth token from Chrome storage.
 * Returns null if not authenticated.
 */
export async function getAuthToken(): Promise<string | null> {
    try {
        const result = await chrome.storage.local.get([AUTH_TOKEN_KEY]);
        const token = result[AUTH_TOKEN_KEY] || null;
        if (token) {
            console.log('[MangaTranslator] Auth token found');
        } else {
            console.log('[MangaTranslator] No auth token - user not logged in');
        }
        return token;
    } catch (error) {
        console.error('[MangaTranslator] Failed to get auth token:', error);
        return null;
    }
}

/**
 * Send an API request via the background service worker proxy.
 * This bypasses PNA (Private Network Access) restrictions that block
 * content scripts from making requests to localhost.
 * Includes Authorization header if user is authenticated.
 */
export async function proxyApiRequest(
    url: string,
    formDataParts: Array<{ name: string; data: string; filename?: string }>
): Promise<ProxyApiResponse> {
    // Get auth token if available
    const token = await getAuthToken();
    const headers: Record<string, string> = {};

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                type: 'PROXY_API_REQUEST',
                url,
                method: 'POST',
                formDataParts,
                headers,
            },
            (response: ProxyApiResponse) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Chrome runtime error: ${chrome.runtime.lastError.message}`));
                    return;
                }
                if (!response) {
                    reject(new Error('No response from background worker'));
                    return;
                }
                resolve(response);
            }
        );
    });
}

/**
 * Send image to detection API via background proxy.
 * Returns an array of bounding boxes, or empty array if detection fails.
 */
export async function detectBubbles(imageBlob: Blob, settings: Settings): Promise<BoundingBox[]> {
    const imageDataUrl = await blobToDataUrl(imageBlob);

    const formDataParts = [
        { name: 'file', data: imageDataUrl, filename: 'image.png' },
    ];

    const response = await proxyApiRequest(`${settings.backendUrl}/detect`, formDataParts);

    if (!response.success) {
        throw new Error(response.error || 'Detection API error');
    }

    const data = response.data as DetectionApiResponse;

    console.log('[MangaTranslator] Raw detection response:', data);

    const detections = data?.detections;

    if (!detections || !Array.isArray(detections)) {
        console.warn('[MangaTranslator] No detections array in response:', data);
        return [];
    }

    const boxes: BoundingBox[] = [];
    for (const detection of detections) {
        if (!detection.box || !Array.isArray(detection.box) || detection.box.length !== 4) {
            console.warn('[MangaTranslator] Invalid detection box format:', detection);
            continue;
        }

        const [x1, y1, x2, y2] = detection.box;

        if (typeof x1 !== 'number' || typeof y1 !== 'number' ||
            typeof x2 !== 'number' || typeof y2 !== 'number') {
            console.warn('[MangaTranslator] Box coordinates are not numbers:', detection.box);
            continue;
        }

        if (x2 <= x1 || y2 <= y1) {
            console.warn('[MangaTranslator] Box has invalid dimensions:', detection.box);
            continue;
        }

        boxes.push({ x1, y1, x2, y2 });
    }

    console.log(`[MangaTranslator] Parsed ${boxes.length} valid boxes from ${detections.length} detections`);
    return boxes;
}

/**
 * Send cropped bubble to translation API via background proxy.
 * Handles authentication (401) and credit (402) errors.
 * @param croppedBlob The cropped bubble image
 * @param settings User settings including backend URL and target language
 * @param sourceImageUrl Original full image URL for pay-per-page idempotency
 */
export async function translateBubble(
    croppedBlob: Blob,
    settings: Settings,
    sourceImageUrl?: string
): Promise<string> {
    const croppedDataUrl = await blobToDataUrl(croppedBlob);

    const formDataParts = [
        { name: 'file', data: croppedDataUrl, filename: 'bubble.png' },
        { name: 'target_lang', data: settings.targetLang },
        { name: 'source_image_url', data: sourceImageUrl || '' },
    ];

    const response = await proxyApiRequest(`${settings.backendUrl}/translate-bubble`, formDataParts);

    if (!response.success) {
        const status = response.status || 0;

        // Handle 401 Unauthorized - clear session
        if (status === 401) {
            console.error('[MangaTranslator] Session expired or invalid. Please log in again.');
            try {
                await chrome.storage.local.remove(['supabaseSession', 'supabaseAccessToken', 'supabaseRefreshToken']);
                console.log('[MangaTranslator] Session cleared from storage.');
            } catch (e) {
                console.error('[MangaTranslator] Failed to clear session:', e);
            }
            throw new Error('Session expired. Please log in again.');
        }

        // Handle 402 Payment Required - out of credits
        if (status === 402) {
            console.error('[MangaTranslator] Out of credits. Please purchase more credits to continue.');
            throw new Error('Out of credits');
        }

        throw new Error(response.error || 'Translation API error');
    }

    const data = response.data as TranslationResponse;
    return data.translated;
}
