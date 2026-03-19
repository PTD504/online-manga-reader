/**
 * Manga Translator - Image Processor Module
 * 
 * Handles image bitmap creation, canvas cropping, and coordinate scaling.
 * Implements parallel bubble processing for improved performance.
 */

import type { BoundingBox, DetectedBubble, ProcessedBubble, Settings } from './types';
import { fetchImageViaBackground, detectBubbles, translateBubble, getAuthToken } from './network';
import { OverlayManager } from './overlay';

/**
 * Create an ImageBitmap from a Blob for canvas drawing.
 * This creates a clean, non-tainted image source.
 */
export async function createBitmapFromBlob(blob: Blob): Promise<ImageBitmap> {
    return createImageBitmap(blob);
}

/**
 * Crop a region from the bitmap based on bounding box.
 * Uses a clean bitmap to avoid tainted canvas.
 */
export async function cropFromBitmap(bitmap: ImageBitmap, box: BoundingBox): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const width = Math.round(box.x2 - box.x1);
    const height = Math.round(box.y2 - box.y1);

    canvas.width = Math.max(width, 1);
    canvas.height = Math.max(height, 1);

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.drawImage(
        bitmap,
        Math.round(box.x1), Math.round(box.y1), width, height,
        0, 0, width, height
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

/**
 * Process a single bubble: crop and translate.
 * Returns null if processing fails (error is logged but not thrown).
 */
async function processSingleBubble(
    bitmap: ImageBitmap,
    detection: DetectedBubble,
    settings: Settings,
    sourceImageUrl?: string
): Promise<ProcessedBubble | null> {
    try {
        const { box, polygon } = detection;
        const croppedBlob = await cropFromBitmap(bitmap, box);
        const result = await translateBubble(croppedBlob, settings, sourceImageUrl);
        return {
            box,
            polygon,
            translatedText: result.translated,
            shouldRender: result.should_render,
            cleanImage: result.clean_image,
        };
    } catch (error) {
        console.error('[MangaTranslator] Failed to process bubble:', error);
        return null;
    }
}

/**
 * Process all detected bubbles in parallel.
 * Uses Promise.all for concurrent translation requests.
 */
export async function processBubblesInParallel(
    bitmap: ImageBitmap,
    detections: DetectedBubble[],
    settings: Settings,
    sourceImageUrl?: string
): Promise<ProcessedBubble[]> {
    console.log(`[MangaTranslator] Processing ${detections.length} bubbles in parallel...`);

    const startTime = performance.now();

    const promises = detections.map((detection) => processSingleBubble(bitmap, detection, settings, sourceImageUrl));
    const results = await Promise.all(promises);

    const successfulResults = results.filter((r): r is ProcessedBubble => r !== null);

    const elapsed = Math.round(performance.now() - startTime);
    console.log(`[MangaTranslator] Parallel processing complete: ${successfulResults.length}/${detections.length} bubbles in ${elapsed}ms`);

    return successfulResults;
}

/**
 * ImageProcessor class - Main processing pipeline for manga images.
 */
export class ImageProcessor {
    private settings: Settings;
    private imageStates: Map<string, string>;

    constructor(settings: Settings, imageStates: Map<string, string>) {
        this.settings = settings;
        this.imageStates = imageStates;
    }

    /**
     * Update settings reference
     */
    updateSettings(settings: Settings): void {
        this.settings = settings;
    }

    /**
     * Generate a unique key for an image element
     */
    private getImageKey(img: HTMLImageElement): string {
        return img.src || img.dataset.mangaTranslatorId || crypto.randomUUID();
    }

    /**
     * Check if image should be skipped
     */
    private shouldSkip(img: HTMLImageElement): boolean {
        const imageUrl = img.src;
        const imageKey = this.getImageKey(img);

        if (this.imageStates.has(imageKey)) {
            console.log('[MangaTranslator] Skipping already processed image:', imageKey);
            return true;
        }

        if (!imageUrl || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
            console.log('[MangaTranslator] Skipping non-fetchable image:', imageKey);
            return true;
        }

        return false;
    }

    /**
     * Wait for image to fully load
     */
    private async waitForImageLoad(img: HTMLImageElement): Promise<void> {
        if (!img.complete) {
            await new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
            });
        }
    }

    /**
     * Main processing pipeline for a detected image.
     */
    async processImage(img: HTMLImageElement): Promise<void> {
        // Auth gatekeeper - check if user is logged in before processing
        const token = await getAuthToken();
        if (!token) {
            console.warn('[MangaTranslator] Not authenticated. Please log in to use translation.');
            return;
        }

        if (this.shouldSkip(img)) return;

        const imageKey = this.getImageKey(img);
        const imageUrl = img.src;

        this.imageStates.set(imageKey, 'processing');
        console.log('[MangaTranslator] Processing image:', imageKey);

        try {
            await this.waitForImageLoad(img);

            // Fetch image via background worker (bypasses CORS)
            const imageBlob = await fetchImageViaBackground(imageUrl);
            console.log('[MangaTranslator] Image blob received:', imageBlob.size, 'bytes');

            // Create a clean ImageBitmap
            const bitmap = await createBitmapFromBlob(imageBlob);
            const naturalWidth = bitmap.width;
            const naturalHeight = bitmap.height;
            console.log('[MangaTranslator] Bitmap created:', naturalWidth, 'x', naturalHeight);

            // Skip small images (likely icons, not manga)
            if (naturalWidth < 200 || naturalHeight < 200) {
                console.log('[MangaTranslator] Skipping small image:', imageKey);
                this.imageStates.set(imageKey, 'completed');
                bitmap.close();
                return;
            }

            // Detect bubbles
            const detections = await detectBubbles(imageBlob, this.settings);

            if (!detections || detections.length === 0) {
                console.log('[MangaTranslator] No bubbles detected in image.');
                this.imageStates.set(imageKey, 'completed');
                bitmap.close();
                return;
            }

            console.log(`[MangaTranslator] Detected ${detections.length} bubbles`);

            // Create overlay manager
            const overlayManager = new OverlayManager(img, naturalWidth, naturalHeight);

            // Process all bubbles in parallel, passing original image URL for idempotency
            const processedBubbles = await processBubblesInParallel(bitmap, detections, this.settings, imageUrl);

            // Render translation overlays in one canvas compositing pass
            const bubblesToRender = processedBubbles.filter((bubble) => {
                if (!bubble.shouldRender) {
                    console.log('[MangaTranslator] Skipping noise bubble:', bubble.translatedText.substring(0, 30));
                    return false;
                }
                return true;
            });

            await overlayManager.renderBubbles(bubblesToRender);
            console.log(`[MangaTranslator] Rendered ${bubblesToRender.length} bubbles to canvas overlay`);

            bitmap.close();
            this.imageStates.set(imageKey, 'completed');
            console.log('[MangaTranslator] Image processing completed:', imageKey);

        } catch (error) {
            console.error('[MangaTranslator] Failed to process image:', error);
            this.imageStates.set(imageKey, 'error');
        }
    }
}
