/**
 * Manga Translator - Content Script
 * 
 * Detects manga images in viewport, sends to backend for detection/translation,
 * and renders translation overlays using DOM injection.
 * 
 * Uses background service worker proxy to bypass CORS restrictions.
 */

// ============================================================================
// Types
// ============================================================================

interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

interface TranslationResponse {
    translated: string;
}

interface Settings {
    enabled: boolean;
    targetLang: string;
    backendUrl: string;
}

interface FetchImageResponse {
    success: boolean;
    dataUrl?: string;
    size?: number;
    mimeType?: string;
    error?: string;
}

type TranslationStatus = 'pending' | 'processing' | 'completed' | 'error';

// ============================================================================
// State Management
// ============================================================================

// Map to track processed images and prevent re-processing
const imageStates = new Map<string, TranslationStatus>();

// Default settings
let settings: Settings = {
    enabled: true,
    targetLang: 'en',
    backendUrl: 'http://localhost:8000',
};

// ============================================================================
// Settings Management
// ============================================================================

/**
 * Load settings from Chrome storage
 */
async function loadSettings(): Promise<void> {
    try {
        const result = await chrome.storage.sync.get(['enabled', 'targetLang', 'backendUrl']);
        settings = {
            enabled: result.enabled ?? true,
            targetLang: result.targetLang ?? 'en',
            backendUrl: result.backendUrl ?? 'http://localhost:8000',
        };
        console.log('[MangaTranslator] Settings loaded:', settings);
    } catch (error) {
        console.error('[MangaTranslator] Failed to load settings:', error);
    }
}

/**
 * Listen for settings changes from popup
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        if (changes.enabled) settings.enabled = changes.enabled.newValue;
        if (changes.targetLang) settings.targetLang = changes.targetLang.newValue;
        if (changes.backendUrl) settings.backendUrl = changes.backendUrl.newValue;
        console.log('[MangaTranslator] Settings updated:', settings);
    }
});

// ============================================================================
// Overlay Manager
// ============================================================================

/**
 * OverlayManager handles the DOM manipulation for translation overlays.
 * It wraps images in containers and positions translation bubbles.
 */
class OverlayManager {
    private image: HTMLImageElement;
    private wrapper: HTMLDivElement | null = null;
    private naturalWidth: number;
    private naturalHeight: number;

    constructor(image: HTMLImageElement, naturalWidth: number, naturalHeight: number) {
        this.image = image;
        this.naturalWidth = naturalWidth;
        this.naturalHeight = naturalHeight;
    }

    /**
     * Ensure the image is wrapped in a relative-positioned container
     */
    private ensureWrapper(): HTMLDivElement {
        // Check if already wrapped
        const parent = this.image.parentElement;
        if (parent?.classList.contains('manga-translator-wrapper')) {
            this.wrapper = parent as HTMLDivElement;
            return this.wrapper;
        }

        // Create wrapper div
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'manga-translator-wrapper';
        this.wrapper.style.cssText = `
      position: relative;
      display: inline-block;
      line-height: 0;
    `;

        // Wrap the image
        this.image.parentNode?.insertBefore(this.wrapper, this.image);
        this.wrapper.appendChild(this.image);

        return this.wrapper;
    }

    /**
     * Calculate scale factors for YOLO coordinates
     * YOLO coords are based on natural image size, but display may be CSS-scaled
     */
    private getScaleFactors(): { scaleX: number; scaleY: number } {
        const displayWidth = this.image.clientWidth || this.image.offsetWidth;
        const displayHeight = this.image.clientHeight || this.image.offsetHeight;

        return {
            scaleX: displayWidth / this.naturalWidth,
            scaleY: displayHeight / this.naturalHeight,
        };
    }

