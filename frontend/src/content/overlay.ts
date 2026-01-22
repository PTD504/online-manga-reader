/**
 * Manga Translator - Overlay Manager Module
 * 
 * Handles DOM manipulation for translation overlays.
 * Wraps images in containers and positions translation bubbles.
 */

import type { BoundingBox } from './types';

/**
 * OverlayManager handles the DOM manipulation for translation overlays.
 * It wraps images in containers and positions translation bubbles.
 */
export class OverlayManager {
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
        const parent = this.image.parentElement;
        if (parent?.classList.contains('manga-translator-wrapper')) {
            this.wrapper = parent as HTMLDivElement;
            return this.wrapper;
        }

        this.wrapper = document.createElement('div');
        this.wrapper.className = 'manga-translator-wrapper';
        this.wrapper.style.cssText = `
            position: relative;
            display: inline-block;
            line-height: 0;
        `;

        this.image.parentNode?.insertBefore(this.wrapper, this.image);
        this.wrapper.appendChild(this.image);

        return this.wrapper;
    }

    /**
     * Calculate scale factors for YOLO coordinates.
     * YOLO coords are based on natural image size, but display may be CSS-scaled.
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
     * Determine bubble size class based on dimensions
     */
    private getSizeClass(width: number, height: number): string {
        const area = width * height;
        if (area < 2000) return 'manga-translator-bubble--small';
        if (area > 10000) return 'manga-translator-bubble--large';
        return 'manga-translator-bubble--medium';
    }

    /**
     * Create a translation bubble at the specified bounding box
     */
    createBubble(box: BoundingBox, translatedText: string): HTMLDivElement {
        const wrapper = this.ensureWrapper();
        const { scaleX, scaleY } = this.getScaleFactors();

        const left = box.x1 * scaleX;
        const top = box.y1 * scaleY;
        const width = (box.x2 - box.x1) * scaleX;
        const height = (box.y2 - box.y1) * scaleY;

        // Dynamic font sizing based on bubble height to prevent text clipping
        // Heuristic: scale font between 10px and 18px based on bubble height
        const fontSize = Math.max(10, Math.min(height / 4, 18));

        const bubble = document.createElement('div');
        const sizeClass = this.getSizeClass(width, height);
        bubble.className = `manga-translator-bubble ${sizeClass}`;
        bubble.textContent = translatedText;

        bubble.style.cssText = `
            position: absolute;
            left: ${left}px;
            top: ${top}px;
            width: ${width}px;
            height: ${height}px;
            font-size: ${fontSize}px;
        `;

        wrapper.appendChild(bubble);
        return bubble;
    }

    /**
     * Create a loading placeholder bubble
     */
    createLoadingBubble(box: BoundingBox): HTMLDivElement {
        const wrapper = this.ensureWrapper();
        const { scaleX, scaleY } = this.getScaleFactors();

        const left = box.x1 * scaleX;
        const top = box.y1 * scaleY;
        const width = (box.x2 - box.x1) * scaleX;
        const height = (box.y2 - box.y1) * scaleY;

        const bubble = document.createElement('div');
        bubble.className = 'manga-translator-bubble manga-translator-bubble--loading';
        bubble.textContent = '...';

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
