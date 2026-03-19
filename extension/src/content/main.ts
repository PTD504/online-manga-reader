/**
 * Manga Translator - Content Script Entry Point
 * 
 * Phase 3.1: Active Translation Mode
 * - Floating widget toggles "Active Mode" on/off
 * - IntersectionObserver only processes images when Active Mode is ON
 * - Supports lazy-loading: new images auto-translate as they enter viewport
 */

import type { Settings, TranslationStatus } from './types';
import { ImageProcessor } from './processor';
import { initWidget } from './widget';

// State management
const imageStates = new Map<string, TranslationStatus>();

// Active Translation Mode flag
let isTranslatingActive = false;

// Default settings - must match popup defaults
let settings: Settings = {
    enabled: true,
    targetLang: 'Vietnamese',
    backendUrl: 'http://localhost:8000',
};

// Processor instance
let processor: ImageProcessor;

// Observers
let intersectionObserver: IntersectionObserver | null = null;
let mutationObserver: MutationObserver | null = null;

/**
 * Load settings from Chrome storage
 */
async function loadSettings(): Promise<void> {
    try {
        const result = await chrome.storage.sync.get(['enabled', 'targetLang', 'backendUrl']);
        settings = {
            enabled: result.enabled ?? true,
            targetLang: result.targetLang ?? 'Vietnamese',
            backendUrl: result.backendUrl ?? 'http://localhost:8000',
        };
        console.log('[MangaTranslator] Settings loaded:', settings);

        if (processor) {
            processor.updateSettings(settings);
        }
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

        if (processor) {
            processor.updateSettings(settings);
        }
    }
});

/**
 * Check if an image should be processed (is a manga image, not already done)
 */
function shouldProcessImage(img: HTMLImageElement): boolean {
    // Skip if already processed or processing
    const state = imageStates.get(img.src);
    if (state === 'completed' || state === 'processing') return false;

    // Skip data/blob URLs (can't track for idempotency)
    if (!img.src || img.src.startsWith('data:') || img.src.startsWith('blob:')) return false;

    // Skip small images (likely icons)
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (width < 200 || height < 200) return false;

    return true;
}

/**
 * Find all manga images on the page that should be translated.
 */
function findMangaImages(): HTMLImageElement[] {
    const images = Array.from(document.querySelectorAll('img'));
    return images.filter(shouldProcessImage);
}

/**
 * Callback for IntersectionObserver.
 * Only processes images when Active Translation Mode is ON.
 */
function handleIntersection(entries: IntersectionObserverEntry[]): void {
    // Only process if Active Mode is enabled
    if (!isTranslatingActive) return;
    if (!processor) return;

    for (const entry of entries) {
        if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;

            // Double-check this image should be processed
            if (shouldProcessImage(img)) {
                console.log('[MangaTranslator] Auto-translating visible image:', img.src.substring(0, 60) + '...');
                processor.processImage(img);
            }
        }
    }
}

/**
 * Create IntersectionObserver for viewport detection
 */
function createIntersectionObserver(): IntersectionObserver {
    return new IntersectionObserver(handleIntersection, {
        root: null,
        rootMargin: '100px',
        threshold: 0.1,
    });
}

/**
 * Observe all images on the page
 */
function observeImages(): void {
    if (!intersectionObserver) return;

    const images = document.querySelectorAll('img');
    images.forEach((img) => {
        if (!img.dataset.mangaTranslatorObserved) {
            img.dataset.mangaTranslatorObserved = 'true';
            intersectionObserver!.observe(img);
        }
    });
}

/**
 * Create MutationObserver to watch for new images (lazy loading, infinite scroll)
 */
function createMutationObserver(): MutationObserver {
    return new MutationObserver((mutations) => {
        // Only observe new images if Active Mode is on
        if (!isTranslatingActive) return;

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node instanceof HTMLImageElement) {
                    observeImages();
                } else if (node instanceof HTMLElement) {
                    const images = node.querySelectorAll('img');
                    if (images.length > 0) {
                        observeImages();
                    }
                }
            }
        }
    });
}

/**
 * Start Active Translation Mode
 */
async function startTranslating(targetLang: string): Promise<void> {
    console.log('[MangaTranslator] Starting Active Translation Mode');

    // Update settings with new target language
    settings.targetLang = targetLang;
    chrome.storage.sync.set({ targetLang });

    if (processor) {
        processor.updateSettings(settings);
    }

    // Set active flag
    isTranslatingActive = true;

    // Create observers if not already created
    if (!intersectionObserver) {
        intersectionObserver = createIntersectionObserver();
    }
    if (!mutationObserver) {
        mutationObserver = createMutationObserver();
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    // Observe all current images
    observeImages();

    // Process all currently visible manga images immediately
    const images = findMangaImages();
    console.log(`[MangaTranslator] Processing ${images.length} visible images`);

    for (const img of images) {
        // Process in background (don't await each one for better UX)
        processor.processImage(img);
    }
}

/**
 * Stop Active Translation Mode
 */
function stopTranslating(): void {
    console.log('[MangaTranslator] Stopping Active Translation Mode');
    isTranslatingActive = false;
    // Note: We keep observers alive but they will early-return in their callbacks
}

/**
 * Toggle translation mode - called by widget
 * @returns The new active state
 */
export function toggleTranslation(isActive: boolean, targetLang: string): void {
    if (isActive) {
        startTranslating(targetLang);
    } else {
        stopTranslating();
    }
}

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
                isTranslatingActive,
            });
            break;

        case 'TOGGLE_ENABLED':
            settings.enabled = message.enabled;
            sendResponse({ success: true });
            break;

        case 'REPROCESS_PAGE':
            imageStates.clear();
            if (isTranslatingActive) {
                startTranslating(settings.targetLang);
            }
            sendResponse({ success: true });
            break;

        default:
            sendResponse({ error: 'Unknown message type' });
    }

    return true;
});

/**
 * Initialize the content script.
 * Creates processor and mounts the floating widget.
 */
async function init(): Promise<void> {
    console.log('[MangaTranslator] Content script loaded (Phase 3.1 - Active Mode)');

    await loadSettings();

    // Create the processor
    processor = new ImageProcessor(settings, imageStates);

    // Initialize the floating widget with toggle callback
    initWidget(toggleTranslation);

    console.log('[MangaTranslator] Widget initialized, ready for user interaction');
}

// Start the extension
init();