    /**
     * Create a translation bubble at the specified bounding box
     */
    createBubble(box: BoundingBox, translatedText: string): HTMLDivElement {
        const wrapper = this.ensureWrapper();
        const { scaleX, scaleY } = this.getScaleFactors();

        // Calculate scaled position and dimensions
        const left = box.x1 * scaleX;
        const top = box.y1 * scaleY;
        const width = (box.x2 - box.x1) * scaleX;
        const height = (box.y2 - box.y1) * scaleY;

        // Create bubble element
        const bubble = document.createElement('div');
        bubble.className = 'manga-translator-bubble';
        bubble.textContent = translatedText;

        // Position the bubble absolutely within the wrapper
        bubble.style.cssText = `
      position: absolute;
      left: ${left}px;
      top: ${top}px;
      width: ${width}px;
      height: ${height}px;
    `;

        wrapper.appendChild(bubble);
        return bubble;
    }

    /**
     * Remove all translation bubbles from this image
     */
    clearBubbles(): void {
        if (this.wrapper) {
            const bubbles = this.wrapper.querySelectorAll('.manga-translator-bubble');
            bubbles.forEach((bubble) => bubble.remove());
        }
    }
}

// ============================================================================
// Image Fetching via Background Proxy (CORS Bypass)
// ============================================================================

/**
 * Fetch image via background service worker to bypass CORS.
 * The background worker has full host_permissions and isn't subject to page CORS.
 * Returns a Blob that can be used for canvas operations without tainting.
 */
async function fetchImageViaBackground(imageUrl: string): Promise<Blob> {
    console.log('[MangaTranslator] Requesting image via background proxy:', imageUrl.substring(0, 80) + '...');

    // Get current page URL as referer to bypass CDN anti-hotlinking
    const referer = window.location.href;

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: 'FETCH_IMAGE_BLOB', url: imageUrl, referer: referer },
            (response: FetchImageResponse) => {
                // Check for Chrome runtime errors
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

                // Convert Base64 Data URL back to Blob
                dataUrlToBlob(response.dataUrl)
                    .then(resolve)
                    .catch(reject);
            }
        );


        
    });
}

/**
 * Convert a Base64 Data URL string back to a Blob.
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
}

/**
 * Create an ImageBitmap from a Blob for canvas drawing.
 * This creates a clean, non-tainted image source.
 */
async function createBitmapFromBlob(blob: Blob): Promise<ImageBitmap> {
    return createImageBitmap(blob);
}

/**
 * Crop a region from the bitmap based on bounding box.
 * Uses a clean bitmap to avoid tainted canvas.
 */
async function cropFromBitmap(
    bitmap: ImageBitmap,
    box: BoundingBox
): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const width = Math.round(box.x2 - box.x1);
    const height = Math.round(box.y2 - box.y1);

    // Ensure minimum dimensions
    canvas.width = Math.max(width, 1);
    canvas.height = Math.max(height, 1);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    // Draw cropped region from bitmap (not tainted since bitmap came from fetched blob)
    ctx.drawImage(
        bitmap,
        Math.round(box.x1), Math.round(box.y1), width, height, // Source rectangle
        0, 0, width, height                                     // Destination rectangle
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Failed to crop image to blob'));
            },
            'image/png',
            1.0
        );
    });
}

// ============================================================================
// API Communication
// ============================================================================

/**
 * Step 1: Send image to detection API
 * Returns an array of bounding boxes, or empty array if detection fails.
 */
