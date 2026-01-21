/**
 * Manga Translator - Content Script Entry Point
 * 
 * Initializes observers, loads settings, and orchestrates the translation flow:
 * Observer -> Processor -> Network -> Overlay
 */

import type { Settings, TranslationStatus } from './types';
import { ImageProcessor } from './processor';

// State management
const imageStates = new Map<string, TranslationStatus>();

// Default settings
let settings: Settings = {
    enabled: true,
    targetLang: 'en',
    backendUrl: 'http://localhost:8000',
};

// Processor instance
let processor: ImageProcessor;

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
 * Callback for IntersectionObserver.
 * Processes images as they enter the viewport.
 */
function handleIntersection(entries: IntersectionObserverEntry[]): void {
    if (!settings.enabled) return;

    for (const entry of entries) {
        if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            processor.processImage(img);
        }
    }
}

/**
 * Create and configure the IntersectionObserver
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
function observeImages(observer: IntersectionObserver): void {
    const images = document.querySelectorAll('img');
    images.forEach((img) => {
        if (!img.dataset.mangaTranslatorObserved) {
            img.dataset.mangaTranslatorObserved = 'true';
            observer.observe(img);
        }
    });
}

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
                    const images = node.querySelectorAll('img');
                    if (images.length > 0) {
                        observeImages(intersectionObserver);
                    }
                }
            }
        }
    });
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
            });
            break;

        case 'TOGGLE_ENABLED':
            settings.enabled = message.enabled;
            sendResponse({ success: true });
            break;

        case 'REPROCESS_PAGE':
            imageStates.clear();
            const observer = createIntersectionObserver();
            observeImages(observer);
            sendResponse({ success: true });
            break;

        default:
            sendResponse({ error: 'Unknown message type' });
    }

    return true;
});

/**
 * Initialize the content script
 */
async function init(): Promise<void> {
    console.log('[MangaTranslator] Content script loaded');

    await loadSettings();

    if (!settings.enabled) {
        console.log('[MangaTranslator] Extension is disabled');
        return;
    }

    processor = new ImageProcessor(settings, imageStates);

    const intersectionObserver = createIntersectionObserver();
    observeImages(intersectionObserver);

    const mutationObserver = createMutationObserver(intersectionObserver);
    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });

    console.log('[MangaTranslator] Observers initialized');
}

// Start the extension
init();