async function detectBubbles(imageBlob: Blob): Promise<BoundingBox[]> {
    const formData = new FormData();
    formData.append('file', imageBlob, 'image.png');

    const response = await fetch(`${settings.backendUrl}/detect`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Detection API error: ${response.status}`);
    }

    const data = await response.json();

    // Debug: Log raw response to understand structure
    console.log('[MangaTranslator] Raw detection response:', data);

    // Handle various response formats defensively
    // Expected: { boxes: [...] } or direct array [...]
    let boxes: BoundingBox[] | undefined;

    if (Array.isArray(data)) {
        // Response is directly an array
        boxes = data;
    } else if (data && typeof data === 'object') {
        // Response is an object, try common field names
        boxes = data.boxes || data.detections || data.results || data.data;
    }

    // Validate boxes is an array
    if (!boxes || !Array.isArray(boxes)) {
        console.warn('[MangaTranslator] Invalid detection response format:', data);
        return [];
    }

    // Validate each box has required fields
    const validBoxes = boxes.filter((box): box is BoundingBox => {
        return (
            box &&
            typeof box === 'object' &&
            typeof box.x1 === 'number' &&
            typeof box.y1 === 'number' &&
            typeof box.x2 === 'number' &&
            typeof box.y2 === 'number'
        );
    });

    if (validBoxes.length !== boxes.length) {
        console.warn(`[MangaTranslator] Filtered out ${boxes.length - validBoxes.length} invalid boxes`);
    }

    return validBoxes;
}

/**
 * Step 3: Send cropped bubble to translation API
 */
async function translateBubble(croppedBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append('file', croppedBlob, 'bubble.png');
    formData.append('target_lang', settings.targetLang);

    const response = await fetch(`${settings.backendUrl}/translate-bubble`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Translation API error: ${response.status}`);
    }

    const data: TranslationResponse = await response.json();
    return data.translated;
}

// ============================================================================
// Main Processing Pipeline
// ============================================================================

/**
 * Main processing pipeline for a detected image.
 * Uses background service worker to fetch images (bypasses CORS).
 */
async function processImage(img: HTMLImageElement): Promise<void> {
    const imageUrl = img.src;
    const imageKey = imageUrl || img.dataset.mangaTranslatorId || crypto.randomUUID();

    // Skip if already processed or processing
    if (imageStates.has(imageKey)) {
        console.log('[MangaTranslator] Skipping already processed image:', imageKey);
        return;
    }

    // Skip data URLs and blob URLs (these don't have CORS issues)
    if (!imageUrl || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
        console.log('[MangaTranslator] Skipping non-fetchable image:', imageKey);
        return;
    }

    // Mark as processing
    imageStates.set(imageKey, 'processing');
    console.log('[MangaTranslator] Processing image:', imageKey);

    try {
        // Ensure image element is in the DOM and has rendered dimensions
        if (!img.complete) {
            await new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
            });
        }

        // =====================================================================
        // BACKGROUND PROXY STRATEGY: Fetch via service worker to bypass CORS
        // =====================================================================

        // Step 1: Fetch the image via background worker (bypasses CORS completely)
        const imageBlob = await fetchImageViaBackground(imageUrl);
        console.log('[MangaTranslator] Image blob received:', imageBlob.size, 'bytes');

        // Step 2: Create a clean ImageBitmap from the blob
        const bitmap = await createBitmapFromBlob(imageBlob);
        const naturalWidth = bitmap.width;
        const naturalHeight = bitmap.height;

        console.log('[MangaTranslator] Bitmap created:', naturalWidth, 'x', naturalHeight);

        // Skip small images (likely icons, not manga)
        if (naturalWidth < 200 || naturalHeight < 200) {
            console.log('[MangaTranslator] Skipping small image:', imageKey);
            imageStates.set(imageKey, 'completed');
            bitmap.close();
            return;
        }

        // Step 3: Send the fetched blob directly to Detection API
        const boxes = await detectBubbles(imageBlob);

        // Defensive check: ensure boxes is a valid array
        if (!boxes || !Array.isArray(boxes)) {
            console.warn('[MangaTranslator] Invalid boxes response (expected array):', boxes);
            imageStates.set(imageKey, 'error');
            bitmap.close();
            return;
        }

        console.log(`[MangaTranslator] Detected ${boxes.length} bubbles`);

        if (boxes.length === 0) {
            console.log('[MangaTranslator] No bubbles detected in image.');
            imageStates.set(imageKey, 'completed');
            bitmap.close();
            return;
        }

        // Create overlay manager for this image (with natural dimensions from bitmap)
        const overlayManager = new OverlayManager(img, naturalWidth, naturalHeight);

        // Step 4 & 5: Crop each bubble and translate
        for (const box of boxes) {
            try {
                // Step 4: Crop the bubble region using the clean bitmap
                const croppedBlob = await cropFromBitmap(bitmap, box);

                // Step 5: Translate the cropped bubble
                const translatedText = await translateBubble(croppedBlob);

                // Step 6: Render the overlay
                overlayManager.createBubble(box, translatedText);

                console.log(`[MangaTranslator] Translated bubble:`, translatedText);
            } catch (error) {
                console.error('[MangaTranslator] Failed to process bubble:', error);
            }
        }

        // Clean up the bitmap
        bitmap.close();

        imageStates.set(imageKey, 'completed');
        console.log('[MangaTranslator] Image processing completed:', imageKey);

    } catch (error) {
        console.error('[MangaTranslator] Failed to process image:', error);
        imageStates.set(imageKey, 'error');
    }
}

// ============================================================================
// Intersection Observer (Lazy Loading Detection)
// ============================================================================

/**
 * Callback for IntersectionObserver
 * Processes images as they enter the viewport
 */
function handleIntersection(entries: IntersectionObserverEntry[]): void {
    if (!settings.enabled) return;

    for (const entry of entries) {
        if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            processImage(img);
        }
    }
}

/**
 * Create and configure the IntersectionObserver
 */
function createObserver(): IntersectionObserver {
    return new IntersectionObserver(handleIntersection, {
        root: null, // Use viewport as root
        rootMargin: '100px', // Start loading 100px before entering viewport
        threshold: 0.1, // Trigger when 10% of image is visible
    });
}

/**
 * Observe all images on the page
 */
function observeImages(observer: IntersectionObserver): void {
    const images = document.querySelectorAll('img');
    images.forEach((img) => {
        // Skip already observed images
        if (!img.dataset.mangaTranslatorObserved) {
            img.dataset.mangaTranslatorObserved = 'true';
            observer.observe(img);
        }
    });
}

// ============================================================================
// Mutation Observer (Dynamic Content Detection)
// ============================================================================

/**
 * Watch for dynamically added images (infinite scroll, lazy load, etc.)
 */
function createMutationObserver(intersectionObserver: IntersectionObserver): MutationObserver {
    return new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLImageElement) {
                    observeImages(intersectionObserver);
                } else if (node instanceof HTMLElement) {
                    // Check for images within added elements
                    const images = node.querySelectorAll('img');
                    if (images.length > 0) {
                        observeImages(intersectionObserver);
                    }
                }
            }
        }
    });
}

// ============================================================================
// Message Passing (Communication with Background/Popup)
// ============================================================================

/**
 * Handle messages from background script or popup
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[MangaTranslator] Received message:', message);

    switch (message.type) {
        case 'GET_STATUS':
            sendResponse({
                enabled: settings.enabled,
                processedCount: imageStates.size,
            });
            break;

        case 'TOGGLE_ENABLED':
            settings.enabled = message.enabled;
            sendResponse({ success: true });
            break;

        case 'REPROCESS_PAGE':
            // Clear state and reprocess all images
            imageStates.clear();
            const observer = createObserver();
            observeImages(observer);
            sendResponse({ success: true });
            break;

        default:
            sendResponse({ error: 'Unknown message type' });
    }

    return true; // Keep the message channel open for async response
});

// ============================================================================
// Initialization
// ============================================================================

async function init(): Promise<void> {
    console.log('[MangaTranslator] Content script loaded');

    // Load settings from storage
    await loadSettings();

    if (!settings.enabled) {
        console.log('[MangaTranslator] Extension is disabled');
        return;
    }

    // Create intersection observer for lazy detection
    const intersectionObserver = createObserver();

    // Observe existing images
    observeImages(intersectionObserver);

    // Watch for dynamically added images
    const mutationObserver = createMutationObserver(intersectionObserver);
    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });

    console.log('[MangaTranslator] Observers initialized');
}

// Start the extension
init();
